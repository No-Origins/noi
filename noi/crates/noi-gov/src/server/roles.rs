//! Roles and rules, kept by Governance itself (agreed 9 Nov 2026, page "Where Roles and Rules
//! Live"). Every version is kept (decision 1); a change waits as a proposal until an owner approves
//! it with a touch, and the record says who did what (decision 2); nothing approved may leave no
//! one able to change roles and rules, and a recovery command on Governance's server is there for
//! the worst case (decision 4); the roles and rules Mero held move in once, with every revision
//! (decision 5). Governance never reads Mero.
//!
//! Proposing and approving ask the very questions Mero asked before the move, on the same places:
//! `propose`, `write-cedar` for Cedar the form can't read, and `review` to decide, on
//! `noi.gov.roles.…` and `noi.gov.rules.…`. So the rules in force say the same as before: only an
//! owner approves, with a fresh touch.
use super::{
    decide::{answer, evaluate, in_force, policy_set_of, Ask, Grant, InForce, Proof},
    record, Error, Governance, Result, Target, MAINTAINER, OWNER,
};
use crate::moving::{versions_of, MoveFile};
use crate::{check_role, check_rule, form, role_actions, Credential};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgConnection, Postgres, Transaction};
use uuid::Uuid;

/// What changing roles and rules takes: proposing and approving, in both places. Someone must
/// always be able to ask all four, with a touch (decision 4).
const CHANGING: [(&str, &str); 4] = [
    ("propose", "noi.gov.roles"),
    ("review", "noi.gov.roles"),
    ("propose", "noi.gov.rules"),
    ("review", "noi.gov.rules"),
];

/// The roles and rules a new Governance starts with (agreed 6 Nov): Maintainer and Owner, the
/// fresh-touch rule and "only owners approve roles and rules". `noi gov setup` writes them, once,
/// into a Governance that holds none. Every other role is made later, on Governance's pages.
const FIRST: [&str; 4] = [
    include_str!("../../../../data/gov/roles/maintainer.json"),
    include_str!("../../../../data/gov/roles/owner.json"),
    include_str!("../../../../data/gov/rules/fresh-touch.json"),
    include_str!("../../../../data/gov/rules/owners-approve-gov.json"),
];

/// One of the first roles and rules, as its file holds it.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct First {
    pub path: String,
    pub name: String,
    pub definition: String,
    pub responsibility: String,
    #[serde(default)]
    pub system: Option<String>,
    pub cedar: String,
}
/// The first roles and rules, read from the files built into Governance.
pub fn first() -> Vec<First> {
    FIRST
        .iter()
        .map(|f| {
            serde_json::from_str(f)
                .expect("the first roles and rules are valid; a test checks them")
        })
        .collect()
}

/// What a proposal does to a role or rule.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Operation {
    /// A new role or rule.
    Add,
    /// A change to what it says: its name, meaning or Cedar.
    Change,
    /// Deprecated: a role gets no new grants, and those it has keep working.
    SetAside,
    /// Back from set aside, meeting today's checks again.
    BringBack,
    /// Out of force for good. Retiring a role ends its grants.
    Retire,
}
impl Operation {
    pub fn as_str(self) -> &'static str {
        match self {
            Operation::Add => "add",
            Operation::Change => "change",
            Operation::SetAside => "set-aside",
            Operation::BringBack => "bring-back",
            Operation::Retire => "retire",
        }
    }
    fn parse(text: &str) -> Option<Self> {
        [
            Operation::Add,
            Operation::Change,
            Operation::SetAside,
            Operation::BringBack,
            Operation::Retire,
        ]
        .into_iter()
        .find(|o| o.as_str() == text)
    }
    /// The state it leaves the role or rule in, from the state it has.
    fn becomes(self, now: &str) -> &'static str {
        match self {
            Operation::Add | Operation::BringBack => "active",
            Operation::Change => {
                if now == "deprecated" {
                    "deprecated"
                } else {
                    "active"
                }
            }
            Operation::SetAside => "deprecated",
            Operation::Retire => "retired",
        }
    }
    /// The states it may start from.
    fn starts_from(self) -> &'static [&'static str] {
        match self {
            Operation::Add => &[],
            Operation::Change | Operation::SetAside => &["active"],
            Operation::BringBack => &["deprecated"],
            Operation::Retire => &["active", "deprecated"],
        }
    }
}

/// A proposal as its proposer sends it. A new role or rule, or a change, says the whole of what it
/// will say; setting aside, bringing back and retiring say only which revision they change.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Draft {
    pub operation: Operation,
    pub path: String,
    #[serde(default)]
    pub base_revision: Option<i64>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub definition: Option<String>,
    #[serde(default)]
    pub responsibility: Option<String>,
    #[serde(default)]
    pub system: Option<String>,
    #[serde(default)]
    pub cedar: Option<String>,
    pub why: String,
}

/// How a waiting proposal is decided: as in Mero's Review.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Decide {
    Approve,
    SendBack,
    Reject,
}
impl Decide {
    pub fn as_str(self) -> &'static str {
        match self {
            Decide::Approve => "approve",
            Decide::SendBack => "send-back",
            Decide::Reject => "reject",
        }
    }
    fn state(self) -> &'static str {
        match self {
            Decide::Approve => "approved",
            Decide::SendBack => "sent-back",
            Decide::Reject => "rejected",
        }
    }
}

/// What a touch to decide a proposal names beyond its place: the decision and the proposal. A touch
/// made to send one back never approves it.
pub fn decide_about(decide: Decide, proposal: Uuid) -> Value {
    json!({"decision": decide.as_str(), "proposals": [proposal.to_string()]})
}

/// One version of a role or rule.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Version {
    pub seq: i64,
    pub path: String,
    pub revision: i64,
    pub kind: String,
    pub name: String,
    pub definition: String,
    pub responsibility: String,
    pub system: Option<String>,
    pub cedar: String,
    pub state: String,
    pub at: DateTime<Utc>,
    pub came: String,
    /// The approver's handle, when Governance knows it.
    pub approved_by: Option<String>,
    pub why: Option<String>,
    pub proposal: Option<Uuid>,
    pub mero: Option<Value>,
}
const VERSION: &str = "SELECT v.seq, v.path, v.revision, v.kind, v.name, v.definition, v.responsibility, v.system, v.cedar,
    v.state, v.at, v.came, a.handle AS approved_by, v.why, v.proposal, v.mero
    FROM gov.versions v LEFT JOIN gov.accounts a ON a.id = v.approved_by";

/// A proposal, with the version it changes and whether it is stale.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Proposal {
    pub id: Uuid,
    pub path: String,
    pub kind: String,
    pub operation: String,
    pub base_revision: Option<i64>,
    pub name: String,
    pub definition: String,
    pub responsibility: String,
    pub system: Option<String>,
    pub cedar: String,
    pub by_hand: bool,
    pub why: String,
    pub proposed_by: String,
    pub proposed_at: DateTime<Utc>,
    pub state: String,
    pub decided_by: Option<String>,
    pub decided_at: Option<DateTime<Utc>>,
    pub note: Option<String>,
    /// The version it changes, as it is now; none for a new one.
    #[sqlx(skip)]
    pub before: Option<Version>,
    /// Waiting, but the role or rule changed since it was proposed: it can only be sent back or
    /// rejected.
    #[sqlx(skip)]
    pub stale: bool,
}
const PROPOSAL: &str = "SELECT p.id, p.path, p.kind, p.operation, p.base_revision, p.name, p.definition, p.responsibility,
    p.system, p.cedar, p.by_hand, p.why, a.handle AS proposed_by, p.proposed_at, p.state, d.handle AS decided_by,
    p.decided_at, p.note
    FROM gov.proposals p JOIN gov.accounts a ON a.id = p.proposed_by LEFT JOIN gov.accounts d ON d.id = p.decided_by";

/// The newest version of a role or rule, in any state.
async fn newest(conn: &mut PgConnection, path: &str) -> Result<Option<Version>> {
    Ok(sqlx::query_as(&format!(
        "{VERSION} WHERE v.path = $1 ORDER BY v.revision DESC LIMIT 1"
    ))
    .bind(path)
    .fetch_optional(conn)
    .await?)
}

/// Role or rule, from its place.
fn kind_of(path: &str) -> Result<&'static str> {
    super::check_scope(path)?;
    if path.starts_with("noi.gov.roles.") {
        Ok("role")
    } else if path.starts_with("noi.gov.rules.") {
        Ok("rule")
    } else {
        Err(Error::Invalid(format!(
            "{path} is not a place for a role or rule: a role goes under noi.gov.roles, a rule under noi.gov.rules"
        )))
    }
}

/// The text of a name, a meaning or a reason: trimmed, not empty, not too long.
fn text(what: &str, value: &str, most: usize) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > most {
        return Err(Error::Invalid(format!(
            "{what}: write 1 to {most} characters"
        )));
    }
    Ok(value.to_string())
}

/// What a role or rule will say: checked as Mero checked it before the move (the role and rule
/// checks), so nothing Governance keeps fails to load.
struct Says {
    name: String,
    definition: String,
    responsibility: String,
    system: Option<String>,
    cedar: String,
}
fn says(kind: &str, d: &Draft) -> Result<Says> {
    let need = |what: &str, v: &Option<String>| {
        v.clone()
            .ok_or_else(|| Error::Invalid(format!("say its {what}")))
    };
    let cedar = need("Cedar", &d.cedar)?;
    if cedar.len() > 20_000 {
        return Err(Error::Invalid("its Cedar is too long".into()));
    }
    let system = match kind {
        "role" => {
            let system = need("system", &d.system)?;
            check_role(&json!({"system": system, "cedar": cedar})).map_err(Error::Invalid)?;
            Some(system)
        }
        _ => {
            if d.system.is_some() {
                return Err(Error::Invalid(
                    "a rule names its own actions: it has no system".into(),
                ));
            }
            check_rule(&json!({"cedar": cedar})).map_err(Error::Invalid)?;
            None
        }
    };
    Ok(Says {
        name: text("its name", &need("name", &d.name)?, 200)?,
        definition: text("what it is", &need("definition", &d.definition)?, 8000)?,
        responsibility: text(
            "what it must do",
            &need("responsibility", &d.responsibility)?,
            8000,
        )?,
        system,
        cedar,
    })
}

/// Whether the form can read this Cedar; Cedar it can't is written by hand.
fn form_reads(kind: &str, system: Option<&str>, cedar: &str) -> bool {
    match kind {
        "role" => form::read_role(system.unwrap_or_default(), cedar).is_ok(),
        _ => form::read_rule(cedar).is_ok(),
    }
}

/// Whether this account, holding these grants, could change roles and rules under these roles and
/// rules: propose and approve, with a touch, in both places. Pure: it reads nothing.
pub(crate) fn can_change(rows: &[InForce], account: Uuid, grants: &[Grant]) -> bool {
    let grants: Vec<Grant> = grants
        .iter()
        .filter(|(_, role, _)| rows.iter().any(|(p, k, _)| p == role && k == "role"))
        .cloned()
        .collect();
    let Ok(set) = policy_set_of(rows, account, &grants) else {
        return false;
    };
    CHANGING.iter().all(|(action, place)| {
        answer(
            &set,
            account,
            &grants,
            action,
            &Target::Path((*place).into()),
            true,
        )
        .is_ok()
    })
}

/// Every active person's live grants, by account, leaving out one grant if asked.
async fn people_grants(
    conn: &mut PgConnection,
    without: Option<Uuid>,
) -> Result<Vec<(Uuid, Vec<Grant>)>> {
    let rows: Vec<(Uuid, Uuid, String, String)> = sqlx::query_as(
        "SELECT g.account, g.id, g.role, g.scope FROM gov.grants g JOIN gov.accounts a ON a.id = g.account
         WHERE g.ended_at IS NULL AND a.kind = 'person' AND a.state = 'active' ORDER BY g.account, g.granted_at",
    )
    .fetch_all(conn)
    .await?;
    let mut out: Vec<(Uuid, Vec<Grant>)> = vec![];
    for (account, id, role, scope) in rows {
        if Some(id) == without {
            continue;
        }
        match out.last_mut() {
            Some((a, grants)) if *a == account => grants.push((id, role, scope)),
            _ => out.push((account, vec![(id, role, scope)])),
        }
    }
    Ok(out)
}

/// Whether some active person could change roles and rules under these roles and rules, with the
/// live grants, leaving out one grant if asked (decision 4). Agents never touch, so only people
/// count.
pub(crate) async fn someone_can_change(
    conn: &mut PgConnection,
    rows: &[InForce],
    without: Option<Uuid>,
) -> Result<bool> {
    Ok(people_grants(conn, without)
        .await?
        .iter()
        .any(|(account, grants)| can_change(rows, *account, grants)))
}

/// The roles and rules in force now, or none.
async fn in_force_or_none(conn: &mut PgConnection) -> Result<Vec<InForce>> {
    match in_force(conn).await {
        Ok(rows) => Ok(rows),
        Err(Error::Refused(_)) => Ok(vec![]),
        Err(e) => Err(e),
    }
}

/// These roles and rules with one of them replaced: by its new version if that is in force, or
/// left out if it is not.
fn with_version(
    rows: &[InForce],
    path: &str,
    kind: &str,
    state: &str,
    cedar: &str,
) -> Vec<InForce> {
    let mut out: Vec<InForce> = rows.iter().filter(|(p, _, _)| p != path).cloned().collect();
    if state == "active" || state == "deprecated" {
        out.push((path.to_string(), kind.to_string(), cedar.to_string()));
        out.sort();
    }
    out
}

/// What the no-lockout check says when it refuses.
const LOCKED_OUT: &str =
    "no one could change roles and rules after this, so it is refused: nobody is locked out";

/// Writes one version.
#[allow(clippy::too_many_arguments)]
async fn write_version(
    conn: &mut PgConnection,
    path: &str,
    revision: i64,
    kind: &str,
    says: &Says,
    state: &str,
    came: &str,
    proposal: Option<Uuid>,
    approved_by: Option<Uuid>,
    why: Option<&str>,
) -> Result<i64> {
    Ok(sqlx::query_scalar(
        "INSERT INTO gov.versions(path, revision, kind, name, definition, responsibility, system, cedar, state, came, proposal, approved_by, why)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING seq",
    )
    .bind(path)
    .bind(revision)
    .bind(kind)
    .bind(&says.name)
    .bind(&says.definition)
    .bind(&says.responsibility)
    .bind(&says.system)
    .bind(&says.cedar)
    .bind(state)
    .bind(came)
    .bind(proposal)
    .bind(approved_by)
    .bind(why)
    .fetch_one(conn)
    .await?)
}

impl Version {
    fn says(&self) -> Says {
        Says {
            name: self.name.clone(),
            definition: self.definition.clone(),
            responsibility: self.responsibility.clone(),
            system: self.system.clone(),
            cedar: self.cedar.clone(),
        }
    }
}

/// Writes the first roles and rules into a Governance that holds none; says how many it wrote.
pub(crate) async fn write_first(conn: &mut PgConnection) -> Result<usize> {
    let held: i64 = sqlx::query_scalar("SELECT count(*) FROM gov.versions")
        .fetch_one(&mut *conn)
        .await?;
    if held > 0 {
        return Ok(0);
    }
    let first = first();
    for f in &first {
        let kind = kind_of(&f.path)?;
        let says = Says {
            name: f.name.clone(),
            definition: f.definition.clone(),
            responsibility: f.responsibility.clone(),
            system: f.system.clone(),
            cedar: f.cedar.clone(),
        };
        write_version(
            conn,
            &f.path,
            1,
            kind,
            &says,
            "active",
            "setup",
            None,
            None,
            Some("one of the roles and rules every Governance starts with"),
        )
        .await?;
    }
    Ok(first.len())
}

impl Governance {
    /// Every role and rule in force, for whoever may read `noi.gov` (signed in, and visitors where
    /// they hold reading), as Mero showed them before the move. An allowed read is not recorded.
    /// `version` is the newest version's number: how current the whole set is.
    pub async fn roles_and_rules(&self, credential: &Credential) -> Result<Value> {
        self.may_read(credential, "read", "noi.gov").await?;
        let mut conn = self.pool.acquire().await?;
        let rows: Vec<Version> = sqlx::query_as(&format!(
            "{VERSION} JOIN gov.policies p ON p.path = v.path AND p.revision = v.revision ORDER BY v.kind, v.path"
        ))
        .fetch_all(&mut *conn)
        .await?;
        let version: Option<i64> = sqlx::query_scalar("SELECT max(seq) FROM gov.versions")
            .fetch_one(&mut *conn)
            .await?;
        let shown = |v: &Version| {
            let mut out = json!(v);
            if v.kind == "role" {
                out["verbs"] = json!(role_actions(&v.cedar).unwrap_or_default());
            }
            out
        };
        Ok(json!({
            "roles": rows.iter().filter(|v| v.kind == "role").map(shown).collect::<Vec<_>>(),
            "rules": rows.iter().filter(|v| v.kind == "rule").map(shown).collect::<Vec<_>>(),
            "version": version,
        }))
    }

    /// Every version of one role or rule, newest first, for whoever may read it.
    pub async fn versions(&self, credential: &Credential, path: &str) -> Result<Vec<Version>> {
        kind_of(path)?;
        self.may_read(credential, "read", path).await?;
        let mut conn = self.pool.acquire().await?;
        let rows: Vec<Version> = sqlx::query_as(&format!(
            "{VERSION} WHERE v.path = $1 ORDER BY v.revision DESC"
        ))
        .bind(path)
        .fetch_all(&mut *conn)
        .await?;
        if rows.is_empty() {
            return Err(Error::NotFound(format!("no role or rule at {path}")));
        }
        Ok(rows)
    }

    /// The proposals, for whoever may read Review in noi.gov (decision 3): what waits, or every one,
    /// newest first.
    pub async fn proposals(&self, credential: &Credential, all: bool) -> Result<Vec<Proposal>> {
        self.may_read(credential, "read-review", "noi.gov").await?;
        let mut conn = self.pool.acquire().await?;
        let mut rows: Vec<Proposal> = sqlx::query_as(&format!(
            "{PROPOSAL} WHERE $1 OR p.state = 'waiting' ORDER BY p.proposed_at DESC LIMIT 200"
        ))
        .bind(all)
        .fetch_all(&mut *conn)
        .await?;
        for p in &mut rows {
            with_before(&mut conn, p).await?;
        }
        Ok(rows)
    }

    /// One proposal, for whoever may read Review in noi.gov.
    pub async fn proposal(&self, credential: &Credential, id: Uuid) -> Result<Proposal> {
        self.may_read(credential, "read-review", "noi.gov").await?;
        let mut conn = self.pool.acquire().await?;
        load(&mut conn, id).await
    }

    /// Asks a question whose yes is not recorded (a read): refused, it is an error.
    async fn may_read(&self, credential: &Credential, action: &str, place: &str) -> Result<()> {
        let answer = self
            .may(credential, action, &[Target::Path(place.into())], None)
            .await?;
        if answer.allowed {
            Ok(())
        } else {
            Err(Error::Refused(answer.reason))
        }
    }

    /// Proposes a change to roles and rules (decision 2). Asks `propose` on its place, and for
    /// Cedar the form can't read, new or changed, `write-cedar` with the touch made for it, as Mero
    /// asked before the move. Nothing changes until an owner approves it.
    pub async fn propose(
        &self,
        credential: &Credential,
        touch: Option<Uuid>,
        draft: &Draft,
    ) -> Result<Proposal> {
        let path = draft.path.trim();
        let kind = kind_of(path)?;
        let why = text("why", &draft.why, 2000)?;
        let tx = self.write().await?;
        let mut tx = tx;
        let now = newest(tx.as_mut(), path).await?;
        let (says, base) = match (draft.operation, &now) {
            (Operation::Add, Some(v)) => {
                return Err(Error::Invalid(format!(
                    "{path} exists already (revision {}): propose a change to it instead",
                    v.revision
                )))
            }
            (Operation::Add, None) => {
                if draft.base_revision.is_some() {
                    return Err(Error::Invalid("a new one changes no revision".into()));
                }
                (says(kind, draft)?, None)
            }
            (_, None) => return Err(Error::NotFound(format!("no role or rule at {path}"))),
            (op, Some(v)) => {
                if draft.base_revision != Some(v.revision) {
                    return Err(Error::Refused(format!(
                        "{path} changed since: revision {} is the newest. Start again from it",
                        v.revision
                    )));
                }
                if !op.starts_from().contains(&v.state.as_str()) {
                    return Err(Error::Invalid(format!(
                        "{path} is {}: it can't be {}",
                        v.state,
                        match op {
                            Operation::Change => "changed",
                            Operation::SetAside => "set aside",
                            Operation::BringBack => "brought back",
                            _ => "retired",
                        }
                    )));
                }
                let says = if op == Operation::Change {
                    let s = says(kind, draft)?;
                    if s.name == v.name
                        && s.definition == v.definition
                        && s.responsibility == v.responsibility
                        && s.system == v.system
                        && s.cedar == v.cedar
                    {
                        return Err(Error::Invalid("nothing in it changes".into()));
                    }
                    s
                } else {
                    let says_nothing = draft.name.is_none()
                        && draft.definition.is_none()
                        && draft.responsibility.is_none()
                        && draft.system.is_none()
                        && draft.cedar.is_none();
                    if !says_nothing {
                        return Err(Error::Invalid(format!(
                            "{} changes only its state: propose a change for the rest",
                            op.as_str()
                        )));
                    }
                    let s = v.says();
                    // Coming back, it must meet today's checks, as at the start.
                    if op == Operation::BringBack {
                        let checked = match kind {
                            "role" => check_role(&json!({"system": s.system, "cedar": s.cedar})),
                            _ => check_rule(&json!({"cedar": s.cedar})),
                        };
                        checked.map_err(Error::Invalid)?;
                    }
                    s
                };
                (says, Some(v.revision))
            }
        };
        // Cedar the form can't read, new or changed, is for owners, with a touch (9 Nov, step 7).
        let by_hand = matches!(draft.operation, Operation::Add | Operation::Change)
            && !form_reads(kind, says.system.as_deref(), &says.cedar)
            && now.as_ref().is_none_or(|v| v.cedar != says.cedar);
        let place = [Target::Path(path.to_string())];
        let mut asks = vec![Ask::new("propose", &place, None, None)];
        if by_hand {
            asks.push(Ask::new(
                "write-cedar",
                &place,
                None,
                touch.map(Proof::Touch),
            ));
        }
        let (mut tx, by) = self.decide_in(tx, credential, &asks).await?;
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO gov.proposals(id, path, kind, operation, base_revision, name, definition, responsibility, system, cedar, by_hand, why, proposed_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        )
        .bind(id)
        .bind(path)
        .bind(kind)
        .bind(draft.operation.as_str())
        .bind(base)
        .bind(&says.name)
        .bind(&says.definition)
        .bind(&says.responsibility)
        .bind(&says.system)
        .bind(&says.cedar)
        .bind(by_hand)
        .bind(&why)
        .bind(by)
        .execute(tx.as_mut())
        .await?;
        record(
            tx.as_mut(),
            "propose",
            Some(by),
            Some("propose"),
            &[path.to_string()],
            true,
            "proposed",
            json!({"proposal": id, "operation": draft.operation.as_str(), "revision": base, "by_hand": by_hand}),
        )
        .await?;
        let proposal = load(tx.as_mut(), id).await?;
        tx.commit().await?;
        Ok(proposal)
    }

    /// Approves, sends back or rejects a waiting proposal (decision 2), with the touch made for
    /// exactly that decision on it. Asks `review` on its place, so only an owner may, as before the
    /// move. Approving writes the new version, refused if the role or rule changed since or if no
    /// one could change roles and rules after it (decision 4); retiring a role ends its grants.
    pub async fn decide_proposal(
        &self,
        credential: &Credential,
        touch: Option<Uuid>,
        id: Uuid,
        decide: Decide,
        note: &str,
    ) -> Result<Value> {
        let note = note.trim();
        if decide != Decide::Approve && note.is_empty() {
            return Err(Error::Invalid(
                "write a note: it tells the proposer what to change, or why not".into(),
            ));
        }
        if note.chars().count() > 2000 {
            return Err(Error::Invalid("a note has at most 2000 characters".into()));
        }
        let note = (!note.is_empty()).then(|| note.to_string());
        let tx = self.write().await?;
        let mut tx = tx;
        let p = load(tx.as_mut(), id).await?;
        if p.state != "waiting" {
            return Err(Error::Refused(format!(
                "this proposal is {} already",
                p.state
            )));
        }
        let about = decide_about(decide, id);
        let place = [Target::Path(p.path.clone())];
        let (mut tx, by) = self
            .decide_in(
                tx,
                credential,
                &[Ask::new(
                    "review",
                    &place,
                    Some(&about),
                    touch.map(Proof::Touch),
                )],
            )
            .await?;
        let mut done = json!({"proposal": id, "decision": decide.as_str()});
        if decide == Decide::Approve {
            let now = newest(tx.as_mut(), &p.path).await?;
            if now.as_ref().map(|v| v.revision) != p.base_revision {
                return Err(self
                    .refused_after_touch(
                        tx,
                        by,
                        &p.path,
                        "stale: it changed since this was proposed. Send it back or reject it",
                    )
                    .await);
            }
            let operation = Operation::parse(&p.operation)
                .ok_or_else(|| Error::Invalid(format!("{} is not an operation", p.operation)))?;
            let state = operation.becomes(now.as_ref().map_or("active", |v| v.state.as_str()));
            let rows = in_force_or_none(tx.as_mut()).await?;
            let after = with_version(&rows, &p.path, &p.kind, state, &p.cedar);
            let before_ok = someone_can_change(tx.as_mut(), &rows, None).await?;
            if before_ok && !someone_can_change(tx.as_mut(), &after, None).await? {
                return Err(self.refused_after_touch(tx, by, &p.path, LOCKED_OUT).await);
            }
            let revision = p.base_revision.map_or(1, |r| r + 1);
            let says = Says {
                name: p.name.clone(),
                definition: p.definition.clone(),
                responsibility: p.responsibility.clone(),
                system: p.system.clone(),
                cedar: p.cedar.clone(),
            };
            write_version(
                tx.as_mut(),
                &p.path,
                revision,
                &p.kind,
                &says,
                state,
                "approved",
                Some(id),
                Some(by),
                Some(&p.why),
            )
            .await?;
            // Retiring a role ends its grants (as decided 6 Nov, decision 2).
            let ended = if p.kind == "role" && state == "retired" {
                sqlx::query(
                    "UPDATE gov.grants SET ended_at = now(), ended_by = $2, end_reason = 'role retired'
                     WHERE role = $1 AND ended_at IS NULL",
                )
                .bind(&p.path)
                .bind(by)
                .execute(tx.as_mut())
                .await?
                .rows_affected()
            } else {
                0
            };
            done["revision"] = json!(revision);
            done["state"] = json!(state);
            done["ended_grants"] = json!(ended);
        }
        sqlx::query(
            "UPDATE gov.proposals SET state = $2, decided_by = $3, decided_at = now(), note = $4 WHERE id = $1 AND state = 'waiting'",
        )
        .bind(id)
        .bind(decide.state())
        .bind(by)
        .bind(&note)
        .execute(tx.as_mut())
        .await?;
        let reason = match decide {
            Decide::Approve => format!(
                "approved: {} at revision {}",
                p.path,
                done["revision"].as_i64().unwrap_or_default()
            ),
            Decide::SendBack => "sent back".to_string(),
            Decide::Reject => "rejected".to_string(),
        };
        record(
            tx.as_mut(),
            decide.as_str(),
            Some(by),
            Some("review"),
            std::slice::from_ref(&p.path),
            true,
            &reason,
            done.clone(),
        )
        .await?;
        tx.commit().await?;
        Ok(done)
    }

    /// A decision refused after its touch was good: undone, so the touch is unused, and recorded.
    async fn refused_after_touch(
        &self,
        tx: Transaction<'_, Postgres>,
        by: Uuid,
        path: &str,
        why: &str,
    ) -> Error {
        if let Err(undone) = tx.rollback().await {
            return undone.into();
        }
        if let Ok(mut conn) = self.pool.acquire().await {
            let _ = record(
                &mut conn,
                "approve",
                Some(by),
                Some("review"),
                &[path.to_string()],
                false,
                why,
                json!({}),
            )
            .await;
        }
        Error::Refused(why.into())
    }

    /// The recovery command (decision 4), run on Governance's server like setup, for the worst case:
    /// no one can change roles and rules. For this person, one step at a time and only while still
    /// needed: Maintainer and Owner brought back into force; given to them in all of noi; their Cedar
    /// as first agreed; then each rule that still says no to changing roles and rules retired. Every
    /// step is a new version or grant, written in the record. Does nothing when someone can already
    /// change them.
    pub async fn recover(&self, handle: &str) -> Result<Value> {
        let mut tx = self.write().await?;
        let (account, kind, state) =
            super::accounts::account_by_handle(tx.as_mut(), handle).await?;
        if kind != "person" || state != "active" {
            return Err(Error::Refused(format!(
                "{handle} is not an active person: recovery is for a person who can sign in"
            )));
        }
        let rows = in_force_or_none(tx.as_mut()).await?;
        if someone_can_change(tx.as_mut(), &rows, None).await? {
            return Ok(json!({
                "done": [],
                "said": "someone can already change roles and rules: nothing was done",
            }));
        }
        let mut done: Vec<String> = vec![];
        let first = first();
        let firsts: Vec<&First> = first
            .iter()
            .filter(|f| f.path == MAINTAINER || f.path == OWNER)
            .collect();
        let why = "the recovery command on Governance's server";
        // 1. Maintainer and Owner in force.
        for f in &firsts {
            let now = newest(tx.as_mut(), &f.path).await?;
            let in_force = now
                .as_ref()
                .is_some_and(|v| v.state == "active" || v.state == "deprecated");
            if !in_force {
                let says = now.as_ref().map_or_else(|| first_says(f), |v| v.says());
                let revision = now.as_ref().map_or(1, |v| v.revision + 1);
                write_version(
                    tx.as_mut(),
                    &f.path,
                    revision,
                    "role",
                    &says,
                    "active",
                    "recovery",
                    None,
                    None,
                    Some(why),
                )
                .await?;
                done.push(format!("{} back in force at revision {revision}", f.path));
            }
        }
        // 2. Both given to them, in all of noi.
        for f in &firsts {
            let held: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM gov.grants WHERE account = $1 AND role = $2 AND scope = 'noi' AND ended_at IS NULL)",
            )
            .bind(account)
            .bind(&f.path)
            .fetch_one(tx.as_mut())
            .await?;
            if !held {
                sqlx::query(
                    "INSERT INTO gov.grants(id, account, role, scope) VALUES($1,$2,$3,'noi')",
                )
                .bind(Uuid::new_v4())
                .bind(account)
                .bind(&f.path)
                .execute(tx.as_mut())
                .await?;
                done.push(format!("{handle} given {} in noi", f.path));
            }
        }
        // 3. Their Cedar as first agreed, if they still can't.
        let rows = in_force_or_none(tx.as_mut()).await?;
        if !can_change(&rows, account, &grants_of(tx.as_mut(), account).await?) {
            for f in &firsts {
                if let Some(v) = newest(tx.as_mut(), &f.path).await? {
                    if v.cedar != f.cedar || v.system != f.system || v.state != "active" {
                        write_version(
                            tx.as_mut(),
                            &f.path,
                            v.revision + 1,
                            "role",
                            &first_says(f),
                            "active",
                            "recovery",
                            None,
                            None,
                            Some(why),
                        )
                        .await?;
                        done.push(format!(
                            "{} as first agreed, at revision {}",
                            f.path,
                            v.revision + 1
                        ));
                    }
                }
            }
        }
        // 4. Each rule that still says no, retired.
        for _ in 0..50 {
            let rows = in_force_or_none(tx.as_mut()).await?;
            let grants = grants_of(tx.as_mut(), account).await?;
            if can_change(&rows, account, &grants) {
                break;
            }
            let set = policy_set_of(&rows, account, &grants)?;
            let mut blocking: Vec<String> = vec![];
            for (action, place) in CHANGING {
                if let Ok((false, said_no)) = evaluate(
                    &set,
                    account,
                    &grants,
                    action,
                    &Target::Path(place.into()),
                    true,
                ) {
                    blocking.extend(
                        said_no
                            .into_iter()
                            .filter(|p| rows.iter().any(|(path, k, _)| path == p && k == "rule")),
                    );
                }
            }
            blocking.sort();
            blocking.dedup();
            let Some(rule) = blocking.first() else { break };
            let v = newest(tx.as_mut(), rule)
                .await?
                .ok_or_else(|| Error::NotFound(rule.clone()))?;
            write_version(
                tx.as_mut(),
                rule,
                v.revision + 1,
                "rule",
                &v.says(),
                "retired",
                "recovery",
                None,
                None,
                Some(why),
            )
            .await?;
            done.push(format!("{rule} retired at revision {}", v.revision + 1));
        }
        let rows = in_force_or_none(tx.as_mut()).await?;
        let recovered = can_change(&rows, account, &grants_of(tx.as_mut(), account).await?);
        record(
            tx.as_mut(),
            "recover",
            Some(account),
            None,
            &["noi.gov".into()],
            recovered,
            if recovered {
                "recovered: roles and rules can be changed again"
            } else {
                "the recovery command could not make roles and rules changeable"
            },
            json!({"handle": handle, "done": done}),
        )
        .await?;
        if !recovered {
            tx.rollback().await?;
            return Err(Error::Refused(
                "recovery could not make roles and rules changeable for this person: nothing was kept".into(),
            ));
        }
        tx.commit().await?;
        Ok(json!({"done": done, "said": format!("{handle} can change roles and rules again")}))
    }

    /// The move (decision 5): takes in the roles and rules Mero held, with every revision, once. Run
    /// again with the same file, it changes nothing; Governance holding any other roles and rules,
    /// it refuses. After it, someone must be able to change roles and rules (decision 4).
    pub async fn move_in(&self, file: &MoveFile) -> Result<Value> {
        let versions = versions_of(file).map_err(Error::Invalid)?;
        let mut tx = self.write().await?;
        let held: Vec<(String, i64, String, String, String)> = sqlx::query_as(
            "SELECT path, revision, cedar, state, came FROM gov.versions ORDER BY path, revision",
        )
        .fetch_all(tx.as_mut())
        .await?;
        if !held.is_empty() {
            let mut moving: Vec<(String, i64, String, String, String)> = versions
                .iter()
                .map(|v| {
                    (
                        v.path.clone(),
                        v.revision,
                        v.cedar.clone(),
                        v.state.clone(),
                        "moved".into(),
                    )
                })
                .collect();
            moving.sort();
            if held == moving {
                return Ok(
                    json!({"moved": false, "already": true, "versions": held.len(),
                    "said": "these roles and rules moved in already: nothing was done"}),
                );
            }
            return Err(Error::Refused(format!(
                "Governance holds roles and rules already ({} versions), not these: the move runs once, into a Governance that holds none",
                held.len()
            )));
        }
        for v in &versions {
            let approver: Option<Uuid> =
                sqlx::query_scalar("SELECT id FROM gov.accounts WHERE handle = $1")
                    .bind(&v.by)
                    .fetch_optional(tx.as_mut())
                    .await?;
            sqlx::query(
                "INSERT INTO gov.versions(path, revision, kind, name, definition, responsibility, system, cedar, state, at, came, approved_by, why, mero)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'moved',$11,$12,$13)",
            )
            .bind(&v.path)
            .bind(v.revision)
            .bind(v.kind)
            .bind(&v.name)
            .bind(&v.definition)
            .bind(&v.responsibility)
            .bind(&v.system)
            .bind(&v.cedar)
            .bind(&v.state)
            .bind(v.at)
            .bind(approver)
            .bind(&v.why)
            .bind(&v.mero)
            .execute(tx.as_mut())
            .await?;
        }
        let rows = in_force(tx.as_mut()).await?;
        if !someone_can_change(tx.as_mut(), &rows, None).await? {
            return Err(Error::Refused(format!(
                "after the move, {LOCKED_OUT}. Nothing was kept"
            )));
        }
        let roles = rows.iter().filter(|r| r.1 == "role").count();
        let rules = rows.len() - roles;
        // Grants of a role that is not in force link nothing; the copy ended them already.
        let loose: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM gov.grants g WHERE g.ended_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM gov.policies p WHERE p.path = g.role AND p.kind = 'role')",
        )
        .fetch_one(tx.as_mut())
        .await?;
        let paths: Vec<String> = rows.iter().map(|r| r.0.clone()).collect();
        let detail = json!({"from": "mero", "written_at": file.written_at, "versions": versions.len(),
            "roles": roles, "rules": rules, "grants_of_roles_not_in_force": loose});
        record(
            tx.as_mut(),
            "move",
            None,
            None,
            &paths,
            true,
            "roles and rules moved in from Mero, with every revision",
            detail.clone(),
        )
        .await?;
        tx.commit().await?;
        let mut out = detail;
        out["moved"] = json!(true);
        Ok(out)
    }
}

/// One account's live grants.
async fn grants_of(conn: &mut PgConnection, account: Uuid) -> Result<Vec<Grant>> {
    Ok(sqlx::query_as(
        "SELECT id, role, scope FROM gov.grants WHERE account = $1 AND ended_at IS NULL",
    )
    .bind(account)
    .fetch_all(conn)
    .await?)
}

fn first_says(f: &First) -> Says {
    Says {
        name: f.name.clone(),
        definition: f.definition.clone(),
        responsibility: f.responsibility.clone(),
        system: f.system.clone(),
        cedar: f.cedar.clone(),
    }
}

/// One proposal, with the version it changes and whether it is stale.
async fn load(conn: &mut PgConnection, id: Uuid) -> Result<Proposal> {
    let mut p: Proposal = sqlx::query_as(&format!("{PROPOSAL} WHERE p.id = $1"))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or_else(|| Error::NotFound(format!("no proposal {id}")))?;
    with_before(conn, &mut p).await?;
    Ok(p)
}
async fn with_before(conn: &mut PgConnection, p: &mut Proposal) -> Result<()> {
    let now = newest(conn, &p.path).await?;
    p.stale = p.state == "waiting" && now.as_ref().map(|v| v.revision) != p.base_revision;
    p.before = match p.base_revision {
        Some(r) => {
            sqlx::query_as(&format!("{VERSION} WHERE v.path = $1 AND v.revision = $2"))
                .bind(&p.path)
                .bind(r)
                .fetch_optional(&mut *conn)
                .await?
        }
        None => None,
    };
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rows() -> Vec<InForce> {
        let mut rows: Vec<InForce> = first()
            .into_iter()
            .map(|f| {
                let kind = if f.path.starts_with("noi.gov.roles.") {
                    "role"
                } else {
                    "rule"
                };
                (f.path, kind.to_string(), f.cedar)
            })
            .collect();
        rows.sort();
        rows
    }
    fn grant(role: &str, scope: &str) -> Grant {
        (Uuid::new_v4(), role.into(), scope.into())
    }
    const YOU: Uuid = Uuid::from_u128(7);

    #[test]
    fn the_first_roles_and_rules_pass_their_checks_and_read_as_the_form() {
        let first = first();
        assert_eq!(first.len(), 4);
        for f in &first {
            match kind_of(&f.path).unwrap() {
                "role" => {
                    check_role(&json!({"system": f.system, "cedar": f.cedar})).unwrap();
                    assert!(
                        form_reads("role", f.system.as_deref(), &f.cedar),
                        "{}",
                        f.path
                    );
                }
                _ => {
                    assert!(f.system.is_none());
                    check_rule(&json!({"cedar": f.cedar})).unwrap();
                    assert!(form_reads("rule", None, &f.cedar), "{}", f.path);
                }
            }
        }
    }

    #[test]
    fn an_owner_who_is_a_maintainer_can_change_roles_and_rules() {
        let both = [grant(MAINTAINER, "noi"), grant(OWNER, "noi")];
        assert!(can_change(&rows(), YOU, &both));
        // Owner alone can't approve (approving is Mero's review, which Maintainer gives), and
        // Maintainer alone is stopped by "only owners approve roles and rules".
        assert!(!can_change(&rows(), YOU, &both[1..]));
        assert!(!can_change(&rows(), YOU, &both[..1]));
        // Held only in one place, it is not enough.
        assert!(!can_change(
            &rows(),
            YOU,
            &[grant(MAINTAINER, "noi.eio"), grant(OWNER, "noi")]
        ));
        // A grant of a role not in force counts for nothing.
        let without_owner = with_version(&rows(), OWNER, "role", "retired", "");
        assert!(!can_change(&without_owner, YOU, &both));
    }

    #[test]
    fn a_rule_that_forbids_approving_roles_and_rules_locks_everyone_out() {
        let both = [grant(MAINTAINER, "noi"), grant(OWNER, "noi")];
        let forbid =
            r#"forbid (principal, action == Action::"review", resource in Scope::"noi.gov");"#;
        let locked = with_version(
            &rows(),
            "noi.gov.rules.no-approving",
            "rule",
            "active",
            forbid,
        );
        assert!(!can_change(&locked, YOU, &both));
        // Set aside, a rule is still in force; retired, it is not.
        let set_aside = with_version(
            &rows(),
            "noi.gov.rules.no-approving",
            "rule",
            "deprecated",
            forbid,
        );
        assert!(!can_change(&set_aside, YOU, &both));
        let retired = with_version(
            &locked,
            "noi.gov.rules.no-approving",
            "rule",
            "retired",
            forbid,
        );
        assert!(can_change(&retired, YOU, &both));
        // A rule that only adds a condition owners meet leaves them able.
        let fine = r#"forbid (principal, action == Action::"review", resource in Scope::"noi.gov") unless { principal in Role::"owner" };"#;
        assert!(can_change(
            &with_version(&rows(), "noi.gov.rules.again", "rule", "active", fine),
            YOU,
            &both
        ));
        // Cedar that does not load leaves no one able.
        assert!(!can_change(
            &with_version(
                &rows(),
                "noi.gov.rules.broken",
                "rule",
                "active",
                "forbid ("
            ),
            YOU,
            &both
        ));
    }

    #[test]
    fn operations_start_from_and_leave_the_states_they_say() {
        assert_eq!(Operation::Add.becomes("active"), "active");
        assert_eq!(Operation::Change.becomes("active"), "active");
        assert_eq!(Operation::SetAside.becomes("active"), "deprecated");
        assert_eq!(Operation::BringBack.becomes("deprecated"), "active");
        assert_eq!(Operation::Retire.becomes("deprecated"), "retired");
        assert!(!Operation::Change.starts_from().contains(&"deprecated"));
        assert!(Operation::Retire.starts_from().contains(&"deprecated"));
        for op in ["add", "change", "set-aside", "bring-back", "retire"] {
            assert_eq!(Operation::parse(op).unwrap().as_str(), op);
            assert_eq!(
                serde_json::to_value(Operation::parse(op).unwrap()).unwrap(),
                op
            );
        }
        assert_ne!(
            decide_about(Decide::Approve, YOU),
            decide_about(Decide::SendBack, YOU)
        );
    }

    #[test]
    fn places_say_role_or_rule() {
        assert_eq!(kind_of("noi.gov.roles.proposer").unwrap(), "role");
        assert_eq!(kind_of("noi.gov.rules.fresh-touch").unwrap(), "rule");
        assert!(kind_of("noi.gov.roles").is_err());
        assert!(kind_of("noi.eio.roles.x").is_err());
        assert!(kind_of("noi.gov.roles.Bad").is_err());
    }
}
