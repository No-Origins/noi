//! "May they?" Governance finds who is asking, links their grants into the roles it copied from
//! Mero, adds the rules, and asks Cedar about every resource. No answer, no copy, an unknown action
//! or any doubt means no, and every answer is recorded.
use super::{digest, record, Error, Governance, Result, VISITORS};
use crate::{Action, Credential, Target, GOVERNANCE_ACTIONS};
use cedar_policy::{
    Authorizer, Context, Decision, Entities, Entity, EntityUid, Policy, PolicyId, PolicySet,
    Request, SlotId, Template,
};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::PgConnection;
use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use uuid::Uuid;

impl Target {
    pub(crate) fn label(&self) -> String {
        match self {
            Target::Path(p) => p.clone(),
            Target::Account(id) => format!("account:{id}"),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Answer {
    pub allowed: bool,
    pub reason: String,
    pub account: Option<Uuid>,
    /// The asker's handle, so a system can write who did it without reading Governance's tables.
    pub handle: Option<String>,
    /// Where this answer is in the record.
    pub record: i64,
}

/// Who is asking, once their credential checks out.
#[derive(Debug, Clone)]
pub(crate) struct Asker {
    pub account: Uuid,
    pub kind: String,
    pub session: Option<Vec<u8>>,
}

fn uid(text: &str) -> EntityUid {
    EntityUid::from_str(text).expect("entity names are built from checked parts")
}
fn quoted(kind: &str, id: &str) -> EntityUid {
    uid(&format!("{kind}::{}", serde_json::to_string(id).expect("a string")))
}
/// A role's Cedar name: its path under noi.gov.roles, as the rules write it (Role::"owner").
pub(crate) fn role_name(path: &str) -> &str {
    path.strip_prefix("noi.gov.roles.").unwrap_or(path)
}
/// The place and every place above it: noi.eio.color → noi.eio.color, noi.eio, noi.
fn ancestry(path: &str) -> Vec<String> {
    let parts: Vec<&str> = path.split('.').collect();
    (1..=parts.len()).rev().map(|n| parts[..n].join(".")).collect()
}
fn covers(scope: &str, path: &str) -> bool {
    path == scope || path.starts_with(&format!("{scope}."))
}
fn declared(action: &str) -> bool {
    Action::ALL.iter().any(|a| a.as_str() == action) || GOVERNANCE_ACTIONS.contains(&action)
}

async fn handle_of(conn: &mut PgConnection, account: Uuid) -> Result<String> {
    Ok(sqlx::query_scalar("SELECT handle FROM gov.accounts WHERE id = $1").bind(account).fetch_one(conn).await?)
}

/// The canonical form of what a touch approves: one action on these resources, in order.
pub(crate) fn intent(action: &str, targets: &[Target]) -> Value {
    let mut resources: Vec<String> = targets.iter().map(Target::label).collect();
    resources.sort();
    json!({"action": action, "resources": resources})
}

impl Governance {
    /// Checks a credential. A session must be live and its person active; a run token must be live,
    /// its agent active and its sponsor active.
    pub(crate) async fn asker(&self, conn: &mut PgConnection, credential: &Credential) -> Result<Asker> {
        match credential {
            Credential::Visitor => Ok(Asker {
                account: VISITORS,
                kind: "visitors".into(),
                session: None,
            }),
            Credential::Session(token) => {
                let hash = digest(token);
                let row: Option<(Uuid, String)> = sqlx::query_as(
                    "SELECT a.id, a.kind FROM gov.sessions s JOIN gov.accounts a ON a.id = s.account
                     WHERE s.token_hash = $1 AND s.ended_at IS NULL AND s.expires_at > now() AND a.state = 'active'",
                )
                .bind(&hash)
                .fetch_optional(&mut *conn)
                .await?;
                let (account, kind) =
                    row.ok_or_else(|| Error::Refused("no live session: sign in again".into()))?;
                Ok(Asker {
                    account,
                    kind,
                    session: Some(hash),
                })
            }
            Credential::RunToken(token) => {
                let row: Option<(Uuid,)> = sqlx::query_as(
                    "SELECT a.id FROM gov.run_tokens t JOIN gov.accounts a ON a.id = t.agent
                     JOIN gov.accounts s ON s.id = a.sponsor
                     WHERE t.token_hash = $1 AND t.ended_at IS NULL AND t.expires_at > now()
                       AND a.state = 'active' AND s.state = 'active'",
                )
                .bind(digest(token))
                .fetch_optional(&mut *conn)
                .await?;
                let (account,) = row.ok_or_else(|| {
                    Error::Refused("no live run token, or its agent or sponsor is not active".into())
                })?;
                Ok(Asker {
                    account,
                    kind: "agent".into(),
                    session: None,
                })
            }
        }
    }

    /// "May they?" Every resource must be allowed. Records the answer either way.
    pub async fn may(
        &self,
        credential: &Credential,
        action: &str,
        targets: &[Target],
        touch: Option<Uuid>,
    ) -> Result<Answer> {
        let labels: Vec<String> = targets.iter().map(Target::label).collect();
        let mut tx = self.pool.begin().await?;
        match self.decide(&mut tx, credential, action, targets, touch).await {
            Ok((account, determined)) => {
                let seq = record(&mut tx, "decision", Some(account), Some(action), &labels, true, "allowed", json!({"policies": determined})).await?;
                let handle = handle_of(tx.as_mut(), account).await?;
                tx.commit().await?;
                Ok(Answer { allowed: true, reason: "allowed".into(), account: Some(account), handle: Some(handle), record: seq })
            }
            Err((account, reason)) => {
                // Nothing a refused request touched is kept, but the refusal itself is recorded.
                tx.rollback().await?;
                let mut conn = self.pool.acquire().await?;
                let seq = record(&mut conn, "decision", account, Some(action), &labels, false, &reason, json!({})).await?;
                let handle = match account {
                    Some(a) => Some(handle_of(&mut conn, a).await?),
                    None => None,
                };
                Ok(Answer { allowed: false, reason, account, handle, record: seq })
            }
        }
    }

    /// The decision itself: Ok with the asker and the policies that allowed it, or Err with the
    /// asker if known and why not.
    async fn decide(
        &self,
        conn: &mut PgConnection,
        credential: &Credential,
        action: &str,
        targets: &[Target],
        touch: Option<Uuid>,
    ) -> std::result::Result<(Uuid, Vec<String>), (Option<Uuid>, String)> {
        let asker = self.asker(conn, credential).await.map_err(|e| (None, refusal(e)))?;
        let who = Some(asker.account);
        if !declared(action) {
            return Err((who, format!("{action} is not an action any system declares")));
        }
        if targets.is_empty() {
            return Err((who, "an action needs at least one resource".into()));
        }
        // Rule 5: signed out, at most reading, whatever an owner grants visitors.
        if asker.kind == "visitors" && action != "read" {
            return Err((who, "signed out: at most reading".into()));
        }
        for t in targets {
            if let Target::Path(p) = t {
                super::check_scope(p).map_err(|e| (who, refusal(e)))?;
            }
        }
        let fresh = match touch {
            Some(id) => self
                .use_touch(conn, &asker, id, &intent(action, targets))
                .await
                .map_err(|e| (who, refusal(e)))?,
            None => false,
        };
        let policies = self.policy_set(conn, asker.account).await.map_err(|e| (who, refusal(e)))?;
        let grants = self.live_grants(conn, asker.account).await.map_err(|e| (who, refusal(e)))?;
        let schema = crate::cedar::schema();
        let action_uid = quoted("Action", action);
        let context = Context::from_json_value(json!({"fresh_signature": fresh}), Some((schema, &action_uid)))
            .map_err(|e| (who, format!("context: {e}")))?;
        let principal = quoted("Account", &asker.account.to_string());
        let mut determined = HashSet::new();
        for target in targets {
            let (resource, place, mut extra) = match target {
                Target::Path(p) => (quoted("Scope", p), p.clone(), vec![]),
                Target::Account(id) => {
                    let account = quoted("Account", &id.to_string());
                    let entity = Entity::new_no_attrs(account.clone(), HashSet::from([quoted("Scope", "noi")]));
                    (account, "noi".to_string(), if *id == asker.account { vec![] } else { vec![entity] })
                }
            };
            // The asker is in each role they hold where this resource is.
            let mut parents: HashSet<EntityUid> = HashSet::from([quoted("Scope", "noi")]);
            for (role, scope) in &grants {
                if covers(scope, &place) {
                    parents.insert(quoted("Role", role_name(role)));
                }
            }
            let mut entities: Vec<Entity> = vec![Entity::new_no_attrs(principal.clone(), parents.clone())];
            for role in &parents {
                if role.type_name().to_string() == "Role" {
                    entities.push(Entity::new_no_attrs(role.clone(), HashSet::new()));
                }
            }
            let chain = ancestry(&place);
            for (i, p) in chain.iter().enumerate() {
                let up = chain.get(i + 1).map(|q| HashSet::from([quoted("Scope", q)])).unwrap_or_default();
                entities.push(Entity::new_no_attrs(quoted("Scope", p), up));
            }
            entities.append(&mut extra);
            let entities = Entities::from_entities(entities, Some(schema)).map_err(|e| (who, format!("entities: {e}")))?;
            let request = Request::new(principal.clone(), action_uid.clone(), resource, context.clone(), Some(schema))
                .map_err(|e| (who, format!("{action} does not apply here: {e}")))?;
            let response = Authorizer::new().is_authorized(&request, &policies, &entities);
            let reasons: Vec<String> = response.diagnostics().reason().map(|p| p.to_string()).collect();
            if !response.diagnostics().errors().collect::<Vec<_>>().is_empty() {
                return Err((who, "a policy could not be evaluated, so no".into()));
            }
            if response.decision() != Decision::Allow {
                let forbids: Vec<&String> = reasons.iter().filter(|r| !r.starts_with("grant:")).collect();
                let why = if forbids.is_empty() {
                    format!("no grant allows {action} on {}", target.label())
                } else {
                    format!("{} says no", forbids.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", "))
                };
                return Err((who, why));
            }
            determined.extend(reasons);
        }
        let mut determined: Vec<String> = determined.into_iter().collect();
        determined.sort();
        Ok((asker.account, determined))
    }

    /// The live grants of an account whose role is in the copy: (role path, scope).
    async fn live_grants(&self, conn: &mut PgConnection, account: Uuid) -> Result<Vec<(String, String)>> {
        Ok(sqlx::query_as(
            "SELECT g.role, g.scope FROM gov.grants g JOIN gov.policies p ON p.path = g.role AND p.kind = 'role'
             WHERE g.account = $1 AND g.ended_at IS NULL ORDER BY g.granted_at",
        )
        .bind(account)
        .fetch_all(conn)
        .await?)
    }

    /// The copied roles as templates, the copied rules, and this account's grants linked in.
    async fn policy_set(&self, conn: &mut PgConnection, account: Uuid) -> Result<PolicySet> {
        let copied: Vec<(String, String, String)> =
            sqlx::query_as("SELECT path, kind, cedar FROM gov.policies ORDER BY path")
                .fetch_all(&mut *conn)
                .await?;
        if copied.is_empty() {
            return Err(Error::Refused("Governance has no copy of the roles and rules yet".into()));
        }
        let mut set = PolicySet::new();
        let broken = |e: String| Error::Refused(format!("the copied roles and rules do not load: {e}"));
        for (path, kind, cedar) in &copied {
            if kind == "role" {
                let t = Template::parse(Some(PolicyId::new(path)), cedar).map_err(|e| broken(e.to_string()))?;
                set.add_template(t).map_err(|e| broken(e.to_string()))?;
            } else {
                let p = Policy::parse(Some(PolicyId::new(path)), cedar).map_err(|e| broken(e.to_string()))?;
                set.add(p).map_err(|e| broken(e.to_string()))?;
            }
        }
        let grants: Vec<(Uuid, String, String)> = sqlx::query_as(
            "SELECT g.id, g.role, g.scope FROM gov.grants g JOIN gov.policies p ON p.path = g.role AND p.kind = 'role'
             WHERE g.account = $1 AND g.ended_at IS NULL",
        )
        .bind(account)
        .fetch_all(&mut *conn)
        .await?;
        for (id, role, scope) in grants {
            let fill = HashMap::from([
                (SlotId::principal(), quoted("Account", &account.to_string())),
                (SlotId::resource(), quoted("Scope", &scope)),
            ]);
            set.link(PolicyId::new(&role), PolicyId::new(format!("grant:{id}")), fill)
                .map_err(|e| broken(e.to_string()))?;
        }
        Ok(set)
    }

    /// A touch counts once, for the session and person that made it, for exactly what it approved,
    /// within a minute.
    async fn use_touch(&self, conn: &mut PgConnection, asker: &Asker, id: Uuid, intent: &Value) -> Result<bool> {
        let Some(session) = &asker.session else {
            return Err(Error::Refused("only a signed-in person can touch".into()));
        };
        let used = sqlx::query(
            "UPDATE gov.touches SET used_at = now()
             WHERE id = $1 AND account = $2 AND session = $3 AND intent = $4 AND used_at IS NULL AND expires_at > now()",
        )
        .bind(id)
        .bind(asker.account)
        .bind(session)
        .bind(intent)
        .execute(conn)
        .await?
        .rows_affected();
        if used == 1 {
            Ok(true)
        } else {
            Err(Error::Refused("the touch is used, expired, or was for something else".into()))
        }
    }
}

fn refusal(e: Error) -> String {
    match e {
        Error::Refused(r) | Error::Invalid(r) => r,
        Error::NotFound(r) => format!("not found: {r}"),
        other => format!("Governance could not decide, so no: {other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn places_cover_what_is_below_them() {
        assert_eq!(ancestry("noi.eio.color"), ["noi.eio.color", "noi.eio", "noi"]);
        assert!(covers("noi", "noi.gov.roles.owner"));
        assert!(covers("noi.eio", "noi.eio"));
        assert!(!covers("noi.eio", "noi.eio-evil"));
        assert!(!covers("noi.eio.color", "noi.eio"));
        assert_eq!(role_name("noi.gov.roles.owner"), "owner");
        assert_eq!(role_name("noi.gov.roles.eidos.editor"), "eidos.editor");
    }
    #[test]
    fn a_touch_names_one_action_and_its_resources_in_order() {
        let a = intent("review", &[Target::Path("noi.b".into()), Target::Path("noi.a".into())]);
        let b = intent("review", &[Target::Path("noi.a".into()), Target::Path("noi.b".into())]);
        assert_eq!(a, b);
        assert_ne!(a, intent("update", &[Target::Path("noi.a".into()), Target::Path("noi.b".into())]));
    }
}
