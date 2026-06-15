use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::{
    errors::AppError,
    middleware::AuthUser,
    models::{GitCommitDto, GitStatus},
    services::git as git_svc,
    state::AppState,
};

pub async fn status(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<GitStatus>, AppError> {
    let root = project_root(&state, user.user_id, project_id).await?;
    let status = tokio::task::spawn_blocking(move || git_svc::status(&root))
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .map_err(AppError::from)?;
    Ok(Json(status))
}

pub async fn diff(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((project_id, tail)): Path<(Uuid, String)>,
) -> Result<String, AppError> {
    let root = project_root(&state, user.user_id, project_id).await?;
    let diff = tokio::task::spawn_blocking(move || git_svc::diff_file(&root, &tail))
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .map_err(AppError::from)?;
    Ok(diff)
}

pub async fn commit(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Json(dto): Json<GitCommitDto>,
) -> Result<StatusCode, AppError> {
    if dto.message.trim().is_empty() {
        return Err(AppError::Validation("Le message de commit est requis".into()));
    }
    let root = project_root(&state, user.user_id, project_id).await?;
    let email = user.email.clone();
    let name  = user.email.split('@').next().unwrap_or("Kubuno User").to_string();
    tokio::task::spawn_blocking(move || git_svc::commit(&root, &dto.message, &name, &email, &dto.files))
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .map_err(AppError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn init(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let root = project_root(&state, user.user_id, project_id).await?;
    tokio::task::spawn_blocking(move || git_svc::init(&root))
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .map_err(AppError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

// ── helpers ──────────────────────────────────────────────────────────────────

async fn project_root(
    state: &AppState,
    user_id: Uuid,
    project_id: Uuid,
) -> Result<std::path::PathBuf, AppError> {
    let path: String = sqlx::query_scalar(
        "SELECT path FROM code.projects WHERE id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Projet introuvable".into()))?;

    Ok(std::path::PathBuf::from(path))
}
