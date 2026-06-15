use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::{
    errors::AppError,
    middleware::AuthUser,
    models::{CreateProjectDto, Project, ProjectStorage, UpdateProjectDto},
    services::file_tree,
    state::AppState,
};

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> Result<Json<Vec<Project>>, AppError> {
    let projects = sqlx::query_as::<_, Project>(
        "SELECT * FROM code.projects WHERE user_id = $1 ORDER BY last_opened_at DESC NULLS LAST, updated_at DESC",
    )
    .bind(user.user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(projects))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(dto): Json<CreateProjectDto>,
) -> Result<(StatusCode, Json<Project>), AppError> {
    if dto.name.is_empty() || dto.name.contains('/') || dto.name.contains("..") {
        return Err(AppError::Validation("Nom de projet invalide".into()));
    }

    // Résolution du chemin et du files_folder_id selon le type de stockage choisi
    let (project_path, files_folder_id) = match dto.storage {
        ProjectStorage::Files => {
            let ipc_url = resolve_files_ipc_url(&state).await?;

            let resp = state
                .http
                .post(format!("{ipc_url}/ipc/folders"))
                .header("x-internal-secret", &state.settings.core.internal_secret)
                .json(&serde_json::json!({
                    "user_id":   user.user_id,
                    "name":      &dto.name,
                    "parent_id": dto.files_parent_folder_id,
                }))
                .send()
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("IPC files: {e}")))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(AppError::Internal(anyhow::anyhow!(
                    "IPC files/create_folder {status}: {body}"
                )));
            }

            let body: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("IPC parse: {e}")))?;

            let disk_path = body["disk_path"]
                .as_str()
                .ok_or_else(|| AppError::Internal(anyhow::anyhow!("IPC: disk_path manquant")))?
                .to_owned();

            let folder_id: Uuid = body["folder"]["id"]
                .as_str()
                .and_then(|s| s.parse().ok())
                .ok_or_else(|| AppError::Internal(anyhow::anyhow!("IPC: folder.id manquant")))?;

            (std::path::PathBuf::from(disk_path), Some(folder_id))
        }

        ProjectStorage::Local => {
            let path = std::path::PathBuf::from(&state.settings.code.projects_root)
                .join(user.user_id.to_string())
                .join(&dto.name);
            if path.exists() {
                return Err(AppError::Conflict("Un projet avec ce nom existe déjà".into()));
            }
            (path, None)
        }
    };

    // Clone ou crée le répertoire
    if let Some(ref remote) = dto.git_clone {
        validate_git_remote(remote)?;
        tokio::task::spawn_blocking({
            let path   = project_path.clone();
            let remote = remote.clone();
            move || git2::Repository::clone(&remote, &path)
        })
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .map_err(AppError::from)?;
    } else {
        tokio::fs::create_dir_all(&project_path).await?;
    }

    let language = dto.language
        .clone()
        .or_else(|| file_tree::detect_language(&project_path));

    let project = sqlx::query_as::<_, Project>(
        "INSERT INTO code.projects
             (user_id, name, description, path, language, git_remote, files_folder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *",
    )
    .bind(user.user_id)
    .bind(&dto.name)
    .bind(dto.description.as_deref())
    .bind(project_path.to_string_lossy().as_ref())
    .bind(language.as_deref())
    .bind(dto.git_clone.as_deref())
    .bind(files_folder_id)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(project)))
}

pub async fn get(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<Project>, AppError> {
    let project = fetch_owned(&state, user.user_id, id).await?;

    // Mise à jour last_opened_at
    sqlx::query("UPDATE code.projects SET last_opened_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(project))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(dto): Json<UpdateProjectDto>,
) -> Result<Json<Project>, AppError> {
    let project = fetch_owned(&state, user.user_id, id).await?;

    let new_name = dto.name.as_deref().unwrap_or(&project.name);
    if new_name.contains('/') || new_name.contains("..") {
        return Err(AppError::Validation("Nom de projet invalide".into()));
    }

    // Renommer le répertoire si besoin
    let new_path = if let Some(ref name) = dto.name {
        let p = std::path::PathBuf::from(&state.settings.code.projects_root)
            .join(user.user_id.to_string())
            .join(name);
        tokio::fs::rename(&project.path, &p).await?;
        p.to_string_lossy().into_owned()
    } else {
        project.path.clone()
    };

    let updated = sqlx::query_as::<_, Project>(
        "UPDATE code.projects
         SET name = $1, description = $2, path = $3, language = COALESCE($4, language), updated_at = NOW()
         WHERE id = $5
         RETURNING *",
    )
    .bind(new_name)
    .bind(dto.description.as_deref().or(project.description.as_deref()))
    .bind(&new_path)
    .bind(dto.language.as_deref())
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(updated))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let project = fetch_owned(&state, user.user_id, id).await?;

    // Supprimer le répertoire physique
    tokio::fs::remove_dir_all(&project.path).await.ok();

    sqlx::query("DELETE FROM code.projects WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ── helpers ──────────────────────────────────────────────────────────────────

/// Valide une URL de clone Git fournie par l'utilisateur.
///
/// Bloque :
/// - les schémas autres que `https` (interdit `file://`, `ssh://`, `git://`,
///   `ext::…`, chemins locaux) — empêche la lecture de fichiers locaux et
///   l'exécution de transports arbitraires ;
/// - les hôtes loopback / privés / link-local / localhost — empêche le SSRF vers
///   les services internes et les endpoints de métadonnées cloud (169.254.169.254).
fn validate_git_remote(remote: &str) -> Result<(), AppError> {
    let url = reqwest::Url::parse(remote)
        .map_err(|_| AppError::Validation("URL de dépôt Git invalide".into()))?;

    if url.scheme() != "https" {
        return Err(AppError::Validation(
            "Seules les URL https:// sont autorisées pour le clonage Git".into(),
        ));
    }

    let host = url
        .host_str()
        .ok_or_else(|| AppError::Validation("Hôte du dépôt Git manquant".into()))?;

    let host_lower = host.to_ascii_lowercase();
    if host_lower == "localhost"
        || host_lower.ends_with(".localhost")
        || host_lower.ends_with(".local")
        || host_lower.ends_with(".internal")
    {
        return Err(AppError::Validation("Hôte de dépôt Git non autorisé".into()));
    }

    // Si l'hôte est une IP littérale, refuser les plages non routables/internes.
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        let blocked = match ip {
            std::net::IpAddr::V4(v4) => {
                v4.is_loopback()
                    || v4.is_private()
                    || v4.is_link_local()
                    || v4.is_broadcast()
                    || v4.is_unspecified()
                    || v4.octets()[0] == 0
                    // CGNAT 100.64.0.0/10
                    || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xC0) == 0x40)
            }
            std::net::IpAddr::V6(v6) => {
                v6.is_loopback()
                    || v6.is_unspecified()
                    // unique-local fc00::/7
                    || (v6.segments()[0] & 0xFE00) == 0xFC00
                    // link-local fe80::/10
                    || (v6.segments()[0] & 0xFFC0) == 0xFE80
                    // IPv4-mapped : appliquer les règles IPv4
                    || v6.to_ipv4().map(|m| {
                        m.is_loopback() || m.is_private() || m.is_link_local() || m.is_unspecified()
                    }).unwrap_or(false)
            }
        };
        if blocked {
            return Err(AppError::Validation(
                "Clonage vers une adresse interne/privée interdit".into(),
            ));
        }
    }

    Ok(())
}

/// Résout le base_url IPC du module drive.
/// Priorité : config explicite → découverte depuis le registre du core.
async fn resolve_files_ipc_url(state: &AppState) -> Result<String, AppError> {
    if let Some(url) = state.settings.code.files_ipc_url.as_deref() {
        return Ok(url.trim_end_matches('/').to_owned());
    }

    // Découverte dynamique : GET {core_url}/api/v1/modules
    let core_url = state.settings.core.url.trim_end_matches('/');
    let resp = state
        .http
        .get(format!("{core_url}/api/v1/modules"))
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Registre modules inaccessible: {e}")))?;

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Registre modules: parse erreur: {e}")))?;

    body["modules"]
        .as_array()
        .and_then(|arr| arr.iter().find(|m| m["module_id"].as_str() == Some("drive")))
        .and_then(|m| m["base_url"].as_str())
        .map(|url| url.trim_end_matches('/').to_owned())
        .ok_or_else(|| AppError::Validation(
            "Le module drive n'est pas actif sur cette instance".into(),
        ))
}

async fn fetch_owned(state: &AppState, user_id: Uuid, id: Uuid) -> Result<Project, AppError> {
    let p = sqlx::query_as::<_, Project>(
        "SELECT * FROM code.projects WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Projet introuvable".into()))?;

    if p.user_id != user_id {
        return Err(AppError::Forbidden);
    }
    Ok(p)
}
