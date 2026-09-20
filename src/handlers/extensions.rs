use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use kubuno_db::params;
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
    let exts = state
        .db
        .fetch_all_as::<Ext>(
            "SELECT * FROM code.extensions WHERE user_id = $1 ORDER BY installed_at DESC",
            params![user.user_id],
        )
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

    // Vérifier qu'elle n'est pas déjà installée. `SELECT 1 ... LIMIT 1` decoded
    // as an optional scalar is portable across the three engines, where
    // `SELECT EXISTS(...)` returns a boolean on PostgreSQL but an integer on
    // MySQL/SQLite.
    let exists = state
        .db
        .fetch_optional_scalar::<i32>(
            "SELECT 1 FROM code.extensions WHERE user_id = $1 AND publisher = $2 AND name = $3 LIMIT 1",
            params![user.user_id, &dto.publisher, &dto.name],
        )
        .await?
        .is_some();

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
    let ext: Option<Ext> = state
        .db
        .fetch_optional_as::<Ext>(
            "SELECT * FROM code.extensions WHERE id = $1 AND user_id = $2",
            params![id, user.user_id],
        )
        .await?;

    let ext = ext.ok_or_else(|| AppError::NotFound("Extension introuvable".into()))?;

    // Supprimer les fichiers
    tokio::fs::remove_dir_all(&ext.install_path).await.ok();

    state
        .db
        .execute("DELETE FROM code.extensions WHERE id = $1", params![id])
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn toggle(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Ext>, AppError> {
    // The update is guarded by (id, user_id), neither of which it changes, so
    // reading the row back by the same guard is exact on the engines without
    // RETURNING: a mismatch updates nothing and the re-select then finds nothing.
    state
        .db
        .execute(
            "UPDATE code.extensions SET is_enabled = NOT is_enabled WHERE id = $1 AND user_id = $2",
            params![id, user.user_id],
        )
        .await?;

    let ext = state
        .db
        .fetch_optional_as::<Ext>(
            "SELECT * FROM code.extensions WHERE id = $1 AND user_id = $2",
            params![id, user.user_id],
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Extension introuvable".into()))?;

    Ok(Json(ext))
}
