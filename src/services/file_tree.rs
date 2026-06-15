use std::path::Path;

use crate::{errors::AppError, models::FileNode};

pub async fn list_dir(dir: &Path, root: &Path) -> Result<Vec<FileNode>, AppError> {
    let mut entries = tokio::fs::read_dir(dir).await?;
    let mut nodes   = Vec::new();

    while let Some(entry) = entries.next_entry().await? {
        let meta = entry.metadata().await?;
        let name = entry.file_name().to_string_lossy().into_owned();

        if name.starts_with('.') {
            continue;
        }

        let rel_path = entry.path()
            .strip_prefix(root)
            .unwrap_or(&entry.path())
            .to_string_lossy()
            .into_owned();

        nodes.push(FileNode {
            name,
            path:     rel_path,
            is_dir:   meta.is_dir(),
            size:     if meta.is_file() { Some(meta.len()) } else { None },
            children: None,
        });
    }

    // Dossiers en premier, puis fichiers, tri alphabétique
    nodes.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _             => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(nodes)
}

/// Détecte le langage principal d'un projet en regardant les extensions de fichiers.
pub fn detect_language(project_path: &Path) -> Option<String> {
    let mut counts: std::collections::HashMap<&'static str, usize> = std::collections::HashMap::new();

    let walker = walkdir::WalkDir::new(project_path)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file());

    for entry in walker {
        if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
            let lang = match ext {
                "rs"                          => "rust",
                "py"                          => "python",
                "ts" | "tsx"                  => "typescript",
                "js" | "jsx"                  => "javascript",
                "go"                          => "go",
                "c" | "h"                     => "c",
                "cpp" | "cc" | "cxx" | "hpp" => "cpp",
                "java"                        => "java",
                "kt"                          => "kotlin",
                "swift"                       => "swift",
                "rb"                          => "ruby",
                "php"                         => "php",
                "cs"                          => "csharp",
                "lua"                         => "lua",
                _                             => continue,
            };
            *counts.entry(lang).or_insert(0) += 1;
        }
    }

    counts
        .into_iter()
        .max_by_key(|(_, c)| *c)
        .map(|(lang, _)| lang.to_string())
}
