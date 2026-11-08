//! Mero's side of "may they?": it asks Governance's server over loopback, for every request.
//! No answer, an unreadable answer, or an answer about someone else means no.
use crate::{
    places, Action, Answer, AuthorizationRequest, Authorizer, Credential, Decision, Target,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use uuid::Uuid;

/// Governance's address, and one HTTP client for every question.
#[derive(Clone)]
pub struct GovernanceClient {
    base: String,
    http: reqwest::Client,
    /// The request this client asks for, so Governance's log line carries the same ID as Mero's.
    request_id: Option<String>,
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
    record: i64,
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
        let value = self
            .post("/api/who", json!({ "credential": credential }))
            .await?;
        serde_json::from_value(value)
            .map_err(|e| format!("Governance's answer could not be read: {e}"))
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

    /// After an approval in noi.gov: Governance copies the roles and rules again, from Mero.
    pub async fn copy(&self) -> Result<Value, String> {
        self.post("/api/copy", json!({})).await
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
        let touch = if request.action == Action::Review {
            touch
        } else {
            None
        };
        let body = json!({
            "credential": credential,
            "action": request.action.as_str(),
            "targets": targets,
            "touch": touch,
        });
        let answer: MayAnswer = match self.post("/api/may", body).await {
            Ok(v) => match serde_json::from_value(v) {
                Ok(a) => a,
                Err(e) => return deny(format!("Governance's answer could not be read: {e}")),
            },
            Err(e) => return deny(e),
        };
        if !answer.allowed {
            return deny(format!(
                "{} (Governance record {})",
                answer.reason, answer.record
            ));
        }
        // Governance answered for the credential; Mero records the actor. They must be the same.
        if answer.handle.as_deref() != Some(request.actor.subject.as_str()) {
            return deny("Governance answered for someone else".into());
        }
        Decision::Allow {
            reference: format!("governance:record:{}", answer.record),
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
