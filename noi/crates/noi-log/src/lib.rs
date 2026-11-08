//! Logs for NOI's servers, with `tracing` and `tracing-subscriber` (switched 7 Nov, at the user's
//! request, from a small logger of our own). Every request runs in a `request` span that names the
//! server, the request ID, the method, the path, and who asked once the server knows; when it is
//! answered, one line gives the status and how long it took. Anything else a server or a library
//! logs during the request carries the same span, so one request reads as one story.
//!
//! Nothing secret: no headers, no bodies, no query strings, and a one-time link's token is cut from
//! its path. The request ID travels from Mero to Governance in `x-request-id`.
//!
//! `NOI_LOG` sets how much (default `info`, for example `NOI_LOG=debug`); `NOI_LOG_FORMAT=json`
//! writes one JSON object per line, for a host that collects logs.
use axum::{
    extract::{Request, State},
    http::{HeaderName, HeaderValue},
    middleware::{self, Next},
    response::Response,
    Router,
};
use std::{sync::Arc, time::Instant};
use tracing::{field, Instrument};

pub mod health;
pub mod limits;
use tracing_subscriber::{fmt::MakeWriter, EnvFilter};

/// The header a request ID travels in.
pub const REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

/// What is logged when `NOI_LOG` says nothing. The HTTP libraries stay quiet below warnings.
const DEFAULT_FILTER: &str = "info,hyper=warn,h2=warn,reqwest=warn";

/// Whether this server runs inside a container image, which says so with NOI_IN_CONTAINER=1.
pub fn in_container() -> bool {
    std::env::var("NOI_IN_CONTAINER").is_ok_and(|v| v == "1")
}

/// Starts logging for a server, on standard error. Call once, as the server starts.
pub fn init() {
    let filter = std::env::var("NOI_LOG").unwrap_or_else(|_| DEFAULT_FILTER.into());
    let json = std::env::var("NOI_LOG_FORMAT").is_ok_and(|f| f == "json");
    let _ = install(subscriber(&filter, json, std::io::stderr));
}

fn install(
    s: Box<dyn tracing::Subscriber + Send + Sync>,
) -> Result<(), tracing::subscriber::SetGlobalDefaultError> {
    tracing::subscriber::set_global_default(s)
}

/// The one way lines are formatted, for the servers and the tests alike.
fn subscriber<W>(filter: &str, json: bool, writer: W) -> Box<dyn tracing::Subscriber + Send + Sync>
where
    W: for<'a> MakeWriter<'a> + Send + Sync + 'static,
{
    let filter = EnvFilter::try_new(filter).unwrap_or_else(|_| EnvFilter::new(DEFAULT_FILTER));
    let fmt = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(writer)
        .with_ansi(false)
        .with_target(false);
    if json {
        Box::new(
            fmt.json()
                .with_current_span(true)
                .with_span_list(false)
                .finish(),
        )
    } else {
        Box::new(fmt.finish())
    }
}

/// Logs every request this router answers, refusals included.
pub fn around(service: &'static str, router: Router) -> Router {
    router.layer(middleware::from_fn_with_state(
        Logged {
            service,
            report: None,
        },
        log_request,
    ))
}

/// As `around`, and every failure (an answer of 500 or more, health checks aside) is also handed to
/// `report`, which keeps it where owners see it: the Problems page (agreed 8 Nov).
pub fn around_reporting(service: &'static str, router: Router, report: Report) -> Router {
    router.layer(middleware::from_fn_with_state(
        Logged {
            service,
            report: Some(report),
        },
        log_request,
    ))
}

/// A failure, with the request it was: never a header, a body, a query or a token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    pub request_id: String,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub what: String,
}

/// Where a server keeps its problems. Called after the answer is sent on its way; it must not wait.
pub type Report = Arc<dyn Fn(Problem) + Send + Sync>;

/// What went wrong inside, set on a failed answer by the server. Owners read it on the Problems
/// page; the asker never sees it.
#[derive(Debug, Clone)]
pub struct Why(pub String);

#[derive(Clone)]
struct Logged {
    service: &'static str,
    report: Option<Report>,
}

/// Who asked, on the current request's span, once the server knows.
pub fn who(handle: &str) {
    tracing::Span::current().record("who", handle);
}

/// A request ID worth keeping: short, and only letters, digits and dashes.
fn well_formed(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// The path, without its query, and with a one-time link's token cut.
pub fn redact(path: &str) -> String {
    let path = path.split('?').next().unwrap_or("");
    match path.strip_prefix("/link/") {
        Some(rest) if !rest.is_empty() => "/link/…".into(),
        _ => path.into(),
    }
}

async fn log_request(State(logged): State<Logged>, mut request: Request, next: Next) -> Response {
    let service = logged.service;
    let started = Instant::now();
    let id = request
        .headers()
        .get(&REQUEST_ID)
        .and_then(|v| v.to_str().ok())
        .filter(|v| well_formed(v))
        .map(String::from)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let span = tracing::info_span!(
        "request",
        service,
        id = %id,
        method = %request.method(),
        path = %redact(request.uri().path()),
        who = field::Empty,
    );
    if let Ok(v) = HeaderValue::from_str(&id) {
        request.headers_mut().insert(REQUEST_ID, v);
    }
    // A host asks for health every few seconds: those lines only show with NOI_LOG=debug.
    let health = request.uri().path().starts_with("/health/");
    let (method, path) = (request.method().to_string(), redact(request.uri().path()));
    async move {
        let mut response = next.run(request).await;
        if let Ok(v) = HeaderValue::from_str(&id) {
            response.headers_mut().insert(REQUEST_ID, v);
        }
        let (status, ms) = (
            response.status().as_u16(),
            started.elapsed().as_millis() as u64,
        );
        if health && status < 500 {
            tracing::debug!(status, ms, "answered");
        } else if status >= 500 {
            let what = response
                .extensions()
                .get::<Why>()
                .map(|w| w.0.clone())
                .unwrap_or_else(|| {
                    format!(
                        "answered {status} {}",
                        response.status().canonical_reason().unwrap_or("")
                    )
                });
            tracing::error!(status, ms, what = %what, "failed");
            if let (Some(report), false) = (&logged.report, health) {
                report(Problem {
                    request_id: id.clone(),
                    method,
                    path,
                    status,
                    what: what.chars().take(1000).collect(),
                });
            }
        } else {
            tracing::info!(status, ms, "answered");
        }
        response
    }
    .instrument(span)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::StatusCode, routing::get};
    use std::sync::{Arc, Mutex};
    use tower::ServiceExt;

    #[test]
    fn a_link_token_and_a_query_never_reach_a_line() {
        assert_eq!(redact("/link/abc123"), "/link/…");
        assert_eq!(redact("/link/"), "/link/");
        assert_eq!(redact("/api/registry?token=x"), "/api/registry");
        assert_eq!(redact("/sign-in"), "/sign-in");
    }

    #[test]
    fn only_well_formed_request_ids_are_kept() {
        assert!(well_formed("1b2c3d4e-0000-4000-8000-000000000000"));
        assert!(!well_formed(""));
        assert!(!well_formed("has space"));
        assert!(!well_formed("new\nline"));
        assert!(!well_formed(&"a".repeat(65)));
    }

    /// Lines written to memory instead of standard error.
    #[derive(Clone, Default)]
    struct Lines(Arc<Mutex<Vec<u8>>>);
    impl std::io::Write for Lines {
        fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    impl<'a> MakeWriter<'a> for Lines {
        type Writer = Lines;
        fn make_writer(&'a self) -> Lines {
            self.clone()
        }
    }
    impl Lines {
        fn text(&self) -> String {
            String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
        }
    }

    fn app() -> Router {
        Router::new()
            .route("/health/alive", get(|| async { health::alive() }))
            .route("/link/{token}", get(|| async { "the link page" }))
            .route(
                "/api/registry",
                get(|| async {
                    who("hiddenstack");
                    tracing::info!(answer = "refused", "may");
                    (StatusCode::FORBIDDEN, "no")
                }),
            )
    }

    #[tokio::test]
    async fn one_line_per_request_with_no_secret_in_it() {
        let lines = Lines::default();
        let _quiet = tracing::subscriber::set_default(subscriber("info", false, lines.clone()));
        let app = around("mero", app());
        let request = Request::builder()
            .uri("/link/SECRET-LINK?also=SECRET-QUERY")
            .header("authorization", "Session SECRET-SESSION")
            .header("cookie", "noi_session=SECRET-COOKIE")
            .body(Body::empty())
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        assert!(
            response.headers().get(&REQUEST_ID).is_some(),
            "the answer names its request"
        );
        let request = Request::builder()
            .uri("/api/registry")
            .header("x-request-id", "from-mero-1234")
            .header("authorization", "Run SECRET-RUN")
            .body(Body::empty())
            .unwrap();
        let response = app.oneshot(request).await.unwrap();
        assert_eq!(
            response.headers().get(&REQUEST_ID).unwrap(),
            "from-mero-1234",
            "a caller's ID is kept"
        );

        let text = lines.text();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 3, "{text}");
        assert!(
            lines[0].contains(r#"service="mero""#)
                && lines[0].contains("method=GET")
                && lines[0].contains("path=/link/…")
                && lines[0].contains("status=200"),
            "{}",
            lines[0]
        );
        // A decision during the request, and the request's own line, both carry its ID and who asked.
        assert!(
            lines[1].contains("id=from-mero-1234")
                && lines[1].contains(r#"who="hiddenstack""#)
                && lines[1].contains("may"),
            "{}",
            lines[1]
        );
        assert!(
            lines[2].contains("id=from-mero-1234") && lines[2].contains("status=403"),
            "{}",
            lines[2]
        );
        assert!(!text.contains("SECRET"), "a secret reached the log: {text}");
    }

    #[tokio::test]
    async fn json_lines_for_a_host() {
        let lines = Lines::default();
        let _quiet = tracing::subscriber::set_default(subscriber("info", true, lines.clone()));
        around("governance", app())
            .oneshot(
                Request::builder()
                    .uri("/link/x")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let v: serde_json::Value =
            serde_json::from_str(lines.text().lines().next().unwrap()).unwrap();
        assert_eq!(v["span"]["service"], "governance");
        assert_eq!(v["fields"]["status"], 200);
        assert!(v["span"]["id"].as_str().is_some_and(|id| id.len() == 36));
    }

    #[tokio::test]
    async fn a_hosts_health_checks_stay_out_of_the_log() {
        let lines = Lines::default();
        let _quiet = tracing::subscriber::set_default(subscriber("info", false, lines.clone()));
        let response = around("mero", app())
            .oneshot(
                Request::builder()
                    .uri("/health/alive")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(lines.text(), "", "a health check at info");
    }

    #[tokio::test]
    async fn a_failure_reaches_the_problems_with_its_reason_and_no_secret() {
        let got: Arc<std::sync::Mutex<Vec<Problem>>> = Arc::default();
        let keep = got.clone();
        let report: Report = Arc::new(move |p| keep.lock().unwrap().push(p));
        let app = Router::new()
            .route(
                "/api/fails/{token}",
                get(|| async {
                    let mut r = axum::response::IntoResponse::into_response((
                        StatusCode::SERVICE_UNAVAILABLE,
                        "Mero could not answer",
                    ));
                    r.extensions_mut()
                        .insert(Why("database: pool timed out".into()));
                    r
                }),
            )
            .route(
                "/health/ready",
                get(|| async { StatusCode::SERVICE_UNAVAILABLE }),
            )
            .route("/fine", get(|| async { "ok" }));
        let app = around_reporting("mero", app, report);
        let _quiet = tracing::subscriber::set_default(subscriber("off", false, Lines::default()));
        for uri in ["/api/fails/SECRET?q=SECRET", "/health/ready", "/fine"] {
            app.clone()
                .oneshot(
                    Request::builder()
                        .uri(uri)
                        .header("x-request-id", "req-1")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
        }
        let got = got.lock().unwrap().clone();
        assert_eq!(
            got,
            vec![Problem {
                request_id: "req-1".into(),
                method: "GET".into(),
                path: "/api/fails/SECRET".into(),
                status: 503,
                what: "database: pool timed out".into(),
            }]
        );
    }

    #[tokio::test]
    async fn noi_log_sets_how_much() {
        let lines = Lines::default();
        let _quiet = tracing::subscriber::set_default(subscriber("warn", false, lines.clone()));
        around("mero", app())
            .oneshot(
                Request::builder()
                    .uri("/link/x")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(lines.text(), "", "nothing below a warning");
    }
}
