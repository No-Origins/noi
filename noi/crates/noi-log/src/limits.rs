//! Limits (agreed 8 Nov), so nobody can flood a server: a size for every request, a time for every
//! answer, and a window that counts tries. Each refusal says why, in words.
use axum::{
    extract::{DefaultBodyLimit, Request, State},
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    Json, Router,
};
use serde_json::json;
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Clone, Copy)]
struct Limits {
    bytes: usize,
    time: Duration,
}

/// At most `bytes` in a request, and an answer within `time`, or the request is ended.
pub fn around(router: Router, bytes: usize, time: Duration) -> Router {
    let limits = Limits { bytes, time };
    router
        .layer(middleware::from_fn_with_state(limits, within))
        // A request with no length given is still stopped at the same size.
        .layer(DefaultBodyLimit::max(bytes))
}

fn refused(status: StatusCode, error: String) -> Response {
    (status, Json(json!({ "error": error }))).into_response()
}

/// "1 MB", "5 MB", "512 KB".
fn size(bytes: usize) -> String {
    if bytes >= 1 << 20 { format!("{} MB", bytes >> 20) } else { format!("{} KB", bytes >> 10) }
}

async fn within(State(limits): State<Limits>, request: Request, next: Next) -> Response {
    let length = request
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok());
    if length.is_some_and(|n| n > limits.bytes) {
        return refused(StatusCode::PAYLOAD_TOO_LARGE, format!("this request is bigger than {}, the most this server takes", size(limits.bytes)));
    }
    match tokio::time::timeout(limits.time, next.run(request)).await {
        Ok(response) => response,
        Err(_) => {
            let why = format!("this took longer than {} seconds, so it was stopped; nothing it began was kept", limits.time.as_secs().max(1));
            let mut r = refused(StatusCode::SERVICE_UNAVAILABLE, why.clone());
            r.extensions_mut().insert(crate::Why(why));
            r
        }
    }
}

/// Counts tries per key, such as an address or a sign-in: at most `max` in any `per`.
#[derive(Clone)]
pub struct Window {
    max: usize,
    per: Duration,
    seen: Arc<Mutex<HashMap<String, VecDeque<Instant>>>>,
}

impl Window {
    pub fn new(max: usize, per: Duration) -> Self {
        Self { max, per, seen: Arc::default() }
    }

    /// Counts a try. `Err` says how long until the next one is allowed; a refused try is not counted.
    pub fn allow(&self, key: &str) -> Result<(), Duration> {
        self.allow_at(key, Instant::now())
    }

    fn allow_at(&self, key: &str, now: Instant) -> Result<(), Duration> {
        let mut seen = self.seen.lock().unwrap_or_else(|e| e.into_inner());
        // Forget keys that have gone quiet, so the map stays small.
        if seen.len() > 10_000 {
            seen.retain(|_, tries| tries.back().is_some_and(|t| now.duration_since(*t) < self.per));
        }
        let tries = seen.entry(key.to_string()).or_default();
        while tries.front().is_some_and(|t| now.duration_since(*t) >= self.per) {
            tries.pop_front();
        }
        if tries.len() >= self.max {
            let oldest = *tries.front().expect("full, so not empty");
            return Err(self.per.saturating_sub(now.duration_since(oldest)));
        }
        tries.push_back(now);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, routing::post};
    use tower::ServiceExt;

    #[test]
    fn a_window_allows_so_many_then_says_how_long_to_wait() {
        let w = Window::new(3, Duration::from_secs(60));
        let t0 = Instant::now();
        for i in 0..3 {
            assert!(w.allow_at("a", t0 + Duration::from_secs(i)).is_ok());
        }
        let wait = w.allow_at("a", t0 + Duration::from_secs(10)).unwrap_err();
        assert_eq!(wait, Duration::from_secs(50));
        assert!(w.allow_at("b", t0 + Duration::from_secs(10)).is_ok(), "each key counts on its own");
        assert!(w.allow_at("a", t0 + Duration::from_secs(60)).is_ok(), "the first try has left the window");
    }

    fn app(time: Duration) -> Router {
        let r = Router::new()
            .route("/echo", post(|body: String| async move { body.len().to_string() }))
            .route("/slow", post(|| async { tokio::time::sleep(Duration::from_secs(5)).await; "late" }));
        around(r, 1 << 10, time)
    }

    #[tokio::test]
    async fn too_big_and_too_slow_are_refused_in_words() {
        let ok = app(Duration::from_secs(5)).oneshot(Request::post("/echo").body(Body::from("x".repeat(1000))).unwrap()).await.unwrap();
        assert_eq!(ok.status(), StatusCode::OK);
        let big = app(Duration::from_secs(5))
            .oneshot(Request::post("/echo").header("content-length", "2000").body(Body::from("x".repeat(2000))).unwrap())
            .await
            .unwrap();
        assert_eq!(big.status(), StatusCode::PAYLOAD_TOO_LARGE);
        let text = String::from_utf8(axum::body::to_bytes(big.into_body(), 1 << 12).await.unwrap().to_vec()).unwrap();
        assert!(text.contains("bigger than 1 KB"), "{text}");
        let slow = app(Duration::from_millis(50)).oneshot(Request::post("/slow").body(Body::empty()).unwrap()).await.unwrap();
        assert_eq!(slow.status(), StatusCode::SERVICE_UNAVAILABLE);
    }
}
