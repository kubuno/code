//! Runs code's own migrations and its representative statements against a real
//! server of **each** engine, from a single compiled binary — the proof that
//! the engine is a run-time choice, not a build-time one.
//!
//! * SQLite always runs (a temp file, no server).
//! * PostgreSQL runs when `KUBUNO_PG_TEST_URL` points at a throwaway database.
//! * MySQL/MariaDB runs when `KUBUNO_MYSQL_TEST_URL` does.
//!
//! ```sh
//! KUBUNO_PG_TEST_URL=postgres://u:p@localhost:5433/code \
//! KUBUNO_MYSQL_TEST_URL=mysql://u:p@localhost:3307/code \
//!   cargo test --test db_portability
//! ```
//!
//! The same binary contains all three drivers; each engine's suite is one test.
//!
//! `code` keeps its data access inside the handlers (coupled to `AppState`,
//! reqwest and the filesystem), so — unlike keestore's `vault_service` — there
//! is no thin service layer to call here. This suite therefore drives the pool
//! with the exact statements the handlers run: the generated-key insert, the
//! portable ordering, `count_bigint`, the dialect upsert and the reselect after
//! a guarded update.

use chrono::Utc;
use kubuno_code::models::{Extension, Project, UserEditorSettings};
use kubuno_code::SCHEMA;
use kubuno_db::dialect::Assign;
use kubuno_db::{new_id, params};
use uuid::Uuid;

fn base_settings(engine: &str) -> kubuno_db::DbSettings {
    kubuno_db::DbSettings {
        engine: engine.to_string(),
        url: None,
        host: None,
        port: None,
        user: None,
        password: None,
        database: None,
        path: None,
        max_connections: 4,
        min_connections: 0,
        connect_timeout: std::time::Duration::from_secs(10),
        run_migrations: true,
    }
}

/// Migrations only run one at a time: the PostgreSQL and MySQL suites may share
/// a server.
static EXCLUSIVE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn migrated_pool(settings: kubuno_db::DbSettings) -> (kubuno_db::DbPool, impl Sized) {
    let guard = EXCLUSIVE.lock().await;
    let pool = kubuno_db::connect(&settings, SCHEMA).await.expect("connect");

    // Exactly the calls `main.rs` makes.
    kubuno_db::migrations!(
        "./migrations/postgres",
        "./migrations/mysql",
        "./migrations/sqlite",
    )
    .run(&pool, SCHEMA)
    .await
    .expect("migrations");

    (pool, guard)
}

/// The statements the handlers run, in one pass: create a project with a
/// process-made key, read it back, list with the portable ordering, count,
/// update, upsert the editor settings, toggle an extension, and delete.
async fn full_suite(pool: &kubuno_db::DbPool) {
    let user = Uuid::new_v4();

    // ── POST /projects: generated key, insert without RETURNING, read back ──
    let id = new_id();
    pool.execute(
        "INSERT INTO code.projects
             (id, user_id, name, description, path, language, git_remote, files_folder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        params![
            id,
            user,
            "demo",
            Some("a project"),
            "/tmp/demo",
            Some("rust"),
            None::<&str>,
            None::<Uuid>,
        ],
    )
    .await
    .expect("insert project");

    let p = pool
        .fetch_one_as::<Project>("SELECT * FROM code.projects WHERE id = $1", params![id])
        .await
        .expect("reselect project");
    assert_eq!(p.id, id);
    assert_eq!(p.user_id, user);
    assert_eq!(p.name, "demo");
    assert_eq!(p.description.as_deref(), Some("a project"));
    assert_eq!(p.language.as_deref(), Some("rust"));
    assert!(p.git_remote.is_none());
    assert!(p.files_folder_id.is_none());
    assert!(p.last_opened_at.is_none());

    // ── a second project, so ordering and counting have something to sort ──
    let id2 = new_id();
    pool.execute(
        "INSERT INTO code.projects
             (id, user_id, name, description, path, language, git_remote, files_folder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        params![id2, user, "second", None::<&str>, "/tmp/second", None::<&str>, None::<&str>, None::<Uuid>],
    )
    .await
    .expect("insert second project");

    // Mark the first as opened; the portable `(col IS NULL)` ordering must then
    // float it above the never-opened one.
    pool.execute(
        "UPDATE code.projects SET last_opened_at = $1 WHERE id = $2",
        params![Utc::now(), id],
    )
    .await
    .expect("touch last_opened_at");

    let listed = pool
        .fetch_all_as::<Project>(
            "SELECT * FROM code.projects WHERE user_id = $1 \
             ORDER BY (last_opened_at IS NULL), last_opened_at DESC, updated_at DESC",
            params![user],
        )
        .await
        .expect("list projects");
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].id, id, "the opened project sorts first, NULLs last");

    // ── the per-user ceiling count (count_bigint decodes as i64 everywhere) ──
    let count_sql = format!(
        "SELECT {} FROM code.projects WHERE user_id = $1",
        pool.backend().count_bigint("*"),
    );
    let count: i64 = pool.fetch_scalar(&count_sql, params![user]).await.expect("count");
    assert_eq!(count, 2);

    // ── PATCH /projects/:id: guarded by the key, read back by the key ──
    // The handler resolves `description` in Rust and binds the final value;
    // only `language` uses COALESCE, so a NULL there keeps the stored language.
    pool.execute(
        "UPDATE code.projects
         SET name = $1, description = $2, path = $3,
             language = COALESCE($4, language), updated_at = $5
         WHERE id = $6",
        params!["renamed", Some("a project"), "/tmp/renamed", None::<&str>, Utc::now(), id],
    )
    .await
    .expect("update project");
    let p = pool
        .fetch_one_as::<Project>("SELECT * FROM code.projects WHERE id = $1", params![id])
        .await
        .expect("reselect updated");
    assert_eq!(p.name, "renamed");
    assert_eq!(p.description.as_deref(), Some("a project"));
    assert_eq!(p.language.as_deref(), Some("rust"), "COALESCE(NULL, language) keeps the language");

    // ── DELETE /projects/:id ──
    pool.execute("DELETE FROM code.projects WHERE id = $1", params![id])
        .await
        .expect("delete project");
    pool.execute("DELETE FROM code.projects WHERE id = $1", params![id2])
        .await
        .expect("delete second project");
    assert!(
        pool.fetch_optional_as::<Project>("SELECT * FROM code.projects WHERE id = $1", params![id])
            .await
            .expect("reselect deleted")
            .is_none(),
        "the project must be gone"
    );

    // ── PUT /settings: the dialect upsert, then read back ──
    let backend = pool.backend();
    let upsert = format!(
        "INSERT INTO code.user_settings (user_id, settings, updated_at) VALUES ($1, $2, $3){}",
        backend.upsert(
            "user_settings",
            &["user_id"],
            &[Assign::Incoming("settings"), Assign::Incoming("updated_at")],
        )
    );
    pool.execute(&upsert, params![user, serde_json::json!({"theme": "dark"}), Utc::now()])
        .await
        .expect("insert settings");
    // Second write on the same key must UPDATE, not insert a duplicate.
    pool.execute(&upsert, params![user, serde_json::json!({"theme": "light"}), Utc::now()])
        .await
        .expect("upsert settings");
    let s = pool
        .fetch_one_as::<UserEditorSettings>(
            "SELECT user_id, settings FROM code.user_settings WHERE user_id = $1",
            params![user],
        )
        .await
        .expect("reselect settings");
    assert_eq!(s.user_id, user);
    assert_eq!(s.settings["theme"], "light", "the upsert updated the row in place");

    // ── extensions: insert with a generated key, then toggle is_enabled ──
    let ext_id = new_id();
    pool.execute(
        "INSERT INTO code.extensions
             (id, user_id, publisher, name, version, display_name, description, install_path, manifest)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        params![
            ext_id,
            user,
            "acme",
            "linter",
            "1.0.0",
            Some("Acme Linter"),
            None::<&str>,
            "/tmp/ext",
            serde_json::json!({"name": "linter"}),
        ],
    )
    .await
    .expect("insert extension");

    let ext = pool
        .fetch_one_as::<Extension>("SELECT * FROM code.extensions WHERE id = $1", params![ext_id])
        .await
        .expect("reselect extension");
    assert!(ext.is_enabled, "is_enabled defaults to true");

    // `NOT is_enabled`, guarded by (id, user_id) — the toggle handler's write.
    pool.execute(
        "UPDATE code.extensions SET is_enabled = NOT is_enabled WHERE id = $1 AND user_id = $2",
        params![ext_id, user],
    )
    .await
    .expect("toggle extension");
    let ext = pool
        .fetch_optional_as::<Extension>(
            "SELECT * FROM code.extensions WHERE id = $1 AND user_id = $2",
            params![ext_id, user],
        )
        .await
        .expect("reselect toggled")
        .expect("still there");
    assert!(!ext.is_enabled, "the toggle flipped it off");

    // Wrong owner: the guard updates nothing and the reselect finds nothing.
    let missing = pool
        .fetch_optional_as::<Extension>(
            "SELECT * FROM code.extensions WHERE id = $1 AND user_id = $2",
            params![ext_id, Uuid::new_v4()],
        )
        .await
        .expect("reselect wrong owner");
    assert!(missing.is_none(), "another user must not see the extension");

    pool.execute("DELETE FROM code.extensions WHERE id = $1", params![ext_id])
        .await
        .expect("delete extension");
}

#[tokio::test]
async fn sqlite_from_the_one_binary() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut s = base_settings("sqlite");
    s.path = Some(dir.path().to_string_lossy().into_owned());
    let (pool, _keep) = migrated_pool(s).await;
    full_suite(&pool).await;
}

#[tokio::test]
async fn postgres_from_the_one_binary() {
    let Ok(url) = std::env::var("KUBUNO_PG_TEST_URL") else {
        eprintln!("skipping: KUBUNO_PG_TEST_URL not set");
        return;
    };
    let mut s = base_settings("postgres");
    s.url = Some(url);
    let (pool, _keep) = migrated_pool(s).await;
    full_suite(&pool).await;
}

#[tokio::test]
async fn mysql_from_the_one_binary() {
    let Ok(url) = std::env::var("KUBUNO_MYSQL_TEST_URL") else {
        eprintln!("skipping: KUBUNO_MYSQL_TEST_URL not set");
        return;
    };
    let mut s = base_settings("mysql");
    s.url = Some(url);
    let (pool, _keep) = migrated_pool(s).await;
    full_suite(&pool).await;
}
