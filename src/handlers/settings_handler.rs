use axum::{
    extract::{Extension, State},
    Json,
};
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
    let settings = sqlx::query_as::<_, UserEditorSettings>(
        "SELECT * FROM code.user_settings WHERE user_id = $1",
    )
    .bind(user.user_id)
    .fetch_optional(&state.db)
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
    let settings = sqlx::query_as::<_, UserEditorSettings>(
        "INSERT INTO code.user_settings (user_id, settings)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET settings = $2, updated_at = NOW()
         RETURNING *",
    )
    .bind(user.user_id)
    .bind(&body)
    .fetch_one(&state.db)
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
