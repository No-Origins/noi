//! Health checks (agreed 8 Nov): every server answers `/health/alive` (it is running) and
//! `/health/ready` (it can do its job). Neither needs a sign-in, and neither says more than "ok" or
//! which part is not ok: no paths, no names, no errors, nothing secret.
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Map, Value};

/// The server is running. A host restarts it when this stops answering.
pub fn alive() -> Response {
    (StatusCode::OK, Json(json!({ "ok": true }))).into_response()
}

/// Whether each part the server needs answers. 200 when all do; 503 otherwise, so a host sends it
/// no requests until it is ready.
pub fn ready(checks: &[(&str, bool)]) -> Response {
    let ok = checks.iter().all(|(_, ok)| *ok);
    let parts: Map<String, Value> = checks
        .iter()
        .map(|(name, ok)| (name.to_string(), json!(if *ok { "ok" } else { "not ok" })))
        .collect();
    let status = if ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (status, Json(json!({ "ok": ok, "checks": parts }))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;

    async fn body(r: Response) -> (StatusCode, Value) {
        let status = r.status();
        (
            status,
            serde_json::from_slice(&to_bytes(r.into_body(), 1 << 16).await.unwrap()).unwrap(),
        )
    }

    #[tokio::test]
    async fn ready_only_when_every_part_answers() {
        let (status, v) = body(ready(&[("database", true), ("governance", true)])).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            v,
            json!({"ok": true, "checks": {"database": "ok", "governance": "ok"}})
        );
        let (status, v) = body(ready(&[("database", true), ("governance", false)])).await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(v["checks"]["governance"], "not ok");
        assert_eq!(body(alive()).await, (StatusCode::OK, json!({"ok": true})));
    }
}
