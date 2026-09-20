use axum::{
    extract::{Extension, State},
    Json,
};
use chrono::Utc;
use kubuno_db::dialect::Assign;
use kubuno_db::params;
use crate::{
    errors::AppError,
    middleware::AuthUser,
    models::UserEditorSettings,
    state::AppState,
};

pub async fn get_settings(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> Result<Json<UserEditorSettings>, AppError> {
    // Only the columns the struct decodes: `updated_at` is not part of it, and
    // `SELECT *` would hand sqlx a column with no field to bind it to.
    let settings = state
        .db
        .fetch_optional_as::<UserEditorSettings>(
            "SELECT user_id, settings FROM code.user_settings WHERE user_id = $1",
            params![user.user_id],
        )
        .await?
        .unwrap_or_else(|| UserEditorSettings {
            user_id:  user.user_id,
            settings: serde_json::json!({}),
        });

    Ok(Json(settings))
}

pub async fn update_settings(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<UserEditorSettings>, AppError> {
    // Upsert on the primary key. `updated_at` is bound from the process rather
    // than `NOW()` (spelled differently on each engine), and the conflict branch
    // re-uses the *incoming* row (`excluded` / `VALUES`) instead of re-binding a
    // placeholder, which the runtime rejects.
    let backend = state.db.backend();
    let now = Utc::now();
    let insert = format!(
        "INSERT INTO code.user_settings (user_id, settings, updated_at) VALUES ($1, $2, $3){}",
        backend.upsert(
            "user_settings",
            &["user_id"],
            &[Assign::Incoming("settings"), Assign::Incoming("updated_at")],
        )
    );
    state
        .db
        .execute(&insert, params![user.user_id, body, now])
        .await?;

    let settings = state
        .db
        .fetch_one_as::<UserEditorSettings>(
            "SELECT user_id, settings FROM code.user_settings WHERE user_id = $1",
            params![user.user_id],
        )
        .await?;

    Ok(Json(settings))
}

pub async fn settings_page(
    State(_state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "module": "code",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
