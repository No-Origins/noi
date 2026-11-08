//! Peer governance boundary. No dependency on Invariants or its storage.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{future::Future, pin::Pin};
use uuid::Uuid;

mod cedar;
pub mod form;
#[cfg(feature = "client")]
mod client;
mod policy;
#[cfg(feature = "server")]
pub mod server;
#[cfg(feature = "client")]
pub use client::{AskGovernance, GovernanceClient, Who};
pub use cedar::{
    check_role, check_rule, role_actions, schema_text, GOVERNANCE_ACTIONS, ROLE_CHECK, RULE_CHECK,
    SYSTEMS,
};
pub use policy::{GovernancePolicy, Grant, Role, Scope, ScopedAuthorizer};

/// How an asker proves who they are. Mero passes it to Governance unread.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Credential {
    /// A person's session, from the HttpOnly cookie.
    Session(String),
    /// An agent's run token, attached by the tool runner, never seen by the model.
    RunToken(String),
    /// Signed out.
    Visitor,
}

/// What an action acts on: a meron's place, or an account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Target {
    Path(String),
    Account(Uuid),
}

/// The places a request names, each once and in order: what Mero asks about, and what a touch is for.
pub fn places(resources: &[Resource]) -> Vec<String> {
    let set: std::collections::BTreeSet<&str> = resources.iter().map(|r| r.path.as_str()).collect();
    set.into_iter().map(String::from).collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Actor {
    pub subject: String,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Action {
    Read,
    Propose,
    Update,
    EvolveBreaking,
    Rename,
    Transition,
    Relate,
    Unrelate,
    Release,
    TransitionRelease,
    /// Approve, send back or reject proposals. Maintainers only.
    Review,
}
impl Action {
    /// Every action Mero declares. Cedar roles and rules may name only these, and Governance's own.
    pub const ALL: [Action; 11] = [
        Action::Read,
        Action::Propose,
        Action::Update,
        Action::EvolveBreaking,
        Action::Rename,
        Action::Transition,
        Action::Relate,
        Action::Unrelate,
        Action::Release,
        Action::TransitionRelease,
        Action::Review,
    ];
    /// The name Cedar and requests use, the same as the JSON one.
    pub fn as_str(self) -> &'static str {
        match self {
            Action::Read => "read",
            Action::Propose => "propose",
            Action::Update => "update",
            Action::EvolveBreaking => "evolve-breaking",
            Action::Rename => "rename",
            Action::Transition => "transition",
            Action::Relate => "relate",
            Action::Unrelate => "unrelate",
            Action::Release => "release",
            Action::TransitionRelease => "transition-release",
            Action::Review => "review",
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Resource {
    pub uid: Uuid,
    pub path: String,
    pub revision: i64,
    pub authority_scope: Uuid,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorizationRequest {
    pub actor: Actor,
    pub action: Action,
    pub resources: Vec<Resource>,
    pub intent: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "decision", rename_all = "kebab-case")]
pub enum Decision {
    Allow {
        reference: String,
        policies: Vec<String>,
    },
    Deny {
        reason: String,
    },
    ApprovalRequired {
        reference: String,
        reason: String,
    },
}
/// An answer still on its way, so an authorizer may ask Governance's server.
pub type Answer<'a> = Pin<Box<dyn Future<Output = Decision> + Send + 'a>>;
/// An answer already known.
pub fn answer(decision: Decision) -> Answer<'static> {
    Box::pin(std::future::ready(decision))
}
/// Called while the registry transaction owns the mutation lock. Implementations must
/// fail closed, use trusted actor identities, and avoid re-entering the registry.
/// In Mero's binaries the only one is [`AskGovernance`]: it asks Governance's server.
pub trait Authorizer: Send + Sync {
    fn authorize<'a>(&'a self, request: &'a AuthorizationRequest) -> Answer<'a>;
}
pub struct DenyAll;
impl Authorizer for DenyAll {
    fn authorize<'a>(&'a self, _: &'a AuthorizationRequest) -> Answer<'a> {
        answer(Decision::Deny {
            reason: "no Governance authority configured".into(),
        })
    }
}
/// Allows everything under one subject and namespace. For tests only: no binary uses it, so who
/// you are still comes only from signing in.
pub struct LocalDevelopmentGrant {
    subject: String,
    namespace: String,
}
impl LocalDevelopmentGrant {
    pub fn new(subject: String, namespace: String) -> Result<Self, &'static str> {
        if subject.trim().is_empty() || !(namespace == "noi" || namespace.starts_with("noi."))
        {
            return Err("nonblank subject and noi namespace required");
        }
        Ok(Self { subject, namespace })
    }
}
impl Authorizer for LocalDevelopmentGrant {
    fn authorize<'a>(&'a self, request: &'a AuthorizationRequest) -> Answer<'a> {
        answer(if request.actor.subject == self.subject
            && !request.resources.is_empty()
            && request.resources.iter().all(|r| {
                r.path == self.namespace || r.path.starts_with(&format!("{}.", self.namespace))
            })
        {
            Decision::Allow {
                reference: "local-development-explicit-grant-v1".into(),
                policies: vec![],
            }
        } else {
            Decision::Deny {
                reason: "actor or resource is outside the development capability".into(),
            }
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn now(answer: Answer<'_>) -> Decision {
        // Every answer here is already known; poll it once.
        let waker = std::task::Waker::noop();
        let mut cx = std::task::Context::from_waker(waker);
        let mut answer = answer;
        match answer.as_mut().poll(&mut cx) {
            std::task::Poll::Ready(d) => d,
            std::task::Poll::Pending => panic!("a known answer is ready at once"),
        }
    }
    #[test]
    fn places_are_each_named_once_in_order() {
        let r = |p: &str| Resource { uid: Uuid::nil(), path: p.into(), revision: 0, authority_scope: Uuid::nil() };
        assert_eq!(places(&[r("noi.b"), r("noi.a"), r("noi.b")]), vec!["noi.a", "noi.b"]);
    }
    #[test]
    fn fails_closed_and_checks_every_resource() {
        let actor = Actor {
            subject: "dev".into(),
        };
        let mut request = AuthorizationRequest {
            actor,
            action: Action::Update,
            resources: vec![Resource {
                uid: Uuid::new_v4(),
                path: "noi.inv".into(),
                revision: 1,
                authority_scope: Uuid::nil(),
            }],
            intent: Value::Null,
        };
        assert!(matches!(now(DenyAll.authorize(&request)), Decision::Deny { .. }));
        let grant = LocalDevelopmentGrant::new("dev".into(), "noi.inv".into()).unwrap();
        assert!(matches!(now(grant.authorize(&request)), Decision::Allow { .. }));
        request.resources[0].path = "noi.inv-evil".into();
        assert!(matches!(now(grant.authorize(&request)), Decision::Deny { .. }));
        request.resources.clear();
        assert!(matches!(now(grant.authorize(&request)), Decision::Deny { .. }));
    }
}
