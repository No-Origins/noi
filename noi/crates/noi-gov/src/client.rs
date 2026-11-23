//! Mero's side of "may they?": it asks Governance's server over loopback, for every request.
//! No answer, an unreadable answer, or an answer about someone else means no.
use crate::{
    places, Action, Answer, AuthorizationRequest, Authorizer, Credential, Decision, Target,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use uuid::Uuid;

/// How long Mero remembers who holds a credential (agreed 9 Nov, step 6): one call to Governance
/// per request, not two. Safe because "who" only names the account: "may they?" still checks the
/// credential on every request, so an ended sign-in or role stops at once.
const WHO_SECONDS: u64 = 30;
/// Who holds each credential, by the credential's SHA-256, so no token is kept here.
type Known = Arc<Mutex<HashMap<[u8; 32], (Who, Instant)>>>;

/// Governance's address, and one HTTP client for every question.
#[derive(Clone)]
pub struct GovernanceClient {
    base: String,
    http: reqwest::Client,
    /// The request this client asks for, so Governance's log line carries the same ID as Mero's.
    request_id: Option<String>,
    known: Known,
}

/// Who holds a credential, as Governance says.
#[derive(Debug, Clone, Deserialize)]
pub struct Who {
    pub account: Uuid,
    pub handle: String,
    pub display_name: String,
    pub kind: String,
}

#[derive(Deserialize)]
struct MayAnswer {
    allowed: bool,
    reason: String,
    handle: Option<String>,
    /// None for an allowed read, which Governance doesn't record (9 Nov).
    #[serde(default)]
    record: Option<i64>,
}

impl GovernanceClient {
    pub fn new(base: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("an HTTP client with a timeout");
        Self {
            base: base.trim_end_matches('/').to_string(),
            http,
            request_id: None,
            known: Arc::default(),
        }
    }

    /// The same client, asking on behalf of this request.
    pub fn for_request(&self, id: Option<&str>) -> Self {
        Self {
            request_id: id.map(String::from),
            ..self.clone()
        }
    }

    async fn post(&self, path: &str, body: Value) -> Result<Value, String> {
        let mut req = self.http.post(format!("{}{path}", self.base)).json(&body);
        if let Some(id) = &self.request_id {
            req = req.header("x-request-id", id);
        }
        let res = req
            .send()
            .await
            .map_err(|e| format!("Governance did not answer: {e}"))?;
        let ok = res.status().is_success();
        let value: Value = res
            .json()
            .await
            .map_err(|e| format!("Governance's answer could not be read: {e}"))?;
        if ok {
            Ok(value)
        } else {
            Err(value["error"]
                .as_str()
                .unwrap_or("Governance said no")
                .to_string())
        }
    }

    /// Who holds this credential. Mero writes this handle next to whatever they do.
    /// Whether this credential may view (owners may): who reads the Problems page.
    pub async fn may_view(&self, credential: &Credential) -> bool {
        self.post(
            "/api/may",
            json!({ "credential": credential, "action": "view", "targets": [{"path": "noi"}] }),
        )
        .await
        .is_ok_and(|v| v["allowed"] == true)
    }

    /// Whether Governance's server answers at all, for Mero's `/health/ready`.
    pub async fn alive(&self) -> bool {
        self.http
            .get(format!("{}/health/alive", self.base))
            .timeout(Duration::from_secs(2))
            .send()
            .await
            .is_ok_and(|r| r.status().is_success())
    }

    pub async fn who(&self, credential: &Credential) -> Result<Who, String> {
        let key: [u8; 32] =
            Sha256::digest(serde_json::to_vec(credential).unwrap_or_default()).into();
        let fresh = Duration::from_secs(WHO_SECONDS);
        if let Some((who, at)) = self.known.lock().expect("who cache").get(&key) {
            if at.elapsed() < fresh {
                return Ok(who.clone());
            }
        }
        let value = self
            .post("/api/who", json!({ "credential": credential }))
            .await?;
        let who: Who = serde_json::from_value(value)
            .map_err(|e| format!("Governance's answer could not be read: {e}"))?;
        let mut known = self.known.lock().expect("who cache");
        if known.len() >= 1000 {
            known.retain(|_, (_, at)| at.elapsed() < fresh);
        }
        known.insert(key, (who.clone(), Instant::now()));
        Ok(who)
    }

    /// "What may they do here?" (agreed 9 Nov, step 6): yes or no for each action on its places,
    /// as if confirmed with a touch, and not recorded. Anything but an answer reads as no.
    pub async fn may_preview(
        &self,
        credential: &Credential,
        questions: &[(Action, Vec<String>)],
    ) -> Vec<bool> {
        let none = || vec![false; questions.len()];
        if questions.is_empty() {
            return vec![];
        }
        let body = json!({
            "credential": credential,
            "questions": questions.iter().map(|(action, paths)| json!({
                "action": action.as_str(),
                "targets": paths.iter().map(|p| json!({"path": p})).collect::<Vec<_>>(),
            })).collect::<Vec<_>>(),
        });
        match self.post("/api/may/preview", body).await {
            Ok(v) => serde_json::from_value::<Vec<bool>>(v["answers"].clone())
                .ok()
                .filter(|a| a.len() == questions.len())
                .unwrap_or_else(none),
            Err(_) => none(),
        }
    }

    /// Trades a platform's vouch for an agent's 15-minute run token.
    pub async fn run_token(&self, vouch: &str) -> Result<String, String> {
        let value = self
            .post("/api/run-tokens", json!({ "vouch": vouch }))
            .await?;
        value["run_token"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| "Governance gave no run token".into())
    }

    /// An authorizer that asks on behalf of this credential. The touch goes only with approving,
    /// the one Mero action a rule asks a fresh touch for, so it is used at most once.
    pub fn asking(&self, credential: Credential, touch: Option<Uuid>) -> AskGovernance {
        AskGovernance {
            client: self.clone(),
            credential,
            touch,
        }
    }

    async fn may(
        &self,
        credential: &Credential,
        touch: Option<Uuid>,
        request: &AuthorizationRequest,
    ) -> Decision {
        let deny = |reason: String| Decision::Deny { reason };
        let targets: Vec<Target> = places(&request.resources)
            .into_iter()
            .map(Target::Path)
            .collect();
        if targets.is_empty() {
            return deny("an action needs at least one resource".into());
        }
        let touch = if matches!(request.action, Action::Review | Action::WriteCedar) {
            touch
        } else {
            None
        };
        let body = json!({
            "credential": credential,
            "action": request.action.as_str(),
            "targets": targets,
            "touch": touch,
            // What else the touch named (9 Nov, step 7): the decision and each proposal.
            "about": request.intent.get("touch_for"),
        });
        let answer: MayAnswer = match self.post("/api/may", body).await {
            Ok(v) => match serde_json::from_value(v) {
                Ok(a) => a,
                Err(e) => return deny(format!("Governance's answer could not be read: {e}")),
            },
            Err(e) => return deny(e),
        };
        if !answer.allowed {
            return deny(match answer.record {
                Some(n) => format!("{} (Governance record {n})", answer.reason),
                None => answer.reason,
            });
        }
        // Governance answered for the credential; Mero records the actor. They must be the same.
        if answer.handle.as_deref() != Some(request.actor.subject.as_str()) {
            return deny("Governance answered for someone else".into());
        }
        Decision::Allow {
            // An allowed read has no place in the record (9 Nov); everything else cites its entry.
            reference: match answer.record {
                Some(n) => format!("governance:record:{n}"),
                None => "governance:read".into(),
            },
            policies: vec![answer.reason],
        }
    }
}

/// Asks Governance for one credential.
pub struct AskGovernance {
    client: GovernanceClient,
    credential: Credential,
    touch: Option<Uuid>,
}
impl Authorizer for AskGovernance {
    fn authorize<'a>(&'a self, request: &'a AuthorizationRequest) -> Answer<'a> {
        Box::pin(self.client.may(&self.credential, self.touch, request))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Actor, Resource};

    #[tokio::test]
    async fn no_answer_means_no() {
        // Nothing listens on port 9 (discard); the client must refuse, not hang or allow.
        let client = GovernanceClient::new("http://127.0.0.1:9");
        let request = AuthorizationRequest {
            actor: Actor {
                subject: "hiddenstack".into(),
            },
            action: Action::Read,
            resources: vec![Resource {
                uid: Uuid::nil(),
                path: "noi".into(),
                revision: 0,
                authority_scope: Uuid::nil(),
            }],
            intent: Value::Null,
        };
        let decision = client
            .asking(Credential::Visitor, None)
            .authorize(&request)
            .await;
        assert!(matches!(decision, Decision::Deny { reason } if reason.contains("did not answer")));
        assert!(client.who(&Credential::Visitor).await.is_err());
    }
}
