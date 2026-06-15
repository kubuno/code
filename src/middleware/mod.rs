use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

use crate::{errors::AppError, state::AppState};

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub role:    String,
    pub email:   String,
}

/// Comparaison à temps constant pour éviter une fuite par timing sur le secret.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    // Défense en profondeur : le module n'est censé être joignable qu'à travers
    // le proxy du core, qui injecte `X-Internal-Secret`. Si un secret est
    // configuré, on l'exige : ainsi, même si le module était exposé directement
    // (bind non-loopback), on ne peut plus usurper une identité via les en-têtes
    // `X-Kubuno-*`. Quand aucun secret n'est configuré (dev), on ne bloque pas.
    let expected = state.settings.core.internal_secret.as_bytes();
    if !expected.is_empty() {
        let provided = req
            .headers()
            .get("x-internal-secret")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !constant_time_eq(provided.as_bytes(), expected) {
            return Err(AppError::Unauthorized);
        }
    }

    let user_id = req
        .headers()
        .get("x-kubuno-user-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or(AppError::Unauthorized)?;

    let role = req
        .headers()
        .get("x-kubuno-user-role")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("user")
        .to_string();

    let email = req
        .headers()
        .get("x-kubuno-user-email")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    req.extensions_mut().insert(AuthUser { user_id, role, email });
    Ok(next.run(req).await)
}
