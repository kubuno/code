-- SQLite. `code` is an ATTACHed database file, attached on every pooled
-- connection by kubuno-db, so the qualified names below resolve as they do on
-- the other two engines.
--
-- Differences from the PostgreSQL file, and why:
--   * UUID -> BLOB: what sqlx encodes a `uuid::Uuid` as on SQLite.
--   * No DEFAULT on `id`: SQLite has no UUID generator; the process supplies the
--     key (kubuno_db::new_id()), bound explicitly.
--   * TIMESTAMPTZ -> TEXT, in the `%F %T%.f` shape sqlx decodes into
--     DateTime<Utc>. Every value written is UTC.
--   * JSONB -> TEXT; the application always binds the value, so no DEFAULT.
--   * foreign_keys is ON (set by kubuno-db), so the CASCADE below is enforced.

CREATE TABLE code.projects (
    id             BLOB    NOT NULL PRIMARY KEY,
    user_id        BLOB    NOT NULL,
    name           TEXT    NOT NULL,
    description    TEXT,
    path           TEXT    NOT NULL,
    language       TEXT,
    git_remote     TEXT,
    last_opened_at TEXT,
    created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    UNIQUE (user_id, path)
);

CREATE INDEX code.idx_code_projects_user    ON projects (user_id);
CREATE INDEX code.idx_code_projects_updated ON projects (updated_at DESC);

CREATE TABLE code.editor_sessions (
    id           BLOB NOT NULL PRIMARY KEY,
    project_id   BLOB NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id      BLOB NOT NULL,
    file_path    TEXT NOT NULL,
    started_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

CREATE INDEX code.idx_code_sessions_project ON editor_sessions (project_id);
CREATE INDEX code.idx_code_sessions_user    ON editor_sessions (user_id);

CREATE TABLE code.user_settings (
    user_id    BLOB NOT NULL PRIMARY KEY,
    settings   TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
