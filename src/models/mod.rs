use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Project {
    pub id:              Uuid,
    pub user_id:         Uuid,
    pub name:            String,
    pub description:     Option<String>,
    pub path:            String,
    pub language:        Option<String>,
    pub git_remote:      Option<String>,
    pub files_folder_id: Option<Uuid>,  // dossier lié dans le module files
    pub last_opened_at:  Option<DateTime<Utc>>,
    pub created_at:      DateTime<Utc>,
    pub updated_at:      DateTime<Utc>,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStorage {
    Local,  // répertoire sous projects_root (comportement par défaut)
    Files,  // dossier créé dans le module files (visible depuis l'explorateur)
}

impl Default for ProjectStorage {
    fn default() -> Self { Self::Local }
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectDto {
    pub name:        String,
    pub description: Option<String>,
    pub language:    Option<String>,
    pub git_clone:   Option<String>,  // clone depuis ce dépôt si fourni
    /// Où stocker le projet. "files" crée un dossier dans le module files.
    #[serde(default)]
    pub storage:     ProjectStorage,
    /// Dossier parent dans files (null = racine). Ignoré si storage != "files".
    pub files_parent_folder_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectDto {
    pub name:        Option<String>,
    pub description: Option<String>,
    pub language:    Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name:     String,
    pub path:     String,   // relatif à la racine du projet
    pub is_dir:   bool,
    pub size:     Option<u64>,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Deserialize)]
pub struct WriteFileDto {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct RenameDto {
    pub new_name: String,
}

#[derive(Debug, Serialize)]
pub struct GitStatus {
    pub branch:    String,
    pub ahead:     usize,
    pub behind:    usize,
    pub staged:    Vec<GitFileStatus>,
    pub unstaged:  Vec<GitFileStatus>,
    pub untracked: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct GitFileStatus {
    pub path:   String,
    pub status: String,  // "M" | "A" | "D" | "R" | "?"
}

#[derive(Debug, Deserialize)]
pub struct GitCommitDto {
    pub message: String,
    pub files:   Vec<String>,  // chemins à stager (vide = tout stager)
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Extension {
    pub id:           Uuid,
    pub user_id:      Uuid,
    pub publisher:    String,
    pub name:         String,
    pub version:      String,
    pub display_name: Option<String>,
    pub description:  Option<String>,
    pub install_path: String,
    pub manifest:     serde_json::Value,
    pub is_enabled:   bool,
    pub installed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionMarketEntry {
    pub publisher:    String,
    pub name:         String,
    pub version:      String,
    pub display_name: String,
    pub description:  Option<String>,
    pub downloads:    Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct InstallExtensionDto {
    pub publisher: String,
    pub name:      String,
    pub version:   Option<String>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct UserEditorSettings {
    pub user_id:  Uuid,
    pub settings: serde_json::Value,
}
