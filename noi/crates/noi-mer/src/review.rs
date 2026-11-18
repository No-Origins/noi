//! Review: changes wait in batches until a maintainer approves them, so Mero's merons hold only
//! what was approved. A batch is test-run when it is proposed, in a transaction that is thrown
//! away, and run again for real when it is approved. Both runs use the same operations; only the
//! authorizer differs. A batch applies whole or not at all.
use super::*;
use serde::{Deserialize, Serialize};

/// One change a proposal asks for. The approval runs exactly this.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case")]
pub enum Change {
    /// A new meron, filed under `container` (by default, the system that governs it), then
    /// registered and activated.
    Add {
        meron: NewMeron,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        container: Option<String>,
    },
    Update {
        uid: Uuid,
        expected_revision: i64,
        meron: NewMeron,
        compatibility: CompatibilityEvidence,
    },
    Rename {
        uid: Uuid,
        expected_revision: i64,
        path: String,
    },
    Deprecate {
        uid: Uuid,
        expected_revision: i64,
    },
    /// Brings a deprecated meron back to active, for a reason (agreed 8 Nov). It must meet
    /// today's invariants again, as at registration. Retired merons never come back.
    Reinstate {
        uid: Uuid,
        expected_revision: i64,
        reason: String,
    },
}
impl Change {
    pub fn operation(&self) -> &'static str {
        match self {
            Change::Add { .. } => "add",
            Change::Update { .. } => "update",
            Change::Rename { .. } => "rename",
            Change::Deprecate { .. } => "deprecate",
            Change::Reinstate { .. } => "reinstate",
        }
    }
    pub fn target(&self) -> Option<Uuid> {
        match self {
            Change::Add { .. } => None,
            Change::Update { uid, .. }
            | Change::Rename { uid, .. }
            | Change::Deprecate { uid, .. }
            | Change::Reinstate { uid, .. } => Some(*uid),
        }
    }
    fn expected_revision(&self) -> Option<i64> {
        match self {
            Change::Add { .. } => None,
            Change::Update {
                expected_revision, ..
            }
            | Change::Rename {
                expected_revision, ..
            }
            | Change::Deprecate {
                expected_revision, ..
            }
            | Change::Reinstate {
                expected_revision, ..
            } => Some(*expected_revision),
        }
    }
    fn validate(&self) -> Result<()> {
        match self {
            Change::Add { meron, container } => {
                meron.validate()?;
                if meron.authority_scope.is_none() {
                    return Err(ValidationError(format!(
                        "{}: a new meron needs its authority_scope",
                        meron.path
                    ))
                    .into());
                }
                if let Some(path) = container {
                    validate_path(path)?;
                }
            }
            Change::Update {
                meron,
                compatibility,
                ..
            } => {
                meron.validate()?;
                compatibility.validate()?;
            }
            Change::Rename { path, .. } => validate_path(path)?,
            Change::Deprecate { .. } => {}
            Change::Reinstate { reason, .. } => {
                let reason = reason.trim();
                if reason.is_empty() || reason.chars().count() > 400 {
                    return Err(ValidationError(
                        "a reinstatement needs its reason, in at most 400 characters".into(),
                    )
                    .into());
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProposalState {
    Waiting,
    SentBack,
    /// Approved, waiting to land (part B, decision 4, agreed 18 Nov): its batch names a branch, and
    /// it takes effect when that commit is on main.
    Landing,
    Approved,
    Rejected,
}
impl ProposalState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Waiting => "waiting",
            Self::SentBack => "sent-back",
            Self::Landing => "landing",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
        }
    }
    fn parse(s: &str) -> Result<Self> {
        Ok(match s {
            "waiting" => Self::Waiting,
            "sent-back" => Self::SentBack,
            "landing" => Self::Landing,
            "approved" => Self::Approved,
            "rejected" => Self::Rejected,
            other => return Err(ValidationError(format!("unknown proposal state {other}")).into()),
        })
    }
    fn open(self) -> bool {
        matches!(self, Self::Waiting | Self::SentBack)
    }
}

/// What landing a batch did: its proposals, now approved, and the batches that waited with a change
/// to the same merons, sent back to their proposers.
#[derive(Debug)]
pub struct Landed {
    pub proposals: Vec<Proposal>,
    pub sent_back: Vec<Uuid>,
}

/// What a proposer sends: a title, an optional note, and the changes, in order.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewBatch {
    pub title: String,
    #[serde(default)]
    pub note: Option<String>,
    pub changes: Vec<Change>,
    /// A touch for writing Cedar by hand, when a change does (9 Nov, step 7). Never kept.
    #[serde(default, skip_serializing)]
    pub touch: Option<Uuid>,
    /// The branch and the commit its code is on (part B, agreed 18 Nov). With them, an approval
    /// waits for that commit to land on main. A change to a component always names them.
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub commit: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Proposal {
    pub uid: Uuid,
    pub batch: Uuid,
    pub position: i32,
    pub change: Change,
    pub state: ProposalState,
    pub revision: i32,
    /// The last run of this change: `{"ok":true,"meron":…,"checks":…}` or `{"ok":false,"error":…}`.
    pub outcome: Value,
    pub checked_at: DateTime<Utc>,
    pub decided_by: Option<String>,
    pub decided_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Still open, but the meron it changes has moved on since, or its new path is taken.
    pub stale: bool,
}
#[derive(Debug, Clone, Serialize)]
pub struct ProposalEvent {
    pub sequence: i64,
    pub proposal: Option<Uuid>,
    pub action: String,
    pub actor: String,
    pub note: Option<String>,
    pub payload: Value,
    pub occurred_at: DateTime<Utc>,
}
#[derive(Debug, Clone, Serialize)]
pub struct Batch {
    pub uid: Uuid,
    pub title: String,
    pub proposer: String,
    pub created_at: DateTime<Utc>,
    /// The branch and commit its code is on, when it names them (part B).
    pub branch: Option<String>,
    pub commit: Option<String>,
    pub proposals: Vec<Proposal>,
    pub events: Vec<ProposalEvent>,
    /// The places deciding its waiting proposals asks about (9 Nov, step 6), so a page can ask
    /// whether you may decide it before offering to.
    pub places: Vec<String>,
}

#[derive(FromRow)]
struct ProposalRow {
    uid: Uuid,
    batch: Uuid,
    position: i32,
    change: Value,
    state: String,
    revision: i32,
    outcome: Value,
    checked_at: DateTime<Utc>,
    decided_by: Option<String>,
    decided_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}
impl ProposalRow {
    fn into_proposal(self, stale: bool) -> Result<Proposal> {
        Ok(Proposal {
            uid: self.uid,
            batch: self.batch,
            position: self.position,
            change: serde_json::from_value(self.change)?,
            state: ProposalState::parse(&self.state)?,
            revision: self.revision,
            outcome: self.outcome,
            checked_at: self.checked_at,
            decided_by: self.decided_by,
            decided_at: self.decided_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
            stale,
        })
    }
}
#[derive(FromRow)]
struct BatchRow {
    uid: Uuid,
    title: String,
    proposer: String,
    created_at: DateTime<Utc>,
    branch: Option<String>,
    commit: Option<String>,
}
#[derive(FromRow)]
struct ProposalEventRow {
    sequence: i64,
    batch: Uuid,
    proposal: Option<Uuid>,
    action: String,
    actor: String,
    note: Option<String>,
    payload: Value,
    occurred_at: DateTime<Utc>,
}

/// Allows everything. Used only inside a test run, whose transaction is always rolled back.
struct TestRun;
impl Authorizer for TestRun {
    fn authorize<'a>(&'a self, _: &'a AuthorizationRequest) -> Answer<'a> {
        answer(Decision::Allow {
            reference: "test-run".into(),
            policies: vec![],
        })
    }
}

/// One approval, one question (agreed 7 Nov): every step inside an approved batch happens under
/// the approval's own answer, and carries its record number. The proposer is not asked again.
struct UnderApproval(Decision);
impl Authorizer for UnderApproval {
    fn authorize<'a>(&'a self, _: &'a AuthorizationRequest) -> Answer<'a> {
        answer(self.0.clone())
    }
}

fn note_text(note: Option<&str>, required: bool) -> Result<Option<String>> {
    match note.map(str::trim).filter(|n| !n.is_empty()) {
        Some(n) => {
            nonblank("note", n, 8000)?;
            Ok(Some(n.to_string()))
        }
        None if required => Err(ValidationError("a note is required".into()).into()),
        None => Ok(None),
    }
}

impl Registry {
    /// Sends a batch for review. Every change is test-run now, and the results are kept with it.
    pub async fn propose_batch(&self, proposer: &Actor, batch: NewBatch) -> Result<Batch> {
        nonblank("title", &batch.title, 200)?;
        let note = note_text(batch.note.as_deref(), false)?;
        if batch.changes.is_empty() || batch.changes.len() > 500 {
            return Err(ValidationError("a batch needs between 1 and 500 changes".into()).into());
        }
        for change in &batch.changes {
            change.validate()?;
        }
        let branch = batch
            .branch
            .as_deref()
            .map(str::trim)
            .filter(|b| !b.is_empty());
        let commit = batch
            .commit
            .as_deref()
            .map(str::trim)
            .filter(|c| !c.is_empty());
        match (branch, commit) {
            (None, None) => {}
            (Some(b), Some(c)) => {
                if b.chars().count() > 200 || b.chars().any(char::is_whitespace) {
                    return Err(ValidationError(format!("{b:?} is not a branch's name")).into());
                }
                if c.len() != 40
                    || !c
                        .chars()
                        .all(|x| x.is_ascii_digit() || ('a'..='f').contains(&x))
                {
                    return Err(ValidationError(format!(
                        "{c:?} is not a commit: give its full hash"
                    ))
                    .into());
                }
            }
            _ => {
                return Err(ValidationError(
                    "a batch names its branch and its commit together".into(),
                )
                .into())
            }
        }
        let mut conn = self.pool.acquire().await?;
        for change in &batch.changes {
            refuse_no_op(&mut conn, change).await?;
        }
        let resources = change_resources(&mut conn, &batch.changes).await?;
        drop(conn);
        // A component's change comes with its code, so it names where that code is (part B,
        // decision 4): approving it then waits for that commit to land.
        if commit.is_none() {
            if let Some(r) = resources.iter().find(|r| is_component_place(&r.path)) {
                return Err(ValidationError(format!(
                    "{}: a change to a component names its branch and commit; propose it from its pushed branch (noi propose --here)",
                    r.path
                ))
                .into());
            }
        }
        let decision = self
            .authorize(
                proposer,
                Action::Propose,
                resources,
                json!({"batch":batch.title,"changes":batch.changes}),
            )
            .await?;
        // Cedar the form didn't write is for owners, with a touch (9 Nov, step 7): asked when a
        // change brings new or changed hand-written Cedar for a role or rule.
        let mut conn = self.pool.acquire().await?;
        let by_hand = hand_written(&mut conn, &batch.changes).await?;
        if !by_hand.is_empty() {
            // Each role or rule's own place: what the touch is for, as the page names it.
            let mut places = vec![];
            for change in &by_hand {
                if let Some(own) = change_resources(&mut conn, std::slice::from_ref(change))
                    .await?
                    .into_iter()
                    .next()
                {
                    places.push(own);
                }
            }
            drop(conn);
            self.authorize(
                proposer,
                Action::WriteCedar,
                places,
                json!({"batch": batch.title, "operation": "write-cedar"}),
            )
            .await?;
        } else {
            drop(conn);
        }
        let items: Vec<(Actor, Change)> = batch
            .changes
            .iter()
            .map(|c| (proposer.clone(), c.clone()))
            .collect();
        let outcomes = self.test_run(proposer, &items).await?;
        let mut tx = self.write().await?;
        let uid = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO mer.batches(uid,title,proposer,branch,commit) VALUES($1,$2,$3,$4,$5)",
        )
        .bind(uid)
        .bind(batch.title.trim())
        .bind(&proposer.subject)
        .bind(branch)
        .bind(commit)
        .execute(tx.as_mut())
        .await?;
        for (position, (change, outcome)) in batch.changes.iter().zip(outcomes).enumerate() {
            sqlx::query("INSERT INTO mer.proposals(uid,batch,position,operation,target,change,outcome,checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())")
                .bind(Uuid::new_v4()).bind(uid).bind(position as i32).bind(change.operation()).bind(change.target())
                .bind(serde_json::to_value(change)?).bind(outcome).execute(tx.as_mut()).await?;
        }
        proposal_event(
            tx.as_mut(),
            uid,
            None,
            "proposal.submit",
            proposer,
            &decision,
            note.as_deref(),
            json!({"changes": batch.changes.len()}),
        )
        .await?;
        tx.commit().await?;
        self.just_proposed(uid).await
    }

    /// Every batch, newest first, with its proposals and their history.
    pub async fn review(&self, actor: &Actor) -> Result<Vec<Batch>> {
        let mut conn = self.pool.acquire().await?;
        let batches = sqlx::query_as::<_, BatchRow>(
            "SELECT * FROM mer.batches ORDER BY created_at DESC, uid",
        )
        .fetch_all(&mut *conn)
        .await?;
        self.read_review(&mut conn, Some(actor), batches, true)
            .await
    }
    pub async fn batch(&self, actor: &Actor, uid: Uuid) -> Result<Batch> {
        let mut conn = self.pool.acquire().await?;
        let batches = sqlx::query_as::<_, BatchRow>("SELECT * FROM mer.batches WHERE uid=$1")
            .bind(uid)
            .fetch_all(&mut *conn)
            .await?;
        self.read_review(&mut conn, Some(actor), batches, false)
            .await?
            .pop()
            .ok_or(Error::NotFound)
    }
    /// The batch its proposer just sent or revised, for their answer: asking to propose those very
    /// changes has just been answered, so reading Review isn't asked again (9 Nov, step 6). An
    /// agent may propose without reading Review.
    async fn just_proposed(&self, uid: Uuid) -> Result<Batch> {
        let mut conn = self.pool.acquire().await?;
        let batches = sqlx::query_as::<_, BatchRow>("SELECT * FROM mer.batches WHERE uid=$1")
            .bind(uid)
            .fetch_all(&mut *conn)
            .await?;
        self.read_review(&mut conn, None, batches, false)
            .await?
            .pop()
            .ok_or(Error::NotFound)
    }
    /// Reading all of review needs reading the registry (`noi`) too; reading one batch needs
    /// reading only what it touches, so an agent allowed in one place sees what it proposed.
    /// Reads batches, asking whether `actor` may read Review in their places; with no actor, only
    /// for a proposer's own batch just sent (`just_proposed`).
    async fn read_review(
        &self,
        conn: &mut PgConnection,
        actor: Option<&Actor>,
        batches: Vec<BatchRow>,
        whole_review: bool,
    ) -> Result<Vec<Batch>> {
        let uids: Vec<Uuid> = batches.iter().map(|b| b.uid).collect();
        let rows = sqlx::query_as::<_, ProposalRow>("SELECT uid,batch,position,change,state,revision,outcome,checked_at,decided_by,decided_at,created_at,updated_at FROM mer.proposals WHERE batch = ANY($1) ORDER BY batch, position")
            .bind(&uids)
            .fetch_all(&mut *conn)
            .await?;
        let events = sqlx::query_as::<_, ProposalEventRow>("SELECT sequence,batch,proposal,action,actor,note,payload,occurred_at FROM mer.proposal_events WHERE batch = ANY($1) ORDER BY sequence")
            .bind(&uids)
            .fetch_all(&mut *conn)
            .await?;
        let mut resources = vec![];
        if whole_review {
            if let Ok(root) = resolve(conn, "noi").await {
                resources.push(resource(&root));
            }
        }
        let mut proposals = vec![];
        let mut deciding: std::collections::HashMap<Uuid, std::collections::BTreeSet<String>> =
            std::collections::HashMap::new();
        for row in rows {
            let change: Change = serde_json::from_value(row.change.clone())?;
            let here = change_resources(conn, std::slice::from_ref(&change)).await?;
            if row.state == "waiting" {
                deciding
                    .entry(row.batch)
                    .or_default()
                    .extend(here.iter().map(|r| r.path.clone()));
            }
            resources.extend(here);
            let open = ProposalState::parse(&row.state)?.open();
            let stale = open && is_stale(conn, &change).await?;
            proposals.push(row.into_proposal(stale)?);
        }
        if resources.is_empty() {
            return Ok(vec![]);
        }
        if let Some(actor) = actor {
            self.authorize(
                actor,
                Action::ReadReview,
                resources,
                json!({"operation":"review"}),
            )
            .await?;
        }
        Ok(batches
            .into_iter()
            .map(|b| Batch {
                branch: b.branch.clone(),
                commit: b.commit.clone(),
                proposals: proposals
                    .iter()
                    .filter(|p| p.batch == b.uid)
                    .cloned()
                    .collect(),
                events: events
                    .iter()
                    .filter(|e| e.batch == b.uid)
                    .map(|e| ProposalEvent {
                        sequence: e.sequence,
                        proposal: e.proposal,
                        action: e.action.clone(),
                        actor: e.actor.clone(),
                        note: e.note.clone(),
                        payload: e.payload.clone(),
                        occurred_at: e.occurred_at,
                    })
                    .collect(),
                places: deciding
                    .remove(&b.uid)
                    .map(|p| p.into_iter().collect())
                    .unwrap_or_default(),
                uid: b.uid,
                title: b.title,
                proposer: b.proposer,
                created_at: b.created_at,
            })
            .collect())
    }

    /// How many proposals wait (9 Nov, step 6): Review's badge, without loading every batch ever.
    /// Reading Review is asked first, in all of noi.
    pub async fn waiting(&self, actor: &Actor) -> Result<i64> {
        let root = {
            let mut conn = self.pool.acquire().await?;
            resolve(&mut conn, "noi").await?
        };
        self.authorize(
            actor,
            Action::ReadReview,
            vec![resource(&root)],
            json!({"operation": "review-waiting"}),
        )
        .await?;
        Ok(
            sqlx::query_scalar("SELECT count(*) FROM mer.proposals WHERE state = 'waiting'")
                .fetch_one(&self.pool)
                .await?,
        )
    }

    /// Approves proposals, or every waiting proposal of a batch given by its uid. They run again,
    /// for real, in one transaction: if any change fails, nothing is approved.
    pub async fn approve(&self, approver: &Actor, uids: &[Uuid]) -> Result<Vec<Proposal>> {
        let mut tx = self.write().await?;
        let rows = sqlx::query_as::<_, ProposalRow>("SELECT uid,batch,position,change,state,revision,outcome,checked_at,decided_by,decided_at,created_at,updated_at FROM mer.proposals WHERE uid = ANY($1) OR (batch = ANY($1) AND state = 'waiting') ORDER BY batch, position FOR UPDATE")
            .bind(uids)
            .fetch_all(tx.as_mut())
            .await?;
        if rows.is_empty() {
            return Err(Error::NotFound);
        }
        let mut items = vec![];
        let mut labels = vec![];
        for row in &rows {
            let change: Change = serde_json::from_value(row.change.clone())?;
            let label = label(tx.as_mut(), &change).await;
            if row.state != "waiting" {
                return Err(ValidationError(format!(
                    "{label}: only a waiting proposal can be approved; this one is {}",
                    row.state
                ))
                .into());
            }
            let proposer: String =
                sqlx::query_scalar("SELECT proposer FROM mer.batches WHERE uid=$1")
                    .bind(row.batch)
                    .fetch_one(tx.as_mut())
                    .await?;
            labels.push(label);
            items.push((Actor { subject: proposer }, change));
        }
        let changes: Vec<Change> = items.iter().map(|(_, c)| c.clone()).collect();
        let resources = change_resources(tx.as_mut(), &changes).await?;
        let decision = self
            .authorize(
                approver,
                Action::Review,
                resources,
                json!({
                    "approve": rows.iter().map(|r| r.uid).collect::<Vec<_>>(),
                    "touch_for": touch_for("approve", rows.iter().map(|r| (r.uid, r.revision))),
                }),
            )
            .await?;
        // And what each change does, for the approver who applies it (9 Nov, step 7): so a rule
        // about updating, renaming or moving a meron through its lifecycle applies to approvals
        // too. Asked once per action, on all of its places; no touch, as no rule asks one.
        for (action, places) in change_actions(tx.as_mut(), &changes).await? {
            self.authorize(
                approver,
                action,
                places,
                json!({"approve": rows.iter().map(|r| r.uid).collect::<Vec<_>>(), "applies": action.as_str()}),
            )
            .await?;
        }
        let under = Registry {
            pool: self.pool.clone(),
            authorizer: Arc::new(UnderApproval(decision.clone())),
        };
        // Whether these batches name a commit, and so wait for it to land (part B, decision 4).
        let batch_uids: Vec<Uuid> = rows.iter().map(|r| r.batch).collect();
        let commits: Vec<(Uuid, Option<String>)> =
            sqlx::query_as("SELECT uid, commit FROM mer.batches WHERE uid = ANY($1)")
                .bind(&batch_uids)
                .fetch_all(tx.as_mut())
                .await?;
        let landing = commits.iter().any(|(_, c)| c.is_some());
        if landing && commits.iter().any(|(_, c)| c.is_none()) {
            return Err(ValidationError(
                "approve a batch that waits for its code to land apart from the others".into(),
            )
            .into());
        }
        // It lands whole, so it is approved whole: every change of it open, none left behind.
        if landing {
            let row_uids: Vec<Uuid> = rows.iter().map(|r| r.uid).collect();
            let left: i64 = sqlx::query_scalar("SELECT count(*) FROM mer.proposals WHERE batch = ANY($1) AND state IN ('waiting','sent-back') AND NOT (uid = ANY($2))")
                .bind(&batch_uids)
                .bind(&row_uids)
                .fetch_one(tx.as_mut())
                .await?;
            if left > 0 {
                return Err(ValidationError(
                    "a batch that waits for its code lands whole, so it is approved whole: revise each change of it that was sent back, then approve the batch".into(),
                )
                .into());
            }
        }
        let results = under.settle(tx.as_mut(), approver, &items).await?;
        let failures: Vec<String> = results
            .iter()
            .zip(&labels)
            .filter_map(|(r, label)| r.as_ref().err().map(|e| format!("{label}: {e}")))
            .collect();
        if !failures.is_empty() {
            tx.rollback().await?;
            return Err(
                ValidationError(format!("nothing was approved. {}", failures.join("; "))).into(),
            );
        }
        if landing {
            // Tried and passing; nothing in Mero changes until its code lands. The approval's
            // answer is kept, so landing applies the batch under it.
            tx.rollback().await?;
            tx = self.write().await?;
        }
        let mut approved = vec![];
        for (row, result) in rows.into_iter().zip(results) {
            let outcome = result.expect("failures returned above");
            if landing {
                sqlx::query("UPDATE mer.proposals SET state='landing',decided_by=$2,decided_at=clock_timestamp(),outcome=$3,approval=$4,checked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE uid=$1 AND state='waiting'")
                    .bind(row.uid).bind(&approver.subject).bind(&outcome).bind(serde_json::to_value(&decision)?).execute(tx.as_mut()).await?;
            } else {
                sqlx::query("UPDATE mer.proposals SET state='approved',decided_by=$2,decided_at=clock_timestamp(),outcome=$3,checked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE uid=$1")
                    .bind(row.uid).bind(&approver.subject).bind(&outcome).execute(tx.as_mut()).await?;
            }
            proposal_event(
                tx.as_mut(),
                row.batch,
                Some(row.uid),
                "proposal.approve",
                approver,
                &decision,
                None,
                if landing {
                    json!({"steps": outcome["steps"], "waits": "to land"})
                } else {
                    json!({"steps": outcome["steps"]})
                },
            )
            .await?;
            approved.push(row.uid);
        }
        tx.commit().await?;
        let mut conn = self.pool.acquire().await?;
        let rows = sqlx::query_as::<_, ProposalRow>("SELECT uid,batch,position,change,state,revision,outcome,checked_at,decided_by,decided_at,created_at,updated_at FROM mer.proposals WHERE uid = ANY($1) ORDER BY batch, position")
            .bind(&approved)
            .fetch_all(&mut *conn)
            .await?;
        rows.into_iter().map(|r| r.into_proposal(false)).collect()
    }

    /// Lands a batch that was approved and waited for its code (part B, decision 4): its changes are
    /// applied now, under the approval it was given, and it is approved. The caller has seen main
    /// carry its files (`noi landed`). Nothing is applied unless every change applies.
    ///
    /// Another batch waiting with a change to the same meron was approved against what it was
    /// before; so it goes back to its proposer (changed 18 Nov), to bring its branch up to date with
    /// main and revise it, and be approved again. Its whole batch goes back: a batch lands whole.
    pub async fn land(&self, by: &Actor, batch: Uuid) -> Result<Landed> {
        let mut tx = self.write().await?;
        let rows: Vec<(Uuid, Value, String, Value)> = sqlx::query_as("SELECT uid, change, decided_by, approval FROM mer.proposals WHERE batch=$1 AND state='landing' ORDER BY position FOR UPDATE")
            .bind(batch)
            .fetch_all(tx.as_mut())
            .await?;
        let Some((_, _, approver, approval)) = rows.first().cloned() else {
            return Err(Error::NotFound);
        };
        let decision: Decision = serde_json::from_value(approval)?;
        let proposer: String = sqlx::query_scalar("SELECT proposer FROM mer.batches WHERE uid=$1")
            .bind(batch)
            .fetch_one(tx.as_mut())
            .await?;
        let mut items = vec![];
        for (_, change, _, _) in &rows {
            items.push((
                Actor {
                    subject: proposer.clone(),
                },
                serde_json::from_value::<Change>(change.clone())?,
            ));
        }
        let under = Registry {
            pool: self.pool.clone(),
            authorizer: Arc::new(UnderApproval(decision.clone())),
        };
        let approver = Actor { subject: approver };
        let results = under.settle(tx.as_mut(), &approver, &items).await?;
        let failures: Vec<String> = results
            .iter()
            .filter_map(|r| r.as_ref().err().cloned())
            .collect();
        if !failures.is_empty() {
            tx.rollback().await?;
            return Err(ValidationError(format!("nothing landed. {}", failures.join("; "))).into());
        }
        let mut landed = vec![];
        let (mut touched, mut names) = (vec![], vec![]);
        for ((uid, ..), result) in rows.iter().zip(results) {
            let outcome = result.expect("failures returned above");
            sqlx::query("UPDATE mer.proposals SET state='approved',outcome=$2,landed_at=clock_timestamp(),checked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE uid=$1")
                .bind(uid).bind(&outcome).execute(tx.as_mut()).await?;
            proposal_event(
                tx.as_mut(),
                batch,
                Some(*uid),
                "proposal.land",
                by,
                &decision,
                None,
                json!({"steps": outcome["steps"]}),
            )
            .await?;
            landed.push(*uid);
            if let Some(m) = outcome["meron"]["identity"]["uid"].as_str() {
                touched.push(m.to_string());
            }
            if let Some(p) = outcome["meron"]["identity"]["path"].as_str() {
                names.push(p.to_string());
            }
        }
        let stale: Vec<Uuid> = sqlx::query_scalar("SELECT DISTINCT batch FROM mer.proposals WHERE state='landing' AND batch <> $1 AND outcome->'meron'->'identity'->>'uid' = ANY($2)")
            .bind(batch)
            .bind(&touched)
            .fetch_all(tx.as_mut())
            .await?;
        let note = format!(
            "Another approved change to {} landed first, and this batch was approved against what was there before. Bring its branch up to date with main and revise it, to be approved again.",
            names.join(", ")
        );
        for other in &stale {
            let back: Vec<Uuid> = sqlx::query_scalar("UPDATE mer.proposals SET state='sent-back',decided_by=NULL,decided_at=NULL,approval=NULL,updated_at=clock_timestamp() WHERE batch=$1 AND state='landing' RETURNING uid")
                .bind(other)
                .fetch_all(tx.as_mut())
                .await?;
            for uid in back {
                proposal_event(
                    tx.as_mut(),
                    *other,
                    Some(uid),
                    "proposal.send-back",
                    by,
                    &decision,
                    Some(note.as_str()),
                    json!({"landed_first": batch}),
                )
                .await?;
            }
        }
        tx.commit().await?;
        let mut conn = self.pool.acquire().await?;
        let rows = sqlx::query_as::<_, ProposalRow>("SELECT uid,batch,position,change,state,revision,outcome,checked_at,decided_by,decided_at,created_at,updated_at FROM mer.proposals WHERE uid = ANY($1) ORDER BY position")
            .bind(&landed)
            .fetch_all(&mut *conn)
            .await?;
        Ok(Landed {
            proposals: rows
                .into_iter()
                .map(|r| r.into_proposal(false))
                .collect::<Result<_>>()?,
            sent_back: stale,
        })
    }

    /// The batches approved and waiting for their code to land: when each was approved, and each
    /// meron as it leaves them. Mero reads from the files whether a commit carries one (decision 4,
    /// changed 18 Nov: by the files, not by the commit's id).
    pub async fn waiting_to_land(&self) -> Result<Vec<crate::approved::Waiting>> {
        let mut conn = self.pool.acquire().await?;
        let rows: Vec<(Uuid, DateTime<Utc>, Option<Value>)> = sqlx::query_as("SELECT p.batch, p.decided_at, p.outcome->'meron' FROM mer.proposals p JOIN mer.batches b ON b.uid = p.batch WHERE p.state = 'landing' AND b.commit IS NOT NULL ORDER BY p.decided_at, p.batch, p.position")
            .fetch_all(&mut *conn)
            .await?;
        let mut out: Vec<crate::approved::Waiting> = vec![];
        for (batch, approved_at, meron) in rows {
            if out.last().is_none_or(|w| w.batch != batch) {
                out.push(crate::approved::Waiting {
                    batch,
                    approved_at,
                    merons: vec![],
                });
            }
            if let Some(m) = meron.filter(|m| !m.is_null()) {
                out.last_mut()
                    .expect("pushed above")
                    .merons
                    .push(serde_json::from_value(m)?);
            }
        }
        Ok(out)
    }

    /// The places that approving (every waiting proposal of these, or of these batches) or sending
    /// back or rejecting (one proposal) asks Governance about: exactly what a touch must be for.
    pub async fn review_places(
        &self,
        actor: &Actor,
        uids: &[Uuid],
        whole_batches: bool,
    ) -> Result<Vec<String>> {
        Ok(self
            .review_places_for(actor, uids, whole_batches, None)
            .await?
            .0)
    }
    /// The places deciding these proposals asks about and, with the decision, what else the touch
    /// for it names (9 Nov, step 7): the decision and each proposal at its revision. The decision
    /// itself asks with the same, so a touch made for one decision never counts for another.
    pub async fn review_places_for(
        &self,
        actor: &Actor,
        uids: &[Uuid],
        whole_batches: bool,
        decision: Option<&str>,
    ) -> Result<(Vec<String>, Option<Value>)> {
        let mut conn = self.pool.acquire().await?;
        let query = if whole_batches {
            "SELECT uid, revision, change FROM mer.proposals WHERE uid = ANY($1) OR (batch = ANY($1) AND state = 'waiting') ORDER BY batch, position"
        } else {
            "SELECT uid, revision, change FROM mer.proposals WHERE uid = ANY($1) ORDER BY batch, position"
        };
        let rows: Vec<(Uuid, i32, Value)> = sqlx::query_as(query)
            .bind(uids)
            .fetch_all(&mut *conn)
            .await?;
        if rows.is_empty() {
            return Err(Error::NotFound);
        }
        let about = decision.map(|d| touch_for(d, rows.iter().map(|(u, r, _)| (*u, *r))));
        let changes = rows
            .into_iter()
            .map(|(_, _, c)| serde_json::from_value(c))
            .collect::<std::result::Result<Vec<Change>, _>>()?;
        let resources = change_resources(&mut conn, &changes).await?;
        drop(conn);
        self.authorize(
            actor,
            Action::ReadReview,
            resources.clone(),
            json!({"operation": "review-places"}),
        )
        .await?;
        Ok((places(&resources), about))
    }

    /// Returns a waiting proposal to its proposer with a note saying what to change.
    pub async fn send_back(&self, reviewer: &Actor, uid: Uuid, note: &str) -> Result<Proposal> {
        let note = note_text(Some(note), true)?;
        self.decide(
            reviewer,
            uid,
            ProposalState::SentBack,
            &[ProposalState::Waiting],
            "proposal.send-back",
            note,
        )
        .await
    }
    /// Closes a proposal for good, with a note saying why. It stays on record.
    pub async fn reject(&self, reviewer: &Actor, uid: Uuid, note: &str) -> Result<Proposal> {
        let note = note_text(Some(note), true)?;
        self.decide(
            reviewer,
            uid,
            ProposalState::Rejected,
            &[ProposalState::Waiting, ProposalState::SentBack],
            "proposal.reject",
            note,
        )
        .await
    }
    async fn decide(
        &self,
        reviewer: &Actor,
        uid: Uuid,
        to: ProposalState,
        from: &[ProposalState],
        action: &str,
        note: Option<String>,
    ) -> Result<Proposal> {
        let mut tx = self.write().await?;
        let row = proposal_row(tx.as_mut(), uid).await?;
        let change: Change = serde_json::from_value(row.change.clone())?;
        let state = ProposalState::parse(&row.state)?;
        if !from.contains(&state) {
            let label = label(tx.as_mut(), &change).await;
            return Err(ValidationError(format!(
                "{label}: a {} proposal cannot be {}",
                state.as_str(),
                to.as_str()
            ))
            .into());
        }
        let resources = change_resources(tx.as_mut(), std::slice::from_ref(&change)).await?;
        let decision = self
            .authorize(
                reviewer,
                Action::Review,
                resources,
                json!({
                    "proposal": uid,
                    "to": to.as_str(),
                    "touch_for": touch_for(
                        if to == ProposalState::Rejected { "reject" } else { "send-back" },
                        [(uid, row.revision)].into_iter(),
                    ),
                }),
            )
            .await?;
        let decided = to == ProposalState::Rejected;
        sqlx::query("UPDATE mer.proposals SET state=$2,decided_by=CASE WHEN $3 THEN $4 END,decided_at=CASE WHEN $3 THEN clock_timestamp() END,updated_at=clock_timestamp() WHERE uid=$1")
            .bind(uid).bind(to.as_str()).bind(decided).bind(&reviewer.subject).execute(tx.as_mut()).await?;
        proposal_event(
            tx.as_mut(),
            row.batch,
            Some(uid),
            action,
            reviewer,
            &decision,
            note.as_deref(),
            json!({}),
        )
        .await?;
        tx.commit().await?;
        let mut conn = self.pool.acquire().await?;
        proposal_row(&mut conn, uid).await?.into_proposal(false)
    }

    /// The proposer answers a send-back: the proposal takes the new change and waits again.
    /// The whole batch is test-run again, since its changes can depend on each other.
    pub async fn revise(
        &self,
        proposer: &Actor,
        uid: Uuid,
        change: Change,
        note: Option<&str>,
    ) -> Result<Batch> {
        let note = note_text(note, false)?;
        change.validate()?;
        let mut conn = self.pool.acquire().await?;
        refuse_no_op(&mut conn, &change).await?;
        let row = proposal_row(&mut conn, uid).await?;
        let owner: String = sqlx::query_scalar("SELECT proposer FROM mer.batches WHERE uid=$1")
            .bind(row.batch)
            .fetch_one(&mut *conn)
            .await?;
        if owner != proposer.subject {
            return Err(Error::Denied(
                "only the proposer can revise its proposal".into(),
            ));
        }
        if !ProposalState::parse(&row.state)?.open() {
            return Err(ValidationError("a decided proposal cannot be revised".into()).into());
        }
        if change.operation() != row.change["operation"].as_str().unwrap_or_default() {
            return Err(ValidationError("a revision keeps the proposal's operation".into()).into());
        }
        let resources = change_resources(&mut conn, std::slice::from_ref(&change)).await?;
        let decision = self
            .authorize(
                proposer,
                Action::Propose,
                resources,
                json!({"revise":uid,"change":change}),
            )
            .await?;
        // As when proposing: Cedar the form didn't write is for owners, with a touch (10 Nov).
        if !hand_written(&mut conn, std::slice::from_ref(&change))
            .await?
            .is_empty()
        {
            let places = change_resources(&mut conn, std::slice::from_ref(&change))
                .await?
                .into_iter()
                .take(1)
                .collect();
            self.authorize(
                proposer,
                Action::WriteCedar,
                places,
                json!({"revise": uid, "operation": "write-cedar"}),
            )
            .await?;
        }
        let open = sqlx::query_as::<_, ProposalRow>("SELECT uid,batch,position,change,state,revision,outcome,checked_at,decided_by,decided_at,created_at,updated_at FROM mer.proposals WHERE batch=$1 AND state IN ('waiting','sent-back') ORDER BY position")
            .bind(row.batch)
            .fetch_all(&mut *conn)
            .await?;
        drop(conn);
        let mut items = vec![];
        for p in &open {
            let c = if p.uid == uid {
                change.clone()
            } else {
                serde_json::from_value(p.change.clone())?
            };
            items.push((proposer.clone(), c));
        }
        let outcomes = self.test_run(proposer, &items).await?;
        let mut tx = self.write().await?;
        for (p, outcome) in open.iter().zip(outcomes) {
            if p.uid == uid {
                sqlx::query("UPDATE mer.proposals SET change=$2,revision=revision+1,state='waiting',outcome=$3,checked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE uid=$1")
                    .bind(uid).bind(serde_json::to_value(&change)?).bind(outcome).execute(tx.as_mut()).await?;
            } else {
                sqlx::query("UPDATE mer.proposals SET outcome=$2,checked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE uid=$1")
                    .bind(p.uid).bind(outcome).execute(tx.as_mut()).await?;
            }
        }
        proposal_event(
            tx.as_mut(),
            row.batch,
            Some(uid),
            "proposal.revise",
            proposer,
            &decision,
            note.as_deref(),
            json!({"revision": row.revision + 1}),
        )
        .await?;
        tx.commit().await?;
        self.just_proposed(row.batch).await
    }

    /// Runs changes in a transaction that is always rolled back, and reports each one's result.
    async fn test_run(&self, actor: &Actor, items: &[(Actor, Change)]) -> Result<Vec<Value>> {
        let runner = Registry {
            pool: self.pool.clone(),
            authorizer: Arc::new(TestRun),
        };
        let mut tx = self.write().await?;
        let results = runner.settle(tx.as_mut(), actor, items).await;
        tx.rollback().await?;
        Ok(results?
            .into_iter()
            .map(|r| r.unwrap_or_else(|error| json!({"ok": false, "error": error})))
            .collect())
    }

    /// Applies every change it can, in passes, so the order within a batch does not matter:
    /// a change that needs another one from the same batch succeeds on a later pass. Each try is
    /// a savepoint, so a failed change leaves nothing behind.
    async fn settle(
        &self,
        conn: &mut PgConnection,
        approver: &Actor,
        items: &[(Actor, Change)],
    ) -> Result<Vec<std::result::Result<Value, String>>> {
        let mut results: Vec<std::result::Result<Value, String>> =
            vec![Err("not run".into()); items.len()];
        let mut pending: Vec<usize> = (0..items.len()).collect();
        loop {
            let mut failed = vec![];
            for &i in &pending {
                let mut savepoint = conn.begin().await?;
                match self
                    .apply(savepoint.as_mut(), &items[i].0, approver, &items[i].1)
                    .await
                {
                    Ok(outcome) => {
                        savepoint.commit().await?;
                        results[i] = Ok(outcome);
                    }
                    Err(e) => {
                        savepoint.rollback().await?;
                        // Mero's own failure is not for the page or the stored outcome (10 Nov):
                        // the log keeps the detail.
                        results[i] = Err(match &e {
                            Error::Database(_) | Error::Migration(_) | Error::Json(_) => {
                                tracing::error!(error = %e, "a change failed on Mero's side");
                                "Mero could not apply it: try again".to_string()
                            }
                            _ => e.to_string(),
                        });
                        failed.push(i);
                    }
                }
            }
            // Done when everything applied, or when a pass applied nothing: the rest fail on their own.
            if failed.is_empty() || failed.len() == pending.len() {
                break;
            }
            pending = failed;
        }
        // A renamed component is checked again once every change has had its turn (18 Nov): under
        // its new name it must still pass its rule, so the batch that renames it also moves its files
        // to the folder named for it, and its new type names must be free.
        for (i, (_, change)) in items.iter().enumerate() {
            let Change::Rename { uid, .. } = change else {
                continue;
            };
            if results[i].is_err() {
                continue;
            }
            let e = load(conn, *uid).await?;
            if e.classification.kind != MeronType::Component {
                continue;
            }
            let invariants = applicable_invariants(conn, &e.classification).await?;
            let checked = checks::run(
                conn,
                e.identity.uid,
                &e.identity.path,
                &e.spec,
                &invariants,
                &HashMap::new(),
            )
            .await;
            match checked {
                Ok(_) => {}
                Err(Error::Validation(v)) => {
                    results[i] = Err(format!(
                        "as {}, it does not pass its rule: {}. Change what the new name needs (such as its files' folder) in the same batch",
                        e.identity.path, v.0
                    ));
                }
                Err(other) => return Err(other),
            }
        }
        Ok(results)
    }

    /// One change, exactly as proposed. Returns what it did, for the proposal's record.
    async fn apply(
        &self,
        conn: &mut PgConnection,
        proposer: &Actor,
        approver: &Actor,
        change: &Change,
    ) -> Result<Value> {
        let before: i64 = sqlx::query_scalar("SELECT coalesce(max(sequence),0) FROM mer.events")
            .fetch_one(&mut *conn)
            .await?;
        // The meron as it was, so the record shows what changed even after Mero has moved on.
        let was = match change.target() {
            Some(uid) => Some(load(conn, uid).await?),
            None => None,
        };
        let after = match change {
            Change::Add { meron, container } => {
                let m = self.propose_in(conn, proposer, meron.clone()).await?;
                let container = match container {
                    Some(path) => resolve(conn, path).await?,
                    None => load(conn, m.authority_scope).await?,
                };
                self.relate_in(
                    conn,
                    approver,
                    container.identity.uid,
                    Predicate::Contains,
                    m.identity.uid,
                )
                .await?;
                let m = self
                    .transition_in(
                        conn,
                        approver,
                        m.identity.uid,
                        m.revision,
                        MeronState::Registered,
                        None,
                    )
                    .await?;
                self.transition_in(
                    conn,
                    approver,
                    m.identity.uid,
                    m.revision,
                    MeronState::Active,
                    None,
                )
                .await?
            }
            Change::Update {
                uid,
                expected_revision,
                meron,
                compatibility,
            } => {
                self.update_in(
                    conn,
                    approver,
                    *uid,
                    *expected_revision,
                    meron.clone(),
                    compatibility.clone(),
                )
                .await?
            }
            Change::Rename {
                uid,
                expected_revision,
                path,
            } => {
                self.rename_in(conn, approver, *uid, *expected_revision, path)
                    .await?
            }
            Change::Deprecate {
                uid,
                expected_revision,
            } => {
                self.transition_in(
                    conn,
                    approver,
                    *uid,
                    *expected_revision,
                    MeronState::Deprecated,
                    None,
                )
                .await?
            }
            Change::Reinstate {
                uid,
                expected_revision,
                reason,
            } => {
                self.transition_in(
                    conn,
                    approver,
                    *uid,
                    *expected_revision,
                    MeronState::Active,
                    Some(reason.trim()),
                )
                .await?
            }
        };
        let rows: Vec<(String, Value)> = sqlx::query_as(
            "SELECT action,payload FROM mer.events WHERE sequence > $1 ORDER BY sequence",
        )
        .bind(before)
        .fetch_all(&mut *conn)
        .await?;
        let mut steps = vec![];
        let mut gathered: BTreeMap<&str, Vec<Value>> = BTreeMap::new();
        for (action, payload) in rows {
            steps.push(action);
            for field in [
                "checks",
                "invariants",
                "covered",
                "rechecked",
                "affected_consumers",
            ] {
                if let Some(values) = payload.get(field).and_then(Value::as_array) {
                    gathered
                        .entry(field)
                        .or_default()
                        .extend(values.iter().cloned());
                }
            }
        }
        let mut outcome = json!({"ok": true, "meron": after, "steps": steps});
        if let Some(was) = was {
            outcome["before"] = json!(was);
        }
        for (field, values) in gathered {
            outcome[field] = Value::Array(values);
        }
        Ok(outcome)
    }
}

/// Governance resources a change touches: the meron it changes, or the system a new one joins.
async fn change_resources(conn: &mut PgConnection, changes: &[Change]) -> Result<Vec<Resource>> {
    let mut out = vec![];
    for change in changes {
        match change {
            Change::Add { meron, container } => {
                let scope = meron.authority_scope.ok_or_else(|| {
                    ValidationError(format!(
                        "{}: a new meron needs its authority_scope",
                        meron.path
                    ))
                })?;
                out.push(Resource {
                    uid: Uuid::nil(),
                    path: meron.path.clone(),
                    revision: 0,
                    authority_scope: scope,
                });
                out.push(resource(&load(conn, scope).await?));
                // The meron it goes into is changed too (9 Nov, step 7): it is among the places.
                if let Some(path) = container {
                    out.push(resource(&resolve(conn, path).await?));
                }
            }
            Change::Rename { uid, path, .. } => {
                // Both places: where it is, and where it would go.
                let meron = load(conn, *uid).await?;
                let mut moved = resource(&meron);
                moved.path = path.clone();
                out.push(resource(&meron));
                out.push(moved);
            }
            other => out.push(resource(
                &load(conn, other.target().expect("only add has no target")).await?,
            )),
        }
    }
    Ok(out)
}

/// Two values that say the same thing as JSON, even if their types differ.
fn same<A: Serialize, B: Serialize>(a: &A, b: &B) -> bool {
    serde_json::to_value(a).ok() == serde_json::to_value(b).ok()
}

/// Whether a proposed meron is exactly the meron as it is: every field the same.
fn unchanged(current: &Meron, proposed: &NewMeron) -> bool {
    current.identity.path == proposed.path
        && current.identity.name == proposed.name
        && same(&current.classification, &proposed.classification)
        && same(&current.semantics, &proposed.semantics)
        && same(&current.lifecycle.release_mode, &proposed.release_mode)
        && proposed
            .authority_scope
            .is_none_or(|s| s == current.authority_scope)
        && current.metadata == proposed.metadata
        && current.spec == proposed.spec
}
/// A change that would change nothing is refused before it reaches Review: an update that leaves
/// every field as it is, or a rename to the path the meron already has.
async fn refuse_no_op(conn: &mut PgConnection, change: &Change) -> Result<()> {
    match change {
        Change::Update { uid, meron, .. } => {
            let current = load(conn, *uid).await?;
            if unchanged(&current, meron) {
                return Err(ValidationError(format!(
                    "{}: this change changes nothing; edit something first",
                    current.identity.path
                ))
                .into());
            }
        }
        Change::Rename { uid, path, .. } => {
            let current = load(conn, *uid).await?;
            if current.identity.path == *path {
                return Err(ValidationError(format!("{path}: it is already at this path")).into());
            }
        }
        _ => {}
    }
    Ok(())
}

/// Whether an open proposal no longer fits Mero: its meron moved on, or its new path is taken.
async fn is_stale(conn: &mut PgConnection, change: &Change) -> Result<bool> {
    match change {
        Change::Add { meron, .. } => Ok(sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM mer.identifiers WHERE path=$1)",
        )
        .bind(&meron.path)
        .fetch_one(&mut *conn)
        .await?),
        other => {
            let current = load(conn, other.target().expect("only add has no target")).await?;
            Ok(Some(current.revision) != other.expected_revision())
        }
    }
}

/// A short name for a change in messages: its path, and what it does.
async fn label(conn: &mut PgConnection, change: &Change) -> String {
    match change {
        Change::Add { meron, .. } => format!("add {}", meron.path),
        other => {
            let path = match load(conn, other.target().expect("only add has no target")).await {
                Ok(m) => m.identity.path,
                Err(_) => other.target().map(|u| u.to_string()).unwrap_or_default(),
            };
            format!("{} {path}", other.operation())
        }
    }
}

async fn proposal_row(conn: &mut PgConnection, uid: Uuid) -> Result<ProposalRow> {
    sqlx::query_as::<_, ProposalRow>("SELECT uid,batch,position,change,state,revision,outcome,checked_at,decided_by,decided_at,created_at,updated_at FROM mer.proposals WHERE uid=$1")
        .bind(uid)
        .fetch_optional(conn)
        .await?
        .ok_or(Error::NotFound)
}

#[allow(clippy::too_many_arguments)]
async fn proposal_event(
    conn: &mut PgConnection,
    batch: Uuid,
    proposal: Option<Uuid>,
    action: &str,
    actor: &Actor,
    decision: &Decision,
    note: Option<&str>,
    payload: Value,
) -> Result<()> {
    sqlx::query("INSERT INTO mer.proposal_events(batch,proposal,action,actor,authorization_decision,note,payload) VALUES($1,$2,$3,$4,$5,$6,$7)")
        .bind(batch).bind(proposal).bind(action).bind(&actor.subject).bind(serde_json::to_value(decision)?).bind(note).bind(payload)
        .execute(conn).await?;
    Ok(())
}

/// What a touch for a decision in Review names besides its places (9 Nov, step 7): the decision,
/// and each proposal at its revision, in order. Changed after the touch, a proposal needs a new one.
pub fn touch_for(decision: &str, proposals: impl Iterator<Item = (Uuid, i32)>) -> Value {
    let mut named: Vec<String> = proposals.map(|(uid, rev)| format!("{uid}@{rev}")).collect();
    named.sort();
    json!({ "decision": decision, "proposals": named })
}

/// What approving these changes does besides "review" (9 Nov, step 7), each action with its places,
/// for the approver who applies them: a new meron is linked into its container and moved to active,
/// an update is an update or a breaking change, a rename renames, a deprecation or reinstatement
/// moves it through its lifecycle. Proposing was asked when it was proposed.
async fn change_actions(
    conn: &mut PgConnection,
    changes: &[Change],
) -> Result<Vec<(Action, Vec<Resource>)>> {
    fn add(
        by: &mut BTreeMap<&'static str, (Action, Vec<Resource>)>,
        action: Action,
        more: Vec<Resource>,
    ) {
        by.entry(action.as_str())
            .or_insert_with(|| (action, vec![]))
            .1
            .extend(more);
    }
    let mut by: BTreeMap<&'static str, (Action, Vec<Resource>)> = BTreeMap::new();
    for change in changes {
        match change {
            Change::Add { meron, container } => {
                let scope = meron.authority_scope.ok_or_else(|| {
                    ValidationError(format!(
                        "{}: a new meron needs its authority_scope",
                        meron.path
                    ))
                })?;
                let new = Resource {
                    uid: Uuid::nil(),
                    path: meron.path.clone(),
                    revision: 0,
                    authority_scope: scope,
                };
                let holder = match container {
                    Some(path) => resolve(conn, path).await?,
                    None => load(conn, scope).await?,
                };
                add(
                    &mut by,
                    Action::Relate,
                    vec![resource(&holder), new.clone()],
                );
                add(&mut by, Action::Transition, vec![new]);
            }
            Change::Update {
                uid, compatibility, ..
            } => {
                let action = if compatibility.impact == Impact::NonBreaking {
                    Action::Update
                } else {
                    Action::EvolveBreaking
                };
                add(&mut by, action, vec![resource(&load(conn, *uid).await?)]);
            }
            Change::Rename { uid, path, .. } => {
                let meron = load(conn, *uid).await?;
                let mut moved = resource(&meron);
                moved.path = path.clone();
                add(&mut by, Action::Rename, vec![resource(&meron), moved]);
            }
            Change::Deprecate { uid, .. } | Change::Reinstate { uid, .. } => {
                add(
                    &mut by,
                    Action::Transition,
                    vec![resource(&load(conn, *uid).await?)],
                );
            }
        }
    }
    Ok(by.into_values().collect())
}

/// The changes that bring Cedar the form didn't write, new or changed, for a role or rule (9 Nov,
/// step 7): proposing them asks "write Cedar", which only owners hold.
async fn hand_written(conn: &mut PgConnection, changes: &[Change]) -> Result<Vec<Change>> {
    let mut out = vec![];
    for change in changes {
        let (meron, before) = match change {
            Change::Add { meron, .. } => (meron, None),
            Change::Update { uid, meron, .. } => (meron, Some(load(conn, *uid).await?)),
            _ => continue,
        };
        if meron.classification.kind != MeronType::Rule {
            continue;
        }
        let Some(cedar) = meron.spec.get("cedar").and_then(Value::as_str) else {
            continue;
        };
        if before.is_some_and(|b| b.spec.get("cedar").and_then(Value::as_str) == Some(cedar)) {
            continue;
        }
        let read = if meron.classification.subtype.as_deref() == Some("role") {
            let system = meron
                .spec
                .get("system")
                .and_then(Value::as_str)
                .unwrap_or_default();
            noi_gov::form::read_role(system, cedar).map(|_| ())
        } else {
            noi_gov::form::read_rule(cedar).map(|_| ())
        };
        if read.is_err() {
            out.push(change.clone());
        }
    }
    Ok(out)
}

/// The places a component's change touches: a component's meron, or the rule every component meets.
fn is_component_place(path: &str) -> bool {
    crate::approved::covers(path)
}
