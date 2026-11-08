//! GOV-001 minimum local rules, kept as an in-process stand-in for tests. Since step 3 (7 Nov) no
//! binary uses it: Mero asks Governance's server, and the file of names is gone.
use crate::{answer, Action, Answer, AuthorizationRequest, Authorizer, Decision};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Role {
    Observer,
    Contributor,
    Maintainer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Scope {
    pub uid: Uuid,
    /// Explicit governance inheritance, independent of namespace and containment.
    pub parent: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Grant {
    pub subject: String,
    pub scope: Uuid,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GovernancePolicy {
    pub id: String,
    pub revision: u64,
    pub scopes: Vec<Scope>,
    pub grants: Vec<Grant>,
}

pub struct ScopedAuthorizer {
    policy: GovernancePolicy,
    parents: HashMap<Uuid, Option<Uuid>>,
}

impl ScopedAuthorizer {
    pub fn new(policy: GovernancePolicy) -> Result<Self, String> {
        if policy.id.trim().is_empty() || policy.id.len() > 200 || policy.revision == 0 {
            return Err("policy requires an ID and positive revision".into());
        }
        let mut parents = HashMap::new();
        for scope in &policy.scopes {
            if scope.uid.is_nil() || parents.insert(scope.uid, scope.parent).is_some() {
                return Err("nil or duplicate scope".into());
            }
        }
        if parents.is_empty() {
            return Err("at least one explicit scope is required".into());
        }
        for start in parents.keys() {
            let mut seen = HashSet::new();
            let mut cursor = Some(*start);
            while let Some(uid) = cursor {
                if !seen.insert(uid) {
                    return Err("governance scope inheritance contains a cycle".into());
                }
                cursor = *parents.get(&uid).ok_or("unknown parent scope")?;
            }
        }
        let mut assignments = HashSet::new();
        for grant in &policy.grants {
            if grant.subject.trim().is_empty()
                || grant.subject.len() > 200
                || grant.subject.contains('\0')
                || !parents.contains_key(&grant.scope)
                || !assignments.insert((grant.subject.clone(), grant.scope))
            {
                return Err("invalid or duplicate subject/scope assignment".into());
            }
        }
        Ok(Self { policy, parents })
    }

    fn role(&self, subject: &str, scope: Uuid) -> Option<Role> {
        // Ancestor restrictions cannot be widened by a child assignment.
        let mut cursor = Some(scope);
        let mut role = None;
        while let Some(uid) = cursor {
            let parent = *self.parents.get(&uid)?;
            if let Some(grant) = self
                .policy
                .grants
                .iter()
                .find(|g| g.subject == subject && g.scope == uid)
            {
                role = Some(role.map_or(grant.role, |r: Role| r.min(grant.role)));
            }
            cursor = parent;
        }
        role
    }
}

impl Authorizer for ScopedAuthorizer {
    fn authorize<'a>(&'a self, request: &'a AuthorizationRequest) -> Answer<'a> {
        answer(self.decide(request))
    }
}
impl ScopedAuthorizer {
    fn decide(&self, request: &AuthorizationRequest) -> Decision {
        let deny = |reason: &str| Decision::Deny {
            reason: reason.into(),
        };
        if request.actor.subject.trim().is_empty() || request.resources.is_empty() {
            return deny("trusted subject and nonempty resources required");
        }
        let roles: Option<Vec<Role>> = request
            .resources
            .iter()
            .map(|r| self.role(&request.actor.subject, r.authority_scope))
            .collect();
        let Some(roles) = roles else {
            return deny("no assignment for every resource governance scope");
        };
        let allowed = roles.iter().all(|role| match request.action {
            Action::Read => true,
            Action::Propose => *role != Role::Observer,
            _ => *role == Role::Maintainer,
        });
        if allowed {
            Decision::Allow {
                reference: format!(
                    "{}@{}:{}",
                    self.policy.id,
                    self.policy.revision,
                    Uuid::new_v4()
                ),
                policies: vec![format!("{}@{}", self.policy.id, self.policy.revision)],
            }
        } else if roles.contains(&Role::Observer) {
            deny("observer assignments permit reads only")
        } else {
            Decision::ApprovalRequired {
                reference: format!("{}@{}:maintainer-review", self.policy.id, self.policy.revision),
                reason: "a scoped maintainer must review and execute this exact operation; no write was committed".into(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Actor, Resource};
    use serde_json::json;

    fn setup() -> (GovernancePolicy, AuthorizationRequest) {
        let root = Uuid::new_v4();
        let child = Uuid::new_v4();
        (
            GovernancePolicy {
                id: "GOV-001-local".into(),
                revision: 1,
                scopes: vec![
                    Scope {
                        uid: root,
                        parent: None,
                    },
                    Scope {
                        uid: child,
                        parent: Some(root),
                    },
                ],
                grants: vec![
                    Grant {
                        subject: "agent".into(),
                        scope: root,
                        role: Role::Contributor,
                    },
                    Grant {
                        subject: "human".into(),
                        scope: root,
                        role: Role::Maintainer,
                    },
                ],
            },
            AuthorizationRequest {
                actor: Actor {
                    subject: "agent".into(),
                },
                action: Action::Propose,
                resources: vec![Resource {
                    uid: Uuid::new_v4(),
                    path: "noi.tests.token".into(),
                    revision: 1,
                    authority_scope: child,
                }],
                intent: json!({}),
            },
        )
    }

    #[test]
    fn every_action_is_gated_and_every_resource_is_checked() {
        let (policy, mut request) = setup();
        let auth = ScopedAuthorizer::new(policy).unwrap();
        assert!(matches!(auth.decide(&request), Decision::Allow { .. }));
        for action in [
            Action::Update,
            Action::EvolveBreaking,
            Action::Rename,
            Action::Transition,
            Action::Relate,
            Action::Unrelate,
            Action::Release,
            Action::TransitionRelease,
        ] {
            request.action = action;
            assert!(matches!(
                auth.decide(&request),
                Decision::ApprovalRequired { .. }
            ));
            request.actor.subject = "human".into();
            assert!(matches!(auth.decide(&request), Decision::Allow { .. }));
            request.actor.subject = "agent".into();
        }
        request.actor.subject = "human".into();
        let mut outsider = request.resources[0].clone();
        outsider.authority_scope = Uuid::new_v4();
        request.resources.push(outsider);
        assert!(matches!(auth.decide(&request), Decision::Deny { .. }));
        request.resources.clear();
        assert!(matches!(auth.decide(&request), Decision::Deny { .. }));
    }

    #[test]
    fn child_restrictions_and_unknown_actors_fail_closed() {
        let (mut policy, mut request) = setup();
        policy.grants.push(Grant {
            subject: "human".into(),
            scope: request.resources[0].authority_scope,
            role: Role::Observer,
        });
        let auth = ScopedAuthorizer::new(policy).unwrap();
        request.actor.subject = "human".into();
        assert!(matches!(auth.decide(&request), Decision::Deny { .. }));
        request.action = Action::Read;
        assert!(matches!(auth.decide(&request), Decision::Allow { .. }));
        request.actor.subject = "unknown".into();
        assert!(matches!(auth.decide(&request), Decision::Deny { .. }));
    }

    #[test]
    fn rejects_invalid_inheritance_and_ambiguous_grants() {
        let (mut policy, _) = setup();
        policy.scopes[0].parent = Some(policy.scopes[1].uid);
        assert!(ScopedAuthorizer::new(policy).is_err());
        let (mut policy, _) = setup();
        policy.scopes[0].parent = Some(Uuid::new_v4());
        assert!(ScopedAuthorizer::new(policy).is_err());
        let (mut policy, _) = setup();
        policy.grants.push(policy.grants[0].clone());
        assert!(ScopedAuthorizer::new(policy).is_err());
    }

    #[test]
    fn child_assignment_cannot_widen_ancestor_permissions() {
        let (mut policy, mut request) = setup();
        policy.grants.push(Grant {
            subject: "agent".into(),
            scope: request.resources[0].authority_scope,
            role: Role::Maintainer,
        });
        let auth = ScopedAuthorizer::new(policy).unwrap();
        request.action = Action::Release;
        assert!(matches!(
            auth.decide(&request),
            Decision::ApprovalRequired { .. }
        ));
    }
}
