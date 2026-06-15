use axum::{
    body::Body,
    extract::{Extension, Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    errors::AppError,
    middleware::AuthUser,
    models::{FileNode, RenameDto, WriteFileDto},
    services::file_tree,
    state::AppState,
};

#[derive(Deserialize)]
pub struct FilePath {
    #[serde(rename = "path")]
    pub rel_path: Option<String>,
}

pub async fn tree(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(project_id): Path<Uuid>,
    Query(q): Query<FilePath>,
) -> Result<Json<Vec<FileNode>>, AppError> {
    let root = project_root(&state, user.user_id, project_id).await?;
    let dir  = match q.rel_path {
        Some(ref p) => safe_join(&root, p)?,
        None        => root.clone(),
    };

    let nodes = file_tree::list_dir(&dir, &root).await?;
    Ok(Json(nodes))
}

pub async fn read_file(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((project_id, tail)): Path<(Uuid, String)>,
) -> Result<Response, AppError> {
    let root     = project_root(&state, user.user_id, project_id).await?;
    let abs_path = safe_join(&root, &tail)?;

    let metadata = tokio::fs::metadata(&abs_path).await
        .map_err(|_| AppError::NotFound("Fichier introuvable".into()))?;

    if metadata.len() > state.settings.code.max_file_bytes {
        return Err(AppError::FileTooLarge);
    }

    let content = tokio::fs::read(&abs_path).await?;
    let mime    = mime_guess::from_path(&abs_path)
        .first_or_octet_stream()
        .to_string();

    Response::builder()
        .status(200)
        .header(header::CONTENT_TYPE, mime)
        .body(Body::from(content))
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))
}

pub async fn write_file(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((project_id, tail)): Path<(Uuid, String)>,
    Json(dto): Json<WriteFileDto>,
) -> Result<StatusCode, AppError> {
    let root     = project_root(&state, user.user_id, project_id).await?;
    let abs_path = safe_join(&root, &tail)?;

    if let Some(parent) = abs_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let bytes = dto.content.as_bytes().len() as u64;
    if bytes > state.settings.code.max_file_bytes {
        return Err(AppError::FileTooLarge);
    }

    tokio::fs::write(&abs_path, dto.content.as_bytes()).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_path(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((project_id, tail)): Path<(Uuid, String)>,
) -> Result<StatusCode, AppError> {
    let root     = project_root(&state, user.user_id, project_id).await?;
    let abs_path = safe_join(&root, &tail)?;

    let meta = tokio::fs::metadata(&abs_path).await
        .map_err(|_| AppError::NotFound("Chemin introuvable".into()))?;

    if meta.is_dir() {
        tokio::fs::remove_dir_all(&abs_path).await?;
    } else {
        tokio::fs::remove_file(&abs_path).await?;
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn rename_path(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((project_id, tail)): Path<(Uuid, String)>,
    Json(dto): Json<RenameDto>,
) -> Result<StatusCode, AppError> {
    let root     = project_root(&state, user.user_id, project_id).await?;
    let abs_path = safe_join(&root, &tail)?;

    if dto.new_name.contains('/') || dto.new_name.contains("..") {
        return Err(AppError::Validation("Nom invalide".into()));
    }

    let new_path = abs_path.parent()
        .ok_or(AppError::InvalidPath)?
        .join(&dto.new_name);

    tokio::fs::rename(&abs_path, &new_path).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_dir(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((project_id, tail)): Path<(Uuid, String)>,
) -> Result<StatusCode, AppError> {
    let root     = project_root(&state, user.user_id, project_id).await?;
    let abs_path = safe_join(&root, &tail)?;

    tokio::fs::create_dir_all(&abs_path).await?;
    Ok(StatusCode::CREATED)
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

/// Joint `rel` à `root` en garantissant que le résultat reste sous `root`,
/// y compris pour des chemins inexistants (écriture/mkdir).
///
/// Contrairement à une normalisation purement lexicale, on :
/// 1. refuse tout composant `..` / racine absolue (pas de traversée) ;
/// 2. résout les symlinks de l'ancêtre existant le plus profond et vérifie qu'il
///    reste sous la racine canonique — un répertoire intermédiaire qui serait un
///    symlink vers l'extérieur (planté via un repo cloné ou un VSIX) est ainsi
///    rejeté, fermant l'évasion par symlink à l'écriture.
///
/// Note : une fenêtre TOCTOU résiduelle subsiste (un composant peut être remplacé
/// par un symlink entre la vérification et l'écriture) ; l'idéal serait
/// `openat2(RESOLVE_BENEATH)`, mais cette vérification couvre les vecteurs réels.
fn safe_join(root: &std::path::Path, rel: &str) -> Result<std::path::PathBuf, AppError> {
    use std::path::{Component, Path, PathBuf};

    let canonical_root = root.canonicalize().map_err(|_| AppError::InvalidPath)?;

    // 1. Construire un chemin relatif sûr (aucun `..`, aucune racine absolue).
    let cleaned = rel.trim_start_matches('/');
    let mut safe_rel = PathBuf::new();
    for comp in Path::new(cleaned).components() {
        match comp {
            Component::Normal(c) => safe_rel.push(c),
            Component::CurDir    => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::InvalidPath);
            }
        }
    }

    let joined = canonical_root.join(&safe_rel);

    // 2. Trouver l'ancêtre existant le plus profond, le canonicaliser (résout les
    //    symlinks), puis ré-attacher les composants encore inexistants.
    let mut remaining: Vec<std::ffi::OsString> = Vec::new();
    let mut cur = joined.clone();
    let canonical_existing = loop {
        match cur.canonicalize() {
            Ok(p) => break p,
            Err(_) => match cur.file_name() {
                Some(name) => {
                    remaining.push(name.to_os_string());
                    cur.pop();
                }
                None => return Err(AppError::InvalidPath),
            },
        }
    };

    if !canonical_existing.starts_with(&canonical_root) {
        return Err(AppError::InvalidPath);
    }

    let mut final_path = canonical_existing;
    for name in remaining.iter().rev() {
        final_path.push(name);
    }

    if !final_path.starts_with(&canonical_root) {
        return Err(AppError::InvalidPath);
    }
    Ok(final_path)
}
