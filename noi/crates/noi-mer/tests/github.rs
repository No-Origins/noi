//! Mero's name on GitHub (part B, decision 1), against a stand-in for GitHub's API: the note is signed
//! with the App's key and names the App; the token is asked for the repository's installation; the
//! check is posted on the commit, with that token, as "Mero approved". A wrong key gets nothing.
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use noi_mer::github::{GitHub, Verdict};
use serde_json::{json, Value};
use std::process::Command;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
struct Stand {
    public: Arc<Vec<u8>>,
    posted: Arc<Mutex<Vec<(String, Value)>>>,
}

/// Whether a request carries a note signed with the App's key, naming the App.
fn signed(headers: &HeaderMap, public: &[u8]) -> bool {
    let mut v = Validation::new(Algorithm::RS256);
    v.set_issuer(&["123"]);
    v.set_required_spec_claims(&["exp", "iat", "iss"]);
    headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .is_some_and(|t| {
            decode::<Value>(t, &DecodingKey::from_rsa_pem(public).unwrap(), &v).is_ok()
        })
}

fn refused() -> (StatusCode, Json<Value>) {
    (
        StatusCode::UNAUTHORIZED,
        Json(json!({"message": "A JSON web token could not be decoded"})),
    )
}

/// A throwaway RSA key, made for this run only: no key is ever kept in the repository.
fn key(dir: &std::path::Path, name: &str) -> (Vec<u8>, Vec<u8>) {
    let private = dir.join(format!("{name}.pem"));
    let public = dir.join(format!("{name}.pub.pem"));
    let ok = |args: &[&std::ffi::OsStr]| {
        Command::new("openssl")
            .args(args)
            .output()
            .unwrap()
            .status
            .success()
    };
    assert!(
        ok(&[
            "genrsa".as_ref(),
            "-out".as_ref(),
            private.as_os_str(),
            "2048".as_ref()
        ]),
        "openssl genrsa"
    );
    assert!(
        ok(&[
            "rsa".as_ref(),
            "-in".as_ref(),
            private.as_os_str(),
            "-pubout".as_ref(),
            "-out".as_ref(),
            public.as_os_str()
        ]),
        "openssl rsa -pubout"
    );
    (
        std::fs::read(private).unwrap(),
        std::fs::read(public).unwrap(),
    )
}

#[tokio::test]
async fn mero_posts_its_check_as_the_app() {
    let dir = std::env::temp_dir().join(format!("noi-github-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let (private, public) = key(&dir, "app");
    let (stranger, _) = key(&dir, "stranger");
    std::fs::remove_dir_all(&dir).unwrap();

    let stand = Stand {
        public: Arc::new(public),
        posted: Arc::default(),
    };
    let app = Router::new()
        .route(
            "/repos/No-Origins/noi/installation",
            get(|State(s): State<Stand>, h: HeaderMap| async move {
                if signed(&h, &s.public) {
                    (StatusCode::OK, Json(json!({"id": 7})))
                } else {
                    refused()
                }
            }),
        )
        .route(
            "/app/installations/7/access_tokens",
            post(|State(s): State<Stand>, h: HeaderMap| async move {
                if signed(&h, &s.public) {
                    (
                        StatusCode::CREATED,
                        Json(json!({"token": "t-1", "expires_at": "2026-11-18T12:00:00Z"})),
                    )
                } else {
                    refused()
                }
            }),
        )
        .route(
            "/repos/No-Origins/noi/statuses/{sha}",
            post(
                |State(s): State<Stand>,
                 Path(sha): Path<String>,
                 h: HeaderMap,
                 Json(body): Json<Value>| async move {
                    if h.get("authorization").and_then(|v| v.to_str().ok()) == Some("Bearer t-1") {
                        s.posted.lock().unwrap().push((sha, body));
                        (StatusCode::CREATED, Json(json!({})))
                    } else {
                        refused()
                    }
                },
            ),
        )
        .with_state(stand.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let at = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    let mero = GitHub::new("123", &private, "No-Origins/noi", &at).unwrap();
    mero.post(
        "abc123",
        Verdict::Red,
        "noi.eio.components.chip: not what you approved in Mero",
    )
    .await
    .unwrap();
    mero.post(
        "abc123",
        Verdict::Green,
        "As you approved in Mero: 35 merons",
    )
    .await
    .unwrap();
    assert_eq!(
        *stand.posted.lock().unwrap(),
        [
            (
                "abc123".to_string(),
                json!({"state": "failure", "context": "Mero approved", "description": "noi.eio.components.chip: not what you approved in Mero"})
            ),
            (
                "abc123".to_string(),
                json!({"state": "success", "context": "Mero approved", "description": "As you approved in Mero: 35 merons"})
            ),
        ]
    );

    // Another key, even naming the same App, gets nothing posted.
    let impostor = GitHub::new("123", &stranger, "No-Origins/noi", &at).unwrap();
    let error = impostor
        .post("abc123", Verdict::Green, "trust me")
        .await
        .unwrap_err();
    assert!(
        error.contains("finding the App on the repository: GitHub said 401"),
        "{error}"
    );
    assert_eq!(stand.posted.lock().unwrap().len(), 2);
    assert!(GitHub::new("123", b"not a key", "No-Origins/noi", &at).is_err());
}
