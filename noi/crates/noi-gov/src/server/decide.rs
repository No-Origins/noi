//! "May they?" Governance finds who is asking, links their grants into the roles it keeps, adds the
//! rules, and asks Cedar about every resource. No answer, no roles and rules, an unknown action or
//! any doubt means no, and every answer is recorded.
use super::{digest, record, Error, Governance, Result, SESSION_DAYS, SESSION_HOURS, VISITORS};
use crate::{Action, Credential, Target, GOVERNANCE_ACTIONS};
use cedar_policy::{
    Authorizer, Context, Decision, Entities, Entity, EntityUid, Policy, PolicyId, PolicySet,
    Request, SlotId, Template,
};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{PgConnection, Postgres, Transaction};
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
    /// Where this answer is in the record. None for an allowed read, which is not recorded (agreed 9
    /// Nov, finding I): it would make the record a browsing history of everyone, kept forever.
    pub record: Option<i64>,
}

/// How a question is confirmed: by nothing, by a touch made for exactly it, or as one of several
/// questions confirmed together by the touch made for the first (an invite and the roles it gives,
/// 9 Nov).
#[derive(Clone, Copy)]
pub(crate) enum Proof {
    Nothing,
    Touch(Uuid),
    WithTheFirst,
    /// Only for "what may I do here?": as if a touch were made, since one will be when they act.
    AsIfTouched,
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
    uid(&format!(
        "{kind}::{}",
        serde_json::to_string(id).expect("a string")
    ))
}
/// A role's Cedar name: its path under noi.gov.roles, as the rules write it (Role::"owner").
pub(crate) fn role_name(path: &str) -> &str {
    path.strip_prefix("noi.gov.roles.").unwrap_or(path)
}
/// The place and every place above it: noi.eio.color → noi.eio.color, noi.eio, noi.
fn ancestry(path: &str) -> Vec<String> {
    let parts: Vec<&str> = path.split('.').collect();
    (1..=parts.len())
        .rev()
        .map(|n| parts[..n].join("."))
        .collect()
}
fn covers(scope: &str, path: &str) -> bool {
    path == scope || path.starts_with(&format!("{scope}."))
}
fn declared(action: &str) -> bool {
    Action::ALL.iter().any(|a| a.as_str() == action) || GOVERNANCE_ACTIONS.contains(&action)
}

async fn handle_of(conn: &mut PgConnection, account: Uuid) -> Result<String> {
    Ok(
        sqlx::query_scalar("SELECT handle FROM gov.accounts WHERE id = $1")
            .bind(account)
            .fetch_one(conn)
            .await?,
    )
}

/// The canonical form of what a touch approves: one action on these resources, in order, and what
/// else it names (9 Nov, step 7): the decision and each proposal at its revision, the role and
/// place, the invitee and their roles. A touch made for one never counts for another.
pub(crate) fn intent(action: &str, targets: &[Target], about: Option<&Value>) -> Value {
    let mut resources: Vec<String> = targets.iter().map(Target::label).collect();
    resources.sort();
    match about {
        Some(about) if !about.is_null() => {
            json!({"action": action, "resources": resources, "about": about})
        }
        _ => json!({"action": action, "resources": resources}),
    }
}

/// One question of a decision: an action on targets, what its touch names beyond them, and how it
/// is confirmed.
pub(crate) struct Ask<'a> {
    action: &'a str,
    targets: &'a [Target],
    about: Option<&'a Value>,
    proof: Proof,
}
impl<'a> Ask<'a> {
    pub(crate) fn new(
        action: &'a str,
        targets: &'a [Target],
        about: Option<&'a Value>,
        touch: Option<Proof>,
    ) -> Self {
        Ask {
            action,
            targets,
            about,
            proof: touch.unwrap_or(Proof::Nothing),
        }
    }
    /// One of several questions confirmed by the touch made for the first.
    pub(crate) fn with_the_first(action: &'a str, targets: &'a [Target], touched: bool) -> Self {
        Ask {
            action,
            targets,
            about: None,
            proof: if touched {
                Proof::WithTheFirst
            } else {
                Proof::Nothing
            },
        }
    }
}

/// The first question, with its touch and what it names, then the rest confirmed with it.
pub(crate) fn together<'a>(
    first: (&'a str, &'a [Target]),
    about: Option<&'a Value>,
    touch: Option<Uuid>,
    then: &'a [(&'a str, Vec<Target>)],
) -> Vec<Ask<'a>> {
    let mut asks = vec![Ask::new(first.0, first.1, about, touch.map(Proof::Touch))];
    asks.extend(
        then.iter()
            .map(|(a, t)| Ask::with_the_first(a, t, touch.is_some())),
    );
    asks
}

/// A refused question: who asked, why, and what, for the record.
pub(crate) struct Refusal {
    account: Option<Uuid>,
    failure: Failure,
    action: String,
    labels: Vec<String>,
}

impl Governance {
    /// Checks a credential. A session must be live and its person active; a run token must be live,
    /// its agent active and its sponsor active.
    pub(crate) async fn asker(
        &self,
        conn: &mut PgConnection,
        credential: &Credential,
    ) -> Result<Asker> {
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
                // A session runs on while it is used (agreed 9 Nov): each use moves its end to
                // SESSION_HOURS away, never past SESSION_DAYS after signing in. Written at most every
                // few minutes, not on every request.
                sqlx::query(
                    "UPDATE gov.sessions SET expires_at = LEAST(now() + make_interval(hours => $2), started_at + make_interval(days => $3))
                     WHERE token_hash = $1 AND expires_at < now() + make_interval(hours => $2) - interval '5 minutes'
                       AND expires_at < started_at + make_interval(days => $3)",
                )
                .bind(&hash)
                .bind(SESSION_HOURS as i32)
                .bind(SESSION_DAYS as i32)
                .execute(&mut *conn)
                .await?;
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
                    Error::Refused(
                        "no live run token, or its agent or sponsor is not active".into(),
                    )
                })?;
                Ok(Asker {
                    account,
                    kind: "agent".into(),
                    session: None,
                })
            }
        }
    }

    /// "May they?" Every resource must be allowed. Records the answer, except an allowed read (agreed
    /// 9 Nov): every change, every other question and every refusal is recorded. `about` is what a
    /// touch names beyond the places (step 7): which decision on which proposals, which role where.
    pub async fn may(
        &self,
        credential: &Credential,
        action: &str,
        targets: &[Target],
        touch: Option<Uuid>,
    ) -> Result<Answer> {
        self.may_about(credential, action, targets, touch, None)
            .await
    }
    pub async fn may_about(
        &self,
        credential: &Credential,
        action: &str,
        targets: &[Target],
        touch: Option<Uuid>,
        about: Option<&Value>,
    ) -> Result<Answer> {
        self.ask_alone(
            credential,
            &[Ask::new(action, targets, about, touch.map(Proof::Touch))],
        )
        .await
    }

    /// A decision on its own, in its own transaction.
    async fn ask_alone(&self, credential: &Credential, asks: &[Ask<'_>]) -> Result<Answer> {
        let mut tx = self.pool.begin().await?;
        match self.decide_all(&mut tx, credential, asks).await {
            Ok((account, seqs)) => {
                let handle = handle_of(tx.as_mut(), account).await?;
                tx.commit().await?;
                Ok(Answer {
                    allowed: true,
                    reason: "allowed".into(),
                    account: Some(account),
                    handle: Some(handle),
                    record: seqs.first().copied().flatten(),
                })
            }
            Err(no) => {
                // Nothing a refused request touched is kept, but the refusal itself is recorded.
                tx.rollback().await?;
                self.refused(no).await
            }
        }
    }

    /// A decision inside the transaction that does what it decides (9 Nov, step 7): an owner's
    /// action is decided where it is written, not one step before. Refused, the transaction is
    /// undone and the refusal recorded.
    pub(crate) async fn decide_in<'t>(
        &'t self,
        mut tx: Transaction<'t, Postgres>,
        credential: &Credential,
        asks: &[Ask<'_>],
    ) -> Result<(Transaction<'t, Postgres>, Uuid)> {
        match self.decide_all(tx.as_mut(), credential, asks).await {
            Ok((account, _)) => Ok((tx, account)),
            Err(no) => {
                tx.rollback().await?;
                let answer = self.refused(no).await?;
                Err(Error::Refused(answer.reason))
            }
        }
    }

    /// Decides every question, recording each allowed one (but an allowed read) where it is decided.
    async fn decide_all(
        &self,
        conn: &mut PgConnection,
        credential: &Credential,
        asks: &[Ask<'_>],
    ) -> std::result::Result<(Uuid, Vec<Option<i64>>), Refusal> {
        let mut who = None;
        let mut seqs = vec![];
        for ask in asks {
            let labels: Vec<String> = ask.targets.iter().map(Target::label).collect();
            let refusal = |account: Option<Uuid>, failure: Failure| Refusal {
                account,
                failure,
                action: ask.action.to_string(),
                labels: labels.clone(),
            };
            let (account, determined) = self
                .decide(
                    &mut *conn,
                    credential,
                    ask.action,
                    ask.targets,
                    ask.proof,
                    ask.about,
                )
                .await
                .map_err(|(account, failure)| refusal(account, failure))?;
            who = Some(account);
            seqs.push(if ask.action == "read" {
                None
            } else {
                Some(
                    record(
                        &mut *conn,
                        "decision",
                        Some(account),
                        Some(ask.action),
                        &labels,
                        true,
                        "allowed",
                        json!({"policies": determined}),
                    )
                    .await
                    .map_err(|e| refusal(Some(account), Failure::Broken(e)))?,
                )
            });
        }
        let account = who.ok_or_else(|| Refusal {
            account: None,
            failure: Failure::No("nothing was asked".into()),
            action: String::new(),
            labels: vec![],
        })?;
        Ok((account, seqs))
    }

    /// Records a refusal on its own connection, after its transaction is undone, and answers no; or,
    /// when Governance itself failed, records only that it said no and returns the error.
    async fn refused(&self, no: Refusal) -> Result<Answer> {
        let reason = match no.failure {
            Failure::No(reason) => reason,
            Failure::Broken(e) => {
                self.note_broken(no.account, &no.action, &no.labels).await;
                return Err(e);
            }
        };
        let mut conn = self.pool.acquire().await?;
        // A signed-out look that is refused is not recorded (10 Nov): anyone could fill the record,
        // which is kept forever, by loading pages. Everything else refused still is.
        let look = matches!(no.action.as_str(), "read" | "read-review");
        let seq = if look && no.account == Some(super::VISITORS) {
            None
        } else {
            Some(
                record(
                    &mut conn,
                    "decision",
                    no.account,
                    Some(&no.action),
                    &no.labels,
                    false,
                    &reason,
                    json!({}),
                )
                .await?,
            )
        };
        let handle = match no.account {
            Some(a) => Some(handle_of(&mut conn, a).await?),
            None => None,
        };
        Ok(Answer {
            allowed: false,
            reason,
            account: no.account,
            handle,
            record: seq,
        })
    }

    /// "What may they do here?" (agreed 9 Nov, step 6): so a page shows only the buttons its viewer
    /// may use. Each question is decided as if confirmed with a touch, since one will be when they
    /// act, and nothing is recorded: nothing is done with these answers. The real question is asked,
    /// and recorded, when they act.
    pub async fn may_preview(
        &self,
        credential: &Credential,
        questions: &[(String, Vec<Target>)],
    ) -> Result<Vec<bool>> {
        if questions.len() > MAX_PREVIEW {
            return Err(Error::Invalid(format!(
                "at most {MAX_PREVIEW} questions at once"
            )));
        }
        let mut tx = self.pool.begin().await?;
        let mut answers = Vec::with_capacity(questions.len());
        for (action, targets) in questions {
            answers.push(
                match self
                    .decide(
                        &mut tx,
                        credential,
                        action,
                        targets,
                        Proof::AsIfTouched,
                        None,
                    )
                    .await
                {
                    Ok(_) => true,
                    Err((_, Failure::No(_))) => false,
                    Err((_, Failure::Broken(e))) => return Err(e),
                },
            );
        }
        // Only a sign-in's end may have moved, as on any use.
        tx.commit().await?;
        Ok(answers)
    }

    /// Records that Governance failed to decide, if it can: a refusal with no inner reason.
    async fn note_broken(&self, account: Option<Uuid>, action: &str, labels: &[String]) {
        if let Ok(mut conn) = self.pool.acquire().await {
            let _ = record(
                &mut conn,
                "decision",
                account,
                Some(action),
                labels,
                false,
                BROKEN,
                json!({}),
            )
            .await;
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
        proof: Proof,
        about: Option<&Value>,
    ) -> std::result::Result<(Uuid, Vec<String>), (Option<Uuid>, Failure)> {
        let asker = self
            .asker(conn, credential)
            .await
            .map_err(|e| (None, Failure::from(e)))?;
        let who = Some(asker.account);
        if !declared(action) {
            return Err((
                who,
                format!("{action} is not an action any system declares").into(),
            ));
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
                super::check_scope(p).map_err(|e| (who, Failure::from(e)))?;
            }
        }
        let fresh = match proof {
            Proof::Touch(id) => self
                .use_touch(conn, &asker, id, &intent(action, targets, about))
                .await
                .map_err(|e| (who, Failure::from(e)))?,
            Proof::WithTheFirst | Proof::AsIfTouched => true,
            Proof::Nothing => false,
        };
        let in_force = in_force(conn).await.map_err(|e| (who, Failure::from(e)))?;
        let grants = self
            .live_grants(conn, asker.account)
            .await
            .map_err(|e| (who, Failure::from(e)))?;
        let policies = policy_set_of(&in_force, asker.account, &grants)
            .map_err(|e| (who, Failure::from(e)))?;
        let mut determined = HashSet::new();
        for target in targets {
            let reasons = answer(&policies, asker.account, &grants, action, target, fresh)
                .map_err(|why| (who, Failure::No(why)))?;
            determined.extend(reasons);
        }
        let mut determined: Vec<String> = determined.into_iter().collect();
        determined.sort();
        Ok((asker.account, determined))
    }

    /// The live grants of an account whose role is in force: (grant, role path, scope).
    pub(crate) async fn live_grants(
        &self,
        conn: &mut PgConnection,
        account: Uuid,
    ) -> Result<Vec<Grant>> {
        Ok(sqlx::query_as(
            "SELECT g.id, g.role, g.scope FROM gov.grants g JOIN gov.policies p ON p.path = g.role AND p.kind = 'role'
             WHERE g.account = $1 AND g.ended_at IS NULL ORDER BY g.granted_at",
        )
        .bind(account)
        .fetch_all(conn)
        .await?)
    }

    /// A touch counts once, for the session and person that made it, for exactly what it approved,
    /// within a minute.
    async fn use_touch(
        &self,
        conn: &mut PgConnection,
        asker: &Asker,
        id: Uuid,
        intent: &Value,
    ) -> Result<bool> {
        self.take_touch(conn, asker, id, intent).await.map(|_| true)
    }

    /// Uses a touch, as `use_touch`, and says which passkey made it, when Governance knows (touches
    /// made before 9 Nov didn't keep it).
    pub(crate) async fn take_touch(
        &self,
        conn: &mut PgConnection,
        asker: &Asker,
        id: Uuid,
        intent: &Value,
    ) -> Result<Option<Uuid>> {
        let Some(session) = &asker.session else {
            return Err(Error::Refused("only a signed-in person can touch".into()));
        };
        let used: Option<Option<Uuid>> = sqlx::query_scalar(
            "UPDATE gov.touches SET used_at = now()
             WHERE id = $1 AND account = $2 AND session = $3 AND intent = $4 AND used_at IS NULL AND expires_at > now()
             RETURNING passkey",
        )
        .bind(id)
        .bind(asker.account)
        .bind(session)
        .bind(intent)
        .fetch_optional(conn)
        .await?;
        used.ok_or_else(|| {
            Error::Refused("the touch is used, expired, or was for something else".into())
        })
    }
}

/// A grant as Governance links it: its ID, the role's path, and where.
pub(crate) type Grant = (Uuid, String, String);
/// A role or rule Governance decides with: its path, role or rule, its Cedar, and its state (active,
/// or deprecated: set aside).
pub(crate) type InForce = (String, String, String, String);

/// The roles and rules in force now (agreed 9 Nov, "Where Roles and Rules Live", decision 1): the
/// newest version of each, kept by Governance itself. None means no one may do anything.
pub(crate) async fn in_force(conn: &mut PgConnection) -> Result<Vec<InForce>> {
    let rows: Vec<InForce> =
        sqlx::query_as("SELECT path, kind, cedar, state FROM gov.policies ORDER BY path")
            .fetch_all(conn)
            .await?;
    if rows.is_empty() {
        return Err(Error::Refused(
            "Governance holds no roles and rules yet".into(),
        ));
    }
    Ok(rows)
}

/// The roles as templates, the rules, and this account's grants of roles in force linked in. A
/// grant of a role that is not in force links nothing.
pub(crate) fn policy_set_of(
    in_force: &[InForce],
    account: Uuid,
    grants: &[Grant],
) -> Result<PolicySet> {
    let mut set = PolicySet::new();
    let broken =
        |e: String| Error::Refused(format!("the roles and rules in force do not load: {e}"));
    for (path, kind, cedar, _) in in_force {
        if kind == "role" {
            let t = Template::parse(Some(PolicyId::new(path)), cedar)
                .map_err(|e| broken(e.to_string()))?;
            set.add_template(t).map_err(|e| broken(e.to_string()))?;
        } else {
            let p = Policy::parse(Some(PolicyId::new(path)), cedar)
                .map_err(|e| broken(e.to_string()))?;
            set.add(p).map_err(|e| broken(e.to_string()))?;
        }
    }
    for (id, role, scope) in grants {
        if !in_force.iter().any(|(p, k, _, _)| p == role && k == "role") {
            continue;
        }
        let fill = HashMap::from([
            (SlotId::principal(), quoted("Account", &account.to_string())),
            (SlotId::resource(), quoted("Scope", scope)),
        ]);
        set.link(
            PolicyId::new(role),
            PolicyId::new(format!("grant:{id}")),
            fill,
        )
        .map_err(|e| broken(e.to_string()))?;
    }
    Ok(set)
}

/// Cedar's answer for one account, action and target: the policies that allowed it, or why not.
/// Nothing here reads the database, so the no-lockout check can ask about roles and rules that are
/// only proposed (decision 4).
pub(crate) fn answer(
    policies: &PolicySet,
    account: Uuid,
    grants: &[Grant],
    action: &str,
    target: &Target,
    fresh: bool,
) -> std::result::Result<Vec<String>, String> {
    let Evaluated {
        allowed,
        reasons,
        erring,
    } = evaluate(policies, account, grants, action, target, fresh)?;
    if !erring.is_empty() {
        return Err("a policy could not be evaluated, so no".into());
    }
    if allowed {
        return Ok(reasons);
    }
    let forbids: Vec<&String> = reasons
        .iter()
        .filter(|r| !r.starts_with("grant:"))
        .collect();
    Err(if forbids.is_empty() {
        format!("no grant allows {action} on {}", target.label())
    } else {
        format!(
            "{} says no",
            forbids
                .iter()
                .map(|s| s.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )
    })
}

/// What Cedar said about one question.
pub(crate) struct Evaluated {
    pub allowed: bool,
    /// The policies that decided: the grants that allowed it, or the rules that said no.
    pub reasons: Vec<String>,
    /// The policies that could not be evaluated. Any one of them means no.
    pub erring: Vec<String>,
}

/// Whether Cedar allows it, which policies decided, and which could not be evaluated. Err only when
/// it could not be asked at all.
pub(crate) fn evaluate(
    policies: &PolicySet,
    account: Uuid,
    grants: &[Grant],
    action: &str,
    target: &Target,
    fresh: bool,
) -> std::result::Result<Evaluated, String> {
    let schema = crate::cedar::schema();
    let action_uid = quoted("Action", action);
    let context = Context::from_json_value(
        json!({"fresh_signature": fresh}),
        Some((schema, &action_uid)),
    )
    .map_err(|e| format!("context: {e}"))?;
    let principal = quoted("Account", &account.to_string());
    let (resource, place, mut extra) = match target {
        Target::Path(p) => (quoted("Scope", p), p.clone(), vec![]),
        Target::Account(id) => {
            let other = quoted("Account", &id.to_string());
            let entity =
                Entity::new_no_attrs(other.clone(), HashSet::from([quoted("Scope", "noi")]));
            (
                other,
                "noi".to_string(),
                if *id == account { vec![] } else { vec![entity] },
            )
        }
    };
    // The asker is in each role they hold where this resource is.
    let mut parents: HashSet<EntityUid> = HashSet::from([quoted("Scope", "noi")]);
    for (_, role, scope) in grants {
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
        let up = chain
            .get(i + 1)
            .map(|q| HashSet::from([quoted("Scope", q)]))
            .unwrap_or_default();
        entities.push(Entity::new_no_attrs(quoted("Scope", p), up));
    }
    entities.append(&mut extra);
    let entities =
        Entities::from_entities(entities, Some(schema)).map_err(|e| format!("entities: {e}"))?;
    let request = Request::new(principal, action_uid, resource, context, Some(schema))
        .map_err(|e| format!("{action} does not apply here: {e}"))?;
    let response = Authorizer::new().is_authorized(&request, policies, &entities);
    let reasons: Vec<String> = response
        .diagnostics()
        .reason()
        .map(|p| p.to_string())
        .collect();
    let erring = response
        .diagnostics()
        .errors()
        .map(|e| match e {
            cedar_policy::AuthorizationError::PolicyEvaluationError(e) => e.policy_id().to_string(),
        })
        .collect();
    Ok(Evaluated {
        allowed: response.decision() == Decision::Allow,
        reasons,
        erring,
    })
}

/// Why a question wasn't allowed: a refusal, whose reason is safe to show and keep; or Governance
/// itself failing (its database, say), which is an error, not an answer: its inner reason goes to
/// the log and the Problems page, never into the record or to the asker (architecture review, 9 Nov).
pub(crate) enum Failure {
    No(String),
    Broken(Error),
}
impl From<Error> for Failure {
    fn from(e: Error) -> Self {
        match e {
            Error::Refused(r) | Error::Invalid(r) => Failure::No(r),
            Error::NotFound(r) => Failure::No(format!("not found: {r}")),
            other => Failure::Broken(other),
        }
    }
}
impl From<String> for Failure {
    fn from(r: String) -> Self {
        Failure::No(r)
    }
}
impl From<&str> for Failure {
    fn from(r: &str) -> Self {
        Failure::No(r.into())
    }
}
/// At most this many questions in one "what may they do here?".
const MAX_PREVIEW: usize = 50;
/// What the record keeps when Governance failed: that it said no, never why.
const BROKEN: &str = "Governance could not decide, so no";

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn places_cover_what_is_below_them() {
        assert_eq!(
            ancestry("noi.eio.color"),
            ["noi.eio.color", "noi.eio", "noi"]
        );
        assert!(covers("noi", "noi.gov.roles.owner"));
        assert!(covers("noi.eio", "noi.eio"));
        assert!(!covers("noi.eio", "noi.eio-evil"));
        assert!(!covers("noi.eio.color", "noi.eio"));
        assert_eq!(role_name("noi.gov.roles.owner"), "owner");
        assert_eq!(role_name("noi.gov.roles.eidos.editor"), "eidos.editor");
    }
    #[test]
    fn a_touch_names_one_action_and_its_resources_in_order() {
        let a = intent(
            "review",
            &[Target::Path("noi.b".into()), Target::Path("noi.a".into())],
            None,
        );
        let b = intent(
            "review",
            &[Target::Path("noi.a".into()), Target::Path("noi.b".into())],
            None,
        );
        assert_eq!(a, b);
        assert_ne!(
            a,
            intent(
                "update",
                &[Target::Path("noi.a".into()), Target::Path("noi.b".into())],
                None,
            )
        );
        // What else it names (step 7): a touch to approve is not one to send back.
        let places = [Target::Path("noi.a".into())];
        let approve = json!({"decision": "approve", "proposals": ["p@1"]});
        let send_back = json!({"decision": "send-back", "proposals": ["p@1"]});
        assert_ne!(
            intent("review", &places, Some(&approve)),
            intent("review", &places, Some(&send_back))
        );
        assert_eq!(
            intent("review", &places, Some(&Value::Null)),
            intent("review", &places, None)
        );
    }
}
