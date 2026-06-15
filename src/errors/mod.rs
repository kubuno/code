use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Non authentifié")]
    Unauthorized,

    #[error("Accès refusé")]
    Forbidden,

    #[error("Ressource introuvable: {0}")]
    NotFound(String),

    #[error("Données invalides: {0}")]
    Validation(String),

    #[error("Conflit: {0}")]
    Conflict(String),

    #[error("Fichier trop volumineux")]
    FileTooLarge,

    #[error("Chemin invalide")]
    InvalidPath,

    #[error("Git: {0}")]
    Git(String),

    #[error("Erreur base de données")]
    Database(#[from] sqlx::Error),

    #[error("Erreur interne")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::Unauthorized   => (StatusCode::UNAUTHORIZED,           "unauthorized",   self.to_string()),
            AppError::Forbidden      => (StatusCode::FORBIDDEN,              "forbidden",      self.to_string()),
            AppError::NotFound(m)    => (StatusCode::NOT_FOUND,              "not_found",      m.clone()),
            AppError::Validation(m)  => (StatusCode::UNPROCESSABLE_ENTITY,   "validation",     m.clone()),
            AppError::Conflict(m)    => (StatusCode::CONFLICT,               "conflict",       m.clone()),
            AppError::FileTooLarge   => (StatusCode::PAYLOAD_TOO_LARGE,      "file_too_large", self.to_string()),
            AppError::InvalidPath    => (StatusCode::BAD_REQUEST,            "invalid_path",   self.to_string()),
            AppError::Git(m)         => (StatusCode::UNPROCESSABLE_ENTITY,   "git_error",      m.clone()),
            AppError::Database(e)    => {
                tracing::error!(error = %e, "Database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "database_error", "Erreur base de données".into())
            }
            AppError::Internal(e)    => {
                tracing::error!(error = %e, "Internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", "Erreur interne".into())
            }
        };
        (status, Json(json!({ "error": code, "message": message }))).into_response()
    }
}

impl From<git2::Error> for AppError {
    fn from(e: git2::Error) -> Self {
        AppError::Git(e.message().to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Internal(anyhow::anyhow!(e))
    }
}
