use std::path::Path;

use git2::{Repository, StatusOptions};

use crate::{
    errors::AppError,
    models::{GitFileStatus, GitStatus},
};

pub fn init(path: &Path) -> Result<(), AppError> {
    Repository::init(path)?;
    Ok(())
}

pub fn status(path: &Path) -> Result<GitStatus, AppError> {
    let repo = Repository::open(path).map_err(|e| AppError::Git(format!("Pas un dépôt Git : {e}")))?;

    let branch = repo.head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "HEAD".into());

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo.statuses(Some(&mut opts))?;

    let mut staged    = Vec::new();
    let mut unstaged  = Vec::new();
    let mut untracked = Vec::new();

    for entry in statuses.iter() {
        let path_str = entry.path().unwrap_or("?").to_string();
        let status   = entry.status();

        if status.is_index_new()
            || status.is_index_modified()
            || status.is_index_deleted()
            || status.is_index_renamed()
            || status.is_index_typechange()
        {
            let s = if status.is_index_new()      { "A" }
                else if status.is_index_modified() { "M" }
                else if status.is_index_deleted()  { "D" }
                else if status.is_index_renamed()  { "R" }
                else                               { "T" };
            staged.push(GitFileStatus { path: path_str.clone(), status: s.into() });
        }

        if status.is_wt_new() {
            untracked.push(path_str.clone());
        } else if status.is_wt_modified() || status.is_wt_deleted() || status.is_wt_typechange() {
            let s = if status.is_wt_modified() { "M" }
                else if status.is_wt_deleted() { "D" }
                else                           { "T" };
            unstaged.push(GitFileStatus { path: path_str, status: s.into() });
        }
    }

    // ahead/behind vis-à-vis de l'upstream
    let (ahead, behind) = repo.head().ok()
        .and_then(|head| head.resolve().ok())
        .and_then(|head| {
            let upstream = repo.branch_upstream_name(head.name()?).ok()?;
            let upstream_ref = repo.find_reference(upstream.as_str().unwrap_or("")).ok()?;
            let local_oid    = head.target()?;
            let upstream_oid = upstream_ref.target()?;
            repo.graph_ahead_behind(local_oid, upstream_oid).ok()
        })
        .unwrap_or((0, 0));

    Ok(GitStatus { branch, ahead, behind, staged, unstaged, untracked })
}

pub fn diff_file(path: &Path, rel_file: &str) -> Result<String, AppError> {
    let repo = Repository::open(path).map_err(|e| AppError::Git(e.message().to_string()))?;

    let head  = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let diff  = repo.diff_tree_to_workdir_with_index(head.as_ref(), None)?;

    let mut result = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let file_path = _delta.new_file().path()
            .and_then(|p| p.to_str())
            .unwrap_or("");
        if file_path == rel_file || rel_file.is_empty() {
            let origin = line.origin();
            let content = std::str::from_utf8(line.content()).unwrap_or("");
            result.push(origin);
            result.push_str(content);
        }
        true
    })?;

    Ok(result)
}

pub fn commit(
    path:    &Path,
    message: &str,
    name:    &str,
    email:   &str,
    files:   &[String],
) -> Result<(), AppError> {
    let repo = Repository::open(path).map_err(|e| AppError::Git(e.message().to_string()))?;
    let mut index = repo.index()?;

    if files.is_empty() {
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    } else {
        for f in files {
            index.add_path(std::path::Path::new(f))?;
        }
    }
    index.write()?;

    let tree_oid = index.write_tree()?;
    let tree     = repo.find_tree(tree_oid)?;
    let sig      = git2::Signature::now(name, email)?;

    let parent_commit = repo.head()
        .ok()
        .and_then(|h| h.resolve().ok())
        .and_then(|h| h.target())
        .and_then(|oid| repo.find_commit(oid).ok());

    let parents: Vec<&git2::Commit<'_>> = parent_commit.as_ref().map(|c| vec![c]).unwrap_or_default();

    repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)?;
    Ok(())
}
