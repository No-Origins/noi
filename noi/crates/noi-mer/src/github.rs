//! Mero's own name on GitHub (part B, decision 1, agreed 18 Nov 2026): the App "No Origins Mero",
//! allowed one thing, to post commit statuses on No-Origins/noi. Its private key stays with Mero (an
//! owner-only file on this Mac; AWS's Secrets Manager once hosted). With it Mero signs a short note,
//! trades it for a token that lasts an hour, and posts the status "Mero approved" on a commit.
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::Serialize;
use serde_json::{json, Value};

/// The status's name on GitHub, as main's required checks name it.
pub const CONTEXT: &str = "Mero approved";

/// What Mero says about a commit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Exactly what you approved: it may land.
    Green,
    /// Something differs: it may not.
    Red,
}

pub struct GitHub {
    app: String,
    key: EncodingKey,
    repo: String,
    api: String,
    http: reqwest::Client,
}

#[derive(Serialize)]
struct Note<'a> {
    iat: i64,
    exp: i64,
    iss: &'a str,
}

impl GitHub {
    /// The App's ID, its private key (PEM), the repository ("owner/name") and GitHub's API address.
    pub fn new(app: &str, key_pem: &[u8], repo: &str, api: &str) -> Result<Self, String> {
        let key = EncodingKey::from_rsa_pem(key_pem)
            .map_err(|e| format!("the App's key is not an RSA private key: {e}"))?;
        let http = reqwest::Client::builder()
            .user_agent("no-origins-mero")
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            app: app.into(),
            key,
            repo: repo.into(),
            api: api.trim_end_matches('/').into(),
            http,
        })
    }

    /// The short note, signed with the App's key: good for nine minutes (GitHub allows ten).
    fn note(&self) -> Result<String, String> {
        let now = chrono::Utc::now().timestamp();
        let claims = Note {
            iat: now - 60,
            exp: now + 540,
            iss: &self.app,
        };
        encode(&Header::new(Algorithm::RS256), &claims, &self.key)
            .map_err(|e| format!("signing the note: {e}"))
    }

    async fn call(&self, req: reqwest::RequestBuilder, what: &str) -> Result<Value, String> {
        let res = req
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|e| format!("{what}: GitHub did not answer: {e}"))?;
        let status = res.status();
        let body: Value = res.json().await.unwrap_or(Value::Null);
        if !status.is_success() {
            let why = body["message"].as_str().unwrap_or("no reason given");
            return Err(format!("{what}: GitHub said {status}: {why}"));
        }
        Ok(body)
    }

    /// A token for the repository's installation, good for an hour.
    async fn token(&self) -> Result<String, String> {
        let note = self.note()?;
        let installation = self
            .call(
                self.http
                    .get(format!("{}/repos/{}/installation", self.api, self.repo))
                    .bearer_auth(&note),
                "finding the App on the repository",
            )
            .await?;
        let id = installation["id"]
            .as_u64()
            .ok_or("the App is not installed on the repository")?;
        let token = self
            .call(
                self.http
                    .post(format!("{}/app/installations/{id}/access_tokens", self.api))
                    .bearer_auth(&note),
                "getting a token",
            )
            .await?;
        token["token"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| "GitHub gave no token".to_string())
    }

    /// Posts "Mero approved" on a commit: green or red, with words GitHub shows beside it.
    pub async fn post(&self, commit: &str, verdict: Verdict, words: &str) -> Result<(), String> {
        let token = self.token().await?;
        let state = match verdict {
            Verdict::Green => "success",
            Verdict::Red => "failure",
        };
        self.call(
            self.http
                .post(format!(
                    "{}/repos/{}/statuses/{commit}",
                    self.api, self.repo
                ))
                .bearer_auth(&token)
                .json(&json!({"state": state, "context": CONTEXT, "description": words})),
            "posting the check",
        )
        .await?;
        Ok(())
    }
}
