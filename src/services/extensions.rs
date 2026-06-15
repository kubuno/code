use std::io::Read;
use uuid::Uuid;

use crate::{
    errors::AppError,
    models::{Extension, ExtensionMarketEntry, InstallExtensionDto},
    state::AppState,
};

pub async fn search_registry(
    state:  &AppState,
    query:  &str,
) -> Result<Vec<ExtensionMarketEntry>, AppError> {
    let url = format!(
        "{}/-/search?query={}&size=20&sortBy=installs&sortOrder=desc",
        state.settings.code.extension_registry_url,
        urlencoding_simple(query),
    );

    let resp: serde_json::Value = state
        .http
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    let mut entries = Vec::new();
    if let Some(exts) = resp["extensions"].as_array() {
        for ext in exts {
            let publisher = ext["namespace"].as_str().unwrap_or("").to_string();
            let name      = ext["name"].as_str().unwrap_or("").to_string();
            let version   = ext["version"].as_str().unwrap_or("").to_string();
            let display   = ext["displayName"].as_str().unwrap_or(&name).to_string();
            let desc      = ext["description"].as_str().map(|s| s.to_string());
            let downloads = ext["downloadCount"].as_u64();

            if !publisher.is_empty() && !name.is_empty() {
                entries.push(ExtensionMarketEntry {
                    publisher, name, version, display_name: display, description: desc, downloads,
                });
            }
        }
    }

    Ok(entries)
}

/// Valide un segment (publisher/name/version) avant de l'injecter dans une URL
/// de registre ou un chemin disque. Empêche la traversée de chemin et l'altération
/// de l'URL (SSRF relative). Autorise uniquement `[A-Za-z0-9._-]`.
fn validate_segment(label: &str, value: &str) -> Result<(), AppError> {
    if value.is_empty() || value.len() > 100 {
        return Err(AppError::Validation(format!("{label} invalide")));
    }
    if !value.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')) {
        return Err(AppError::Validation(format!(
            "{label} contient des caractères non autorisés"
        )));
    }
    // « .. » serait accepté par le jeu de caractères ci-dessus mais permettrait
    // une traversée ; on le refuse explicitement.
    if value == "." || value == ".." || value.contains("..") {
        return Err(AppError::Validation(format!("{label} invalide")));
    }
    Ok(())
}

pub async fn install(
    state:   &AppState,
    user_id: Uuid,
    dto:     InstallExtensionDto,
) -> Result<Extension, AppError> {
    validate_segment("publisher", &dto.publisher)?;
    validate_segment("name", &dto.name)?;
    if let Some(ref v) = dto.version {
        validate_segment("version", v)?;
    }

    let version = match dto.version {
        Some(v) => v,
        None    => latest_version(state, &dto.publisher, &dto.name).await?,
    };
    validate_segment("version", &version)?;

    let vsix_url = format!(
        "{}/{}/{}/{}/file/{}.{}-{}.vsix",
        state.settings.code.extension_registry_url,
        dto.publisher,
        dto.name,
        version,
        dto.publisher,
        dto.name,
        version,
    );

    let bytes = state
        .http
        .get(&vsix_url)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .bytes()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    let install_path = std::path::PathBuf::from(&state.settings.code.extensions_dir)
        .join(user_id.to_string())
        .join(format!("{}.{}-{}", dto.publisher, dto.name, version));

    tokio::fs::create_dir_all(&install_path).await?;

    // Extraire le VSIX (ZIP)
    let bytes_clone = bytes.clone();
    let path_clone  = install_path.clone();
    let manifest = tokio::task::spawn_blocking(move || {
        extract_vsix(&bytes_clone, &path_clone)
    })
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
    .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    let display_name = manifest["displayName"]
        .as_str()
        .unwrap_or(&dto.name)
        .to_string();
    let description = manifest["description"].as_str().map(|s| s.to_string());

    let ext = sqlx::query_as::<_, Extension>(
        "INSERT INTO code.extensions (user_id, publisher, name, version, display_name, description, install_path, manifest)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *",
    )
    .bind(user_id)
    .bind(&dto.publisher)
    .bind(&dto.name)
    .bind(&version)
    .bind(&display_name)
    .bind(description.as_deref())
    .bind(install_path.to_string_lossy().as_ref())
    .bind(&manifest)
    .fetch_one(&state.db)
    .await?;

    Ok(ext)
}

/// Taille décompressée maximale autorisée pour un VSIX (anti zip-bomb).
const MAX_VSIX_UNCOMPRESSED: u64 = 256 * 1024 * 1024; // 256 Mo
/// Nombre maximal d'entrées dans l'archive (anti zip-bomb).
const MAX_VSIX_ENTRIES: usize = 20_000;

fn extract_vsix(bytes: &[u8], dest: &std::path::Path) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    use std::path::{Component, Path};

    let cursor = std::io::Cursor::new(bytes);
    let mut zip = zip::ZipArchive::new(cursor)?;

    if zip.len() > MAX_VSIX_ENTRIES {
        return Err("Archive VSIX : trop d'entrées".into());
    }

    // Racine canonique de destination : toute écriture doit rester en dessous.
    std::fs::create_dir_all(dest)?;
    let canonical_dest = dest.canonicalize()?;

    let mut manifest = serde_json::Value::Null;
    let mut total_uncompressed: u64 = 0;

    for i in 0..zip.len() {
        let mut file = zip.by_index(i)?;
        let name     = file.name().to_string();

        // Rejeter les entrées symlink (mode unix S_IFLNK) : elles permettent une
        // traversée ultérieure en écrivant « à travers » le lien.
        if let Some(mode) = file.unix_mode() {
            if mode & 0o170000 == 0o120000 {
                return Err(format!("Entrée symlink interdite dans le VSIX : {name}").into());
            }
        }

        let rel = name.trim_start_matches("extension/");

        // Refuser toute entrée dont un composant est `..`, une racine absolue ou un
        // préfixe (lecteur Windows) — c'est l'attaque « zip-slip ».
        let rel_path = Path::new(rel);
        let mut safe_rel = std::path::PathBuf::new();
        for comp in rel_path.components() {
            match comp {
                Component::Normal(c) => safe_rel.push(c),
                Component::CurDir    => {}
                Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                    return Err(format!("Entrée VSIX hors du répertoire cible : {name}").into());
                }
            }
        }
        if safe_rel.as_os_str().is_empty() {
            continue;
        }

        let outpath = canonical_dest.join(&safe_rel);

        if name.ends_with('/') {
            std::fs::create_dir_all(&outpath)?;
            continue;
        }

        if let Some(parent) = outpath.parent() {
            std::fs::create_dir_all(parent)?;
        }

        total_uncompressed = total_uncompressed.saturating_add(file.size());
        if total_uncompressed > MAX_VSIX_UNCOMPRESSED {
            return Err("Archive VSIX trop volumineuse une fois décompressée".into());
        }

        let mut content = Vec::new();
        file.read_to_end(&mut content)?;

        // Extraire le package.json de l'extension
        if name == "extension/package.json" {
            manifest = serde_json::from_slice(&content).unwrap_or(serde_json::Value::Null);
        }

        // Défense en profondeur : confirmer que la cible reste sous la racine.
        if !outpath.starts_with(&canonical_dest) {
            return Err(format!("Chemin d'extraction invalide : {name}").into());
        }

        std::fs::write(&outpath, content)?;
    }

    Ok(manifest)
}

async fn latest_version(state: &AppState, publisher: &str, name: &str) -> Result<String, AppError> {
    let url = format!(
        "{}/{}/{}",
        state.settings.code.extension_registry_url,
        publisher,
        name,
    );

    let resp: serde_json::Value = state
        .http
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    resp["version"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::NotFound("Extension introuvable dans le registre".into()))
}

fn urlencoding_simple(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c.to_string() } else { format!("%{:02X}", c as u32) })
        .collect()
}
