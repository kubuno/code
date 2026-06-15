use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::state::AppState;

pub async fn health(State(state): State<AppState>) -> Json<Value> {
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await
        .is_ok();

    Json(json!({
        "status":  if db_ok { "ok" } else { "degraded" },
        "module":  "code",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
