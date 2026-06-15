use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::{
    errors::AppError,
    middleware::AuthUser,
    models::{Extension as Ext, ExtensionMarketEntry, InstallExtensionDto},
    services::extensions as ext_svc,
    state::AppState,
};

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> Result<Json<Vec<Ext>>, AppError> {
    let exts = sqlx::query_as::<_, Ext>(
        "SELECT * FROM code.extensions WHERE user_id = $1 ORDER BY installed_at DESC",
    )
    .bind(user.user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(exts))
}

pub async fn search_market(
    State(state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    axum::extract::Query(q): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<ExtensionMarketEntry>>, AppError> {
    let query = q.get("q").cloned().unwrap_or_default();
    let results = ext_svc::search_registry(&state, &query).await?;
    Ok(Json(results))
}

pub async fn install(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(dto): Json<InstallExtensionDto>,
) -> Result<(StatusCode, Json<Ext>), AppError> {
    if dto.publisher.is_empty() || dto.name.is_empty() {
        return Err(AppError::Validation("publisher et name sont requis".into()));
    }

    // Vérifier qu'elle n'est pas déjà installée
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM code.extensions WHERE user_id = $1 AND publisher = $2 AND name = $3)",
    )
    .bind(user.user_id)
    .bind(&dto.publisher)
    .bind(&dto.name)
    .fetch_one(&state.db)
    .await?;

    if exists {
        return Err(AppError::Conflict("Extension déjà installée".into()));
    }

    let ext = ext_svc::install(&state, user.user_id, dto).await?;
    Ok((StatusCode::CREATED, Json(ext)))
}

pub async fn uninstall(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let ext: Option<Ext> = sqlx::query_as(
        "SELECT * FROM code.extensions WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user.user_id)
    .fetch_optional(&state.db)
    .await?;

    let ext = ext.ok_or_else(|| AppError::NotFound("Extension introuvable".into()))?;

    // Supprimer les fichiers
    tokio::fs::remove_dir_all(&ext.install_path).await.ok();

    sqlx::query("DELETE FROM code.extensions WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn toggle(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Ext>, AppError> {
    let ext = sqlx::query_as::<_, Ext>(
        "UPDATE code.extensions SET is_enabled = NOT is_enabled WHERE id = $1 AND user_id = $2 RETURNING *",
    )
    .bind(id)
    .bind(user.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Extension introuvable".into()))?;

    Ok(Json(ext))
}
