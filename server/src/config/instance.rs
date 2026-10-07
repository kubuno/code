//! Instance-wide settings of the code module, as the administrator left them in
//! the console.
//!
//! Declared by `module.toml`'s `[[settings]]`, stored in `core.settings`, and read
//! back here through `/internal/modules/code/settings` — a module owns its own
//! schema and cannot read the core's tables, and a background worker has no user
//! token for the public config route. The module is named in the URL so the read
//! works whether the instance shares one master secret or a derived one per
//! module.
//!
//! Every field here is read by code that acts on it: a knob that changes nothing
//! is worse than an absent one. Only two of the STATIC `config.toml` values are
//! promoted — both already applied at runtime: the per-file size ceiling
//! (`max_file_bytes`, enforced on read AND write) and the extension registry URL
//! (`extension_registry_url`, used by every registry call).
//!
//! `max_file_bytes` is exposed and stored in BYTES (not MiB): the read points in
//! `handlers::files` compare a byte count directly, so keeping the unit identical
//! avoids a hidden conversion. The default matches `Settings::load` (8 MiB).

use serde_json::Value;

#[derive(Debug, Clone)]
pub struct InstanceConfig {
    /// Ceiling, in BYTES, on a single file read or written through the editor.
    /// Field type mirrors `CodeSettings::max_file_bytes` (`u64`).
    pub max_file_bytes: u64,
    /// Base URL of the VS Code extension registry (Open VSX API by default).
    pub extension_registry_url: String,
    /// Whether a project may be created by cloning a remote repository at all.
    /// When `false`, `git_clone` is refused outright and the module makes no
    /// outbound Git connection on a user's behalf.
    pub allow_git_clone: bool,
    /// Hosts a repository may be cloned FROM, one per line as entered in the
    /// console. Empty (the shipped state) means "no allowlist": cloning is
    /// governed by the built-in scheme/private-address refusals alone.
    ///
    /// This list only ever NARROWS what is reachable. It is applied AFTER every
    /// built-in refusal, never instead of one.
    pub git_clone_allowed_hosts: Vec<String>,
    /// Ceiling on the number of projects a single user may own.
    /// `0` means "no limit", which is the shipped behaviour.
    pub max_projects_per_user: u64,
}

/// Normalises one line of the host allowlist: trims it, drops a comment line,
/// lowercases it, and tolerates an entry pasted as a URL or with a leading dot
/// (`https://github.com/`, `.github.com` → `github.com`). Returns `None` for a
/// line that carries no host.
fn normalize_host_entry(line: &str) -> Option<String> {
    let mut s = line.trim();
    if s.is_empty() || s.starts_with('#') {
        return None;
    }
    // An entry pasted as a URL: keep only the authority part.
    if let Some(rest) = s.split("://").nth(1) {
        s = rest;
    }
    let s = s.split('/').next().unwrap_or(s);
    // Drop a userinfo prefix and a port suffix if the admin pasted one.
    let s = s.rsplit('@').next().unwrap_or(s);
    let s = s.split(':').next().unwrap_or(s);
    let s = s.trim().trim_start_matches('.').trim_end_matches('.');
    if s.is_empty() {
        return None;
    }
    Some(s.to_ascii_lowercase())
}

/// Whether `host` is covered by `allowlist`.
///
/// An entry matches the host itself or any SUBDOMAIN of it, and the subdomain
/// test requires a dot boundary so that `github.com` never matches
/// `evilgithub.com`. An empty allowlist matches everything — the list is opt-in.
pub fn host_is_allowed(host: &str, allowlist: &[String]) -> bool {
    if allowlist.is_empty() {
        return true;
    }
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    allowlist.iter().any(|entry| {
        host == *entry || host.ends_with(&format!(".{entry}"))
    })
}

impl Default for InstanceConfig {
    fn default() -> Self {
        Self {
            // Same defaults as `Settings::load` in `config/settings.rs`.
            max_file_bytes:         8_388_608, // 8 MiB
            extension_registry_url: "https://open-vsx.org/api".to_string(),
            allow_git_clone:        true,
            git_clone_allowed_hosts: Vec::new(), // no allowlist
            max_projects_per_user:  0,           // no limit
        }
    }
}

impl InstanceConfig {
    /// Maps the core's `{key: value}` object onto the struct. Every read falls
    /// back to the compiled default rather than to a permissive value; a
    /// non-positive or out-of-range size is treated as a mistake and ignored.
    /// An empty registry URL is ignored too (a blank field must not disable the
    /// marketplace), so the compiled default is kept in that case.
    pub fn from_settings(settings: &Value) -> Self {
        let d = Self::default();

        // Accept a strictly positive size within a sane ceiling (1 GiB); anything
        // else (missing, zero, negative, absurd) keeps the compiled default.
        let max_file_bytes = settings
            .get("max_file_bytes")
            .and_then(Value::as_i64)
            .filter(|n| (1..=1_073_741_824).contains(n))
            .map(|n| n as u64)
            .unwrap_or(d.max_file_bytes);

        let extension_registry_url = settings
            .get("extension_registry_url")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or(d.extension_registry_url);

        let allow_git_clone = settings
            .get("allow_git_clone")
            .and_then(Value::as_bool)
            .unwrap_or(d.allow_git_clone);

        // A multiline text field: one host per line. Anything unparseable is
        // dropped rather than widening the list.
        let git_clone_allowed_hosts = settings
            .get("git_clone_allowed_hosts")
            .and_then(Value::as_str)
            .map(|s| s.lines().filter_map(normalize_host_entry).collect::<Vec<_>>())
            .unwrap_or(d.git_clone_allowed_hosts);

        // `0` means "no limit", so it is a legal value and the range starts at it.
        let max_projects_per_user = settings
            .get("max_projects_per_user")
            .and_then(Value::as_i64)
            .filter(|n| (0..=100_000).contains(n))
            .map(|n| n as u64)
            .unwrap_or(d.max_projects_per_user);

        Self {
            max_file_bytes,
            extension_registry_url,
            allow_git_clone,
            git_clone_allowed_hosts,
            max_projects_per_user,
        }
    }
}

/// Reads the instance settings from the core. Any failure yields `None`, so the
/// caller keeps the values it already had rather than reverting to defaults
/// because the core was briefly unreachable.
pub async fn fetch(http: &reqwest::Client, core_url: &str, secret: &str) -> Option<InstanceConfig> {
    let url = format!("{core_url}/internal/modules/code/settings");
    let resp = http
        .get(&url)
        .header("X-Internal-Secret", secret)
        .send()
        .await
        .map_err(|e| tracing::warn!(error = %e, "Lecture des réglages d'instance code"))
        .ok()?;

    if !resp.status().is_success() {
        tracing::warn!(status = %resp.status(), "Réglages d'instance code refusés par le core");
        return None;
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| tracing::warn!(error = %e, "Réglages d'instance code : réponse illisible"))
        .ok()?;

    Some(InstanceConfig::from_settings(body.get("settings")?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_keys_keep_the_compiled_defaults() {
        let c = InstanceConfig::from_settings(&json!({}));
        assert_eq!(c.max_file_bytes, 8_388_608);
        assert_eq!(c.extension_registry_url, "https://open-vsx.org/api");
    }

    #[test]
    fn values_are_read() {
        let c = InstanceConfig::from_settings(&json!({
            "max_file_bytes": 16_777_216,
            "extension_registry_url": "https://registry.example.com/api",
        }));
        assert_eq!(c.max_file_bytes, 16_777_216);
        assert_eq!(c.extension_registry_url, "https://registry.example.com/api");
    }

    #[test]
    fn empty_url_falls_back_to_default() {
        let c = InstanceConfig::from_settings(&json!({ "extension_registry_url": "  " }));
        assert_eq!(c.extension_registry_url, "https://open-vsx.org/api");
    }

    #[test]
    fn non_positive_or_absurd_size_falls_back() {
        assert_eq!(
            InstanceConfig::from_settings(&json!({ "max_file_bytes": 0 })).max_file_bytes,
            8_388_608
        );
        assert_eq!(
            InstanceConfig::from_settings(&json!({ "max_file_bytes": -5 })).max_file_bytes,
            8_388_608
        );
        assert_eq!(
            InstanceConfig::from_settings(&json!({ "max_file_bytes": 9_999_999_999i64 })).max_file_bytes,
            8_388_608
        );
    }

    #[test]
    fn an_empty_allowlist_allows_every_host() {
        assert!(host_is_allowed("github.com", &[]));
        let c = InstanceConfig::from_settings(&json!({}));
        assert!(c.git_clone_allowed_hosts.is_empty());
        assert!(c.allow_git_clone);
        assert_eq!(c.max_projects_per_user, 0);
    }

    #[test]
    fn allowlist_matches_the_host_and_its_subdomains() {
        let list = vec!["github.com".to_string()];
        assert!(host_is_allowed("github.com", &list));
        assert!(host_is_allowed("api.github.com", &list));
        assert!(host_is_allowed("GitHub.COM", &list));
        // Trailing root dot is still the same name.
        assert!(host_is_allowed("github.com.", &list));
    }

    #[test]
    fn allowlist_requires_a_dot_boundary() {
        let list = vec!["github.com".to_string()];
        // The classic bypass: a suffix match without a label boundary.
        assert!(!host_is_allowed("evilgithub.com", &list));
        assert!(!host_is_allowed("github.com.attacker.net", &list));
        assert!(!host_is_allowed("gitlab.com", &list));
    }

    #[test]
    fn allowlist_entries_are_normalised() {
        let c = InstanceConfig::from_settings(&json!({
            "git_clone_allowed_hosts":
                "  GitHub.com \n\n# un commentaire\nhttps://gitlab.example.org/groupe/\n.git.internal.example\ncodeberg.org:443\n",
        }));
        assert_eq!(
            c.git_clone_allowed_hosts,
            vec![
                "github.com".to_string(),
                "gitlab.example.org".to_string(),
                "git.internal.example".to_string(),
                "codeberg.org".to_string(),
            ]
        );
    }

    #[test]
    fn clone_can_be_disabled_and_quota_read() {
        let c = InstanceConfig::from_settings(&json!({
            "allow_git_clone":       false,
            "max_projects_per_user": 25,
        }));
        assert!(!c.allow_git_clone);
        assert_eq!(c.max_projects_per_user, 25);
    }
}
