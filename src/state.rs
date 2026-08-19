use crate::config::{InstanceConfig, Settings};
use sqlx::PgPool;
use std::sync::{Arc, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub db:       PgPool,
    pub settings: Arc<Settings>,
    pub http:     reqwest::Client,
    /// Admin-editable instance settings, refreshed in the background from the
    /// core. Shared behind an `RwLock` so a live edit is picked up without a
    /// restart; readers take a cheap snapshot via [`AppState::instance`].
    pub instance: Arc<RwLock<InstanceConfig>>,
}

impl AppState {
    /// Returns a snapshot of the current instance settings. A poisoned lock
    /// (a panic while writing) falls back to the compiled defaults rather than
    /// propagating the panic.
    pub fn instance(&self) -> InstanceConfig {
        self.instance
            .read()
            .map(|g| g.clone())
            .unwrap_or_default()
    }
}
