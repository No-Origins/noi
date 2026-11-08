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
}
impl Change {
    pub fn operation(&self) -> &'static str {
        match self {
            Change::Add { .. } => "add",
            Change::Update { .. } => "update",
            Change::Rename { .. } => "rename",
            Change::Deprecate { .. } => "deprecate",
        }
    }
    pub fn target(&self) -> Option<Uuid> {
        match self {
            Change::Add { .. } => None,
            Change::Update { uid, .. }
            | Change::Rename { uid, .. }
            | Change::Deprecate { uid, .. } => Some(*uid),
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
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProposalState {
    Waiting,
    SentBack,
    Approved,
    Rejected,
}
impl ProposalState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Waiting => "waiting",
            Self::SentBack => "sent-back",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
        }
    }
    fn parse(s: &str) -> Result<Self> {
        Ok(match s {
            "waiting" => Self::Waiting,
            "sent-back" => Self::SentBack,
            "approved" => Self::Approved,
            "rejected" => Self::Rejected,
            other => return Err(ValidationError(format!("unknown proposal state {other}")).into()),
        })
    }
    fn open(self) -> bool {
        matches!(self, Self::Waiting | Self::SentBack)
    }
}

/// What a proposer sends: a title, an optional note, and the changes, in order.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewBatch {
    pub title: String,
    #[serde(default)]
    pub note: Option<String>,
    pub changes: Vec<Change>,
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
    pub proposals: Vec<Proposal>,
    pub events: Vec<ProposalEvent>,
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
        let mut conn = self.pool.acquire().await?;
        for change in &batch.changes {
            refuse_no_op(&mut conn, change).await?;
        }
        let resources = change_resources(&mut conn, &batch.changes).await?;
        drop(conn);
        let decision = self
            .authorize(
                proposer,
                Action::Propose,
                resources,
                json!({"batch":batch.title,"changes":batch.changes}),
            )
            .await?;
        let items: Vec<(Actor, Change)> = batch
            .changes
            .iter()
            .map(|c| (proposer.clone(), c.clone()))
            .collect();
        let outcomes = self.test_run(proposer, &items).await?;
        let mut tx = self.write().await?;
        let uid = Uuid::new_v4();
        sqlx::query("INSERT INTO mer.batches(uid,title,proposer) VALUES($1,$2,$3)")
            .bind(uid)
            .bind(batch.title.trim())
            .bind(&proposer.subject)
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
        self.batch(proposer, uid).await
    }

    /// Every batch, newest first, with its proposals and their history.
    pub async fn review(&self, actor: &Actor) -> Result<Vec<Batch>> {
        let mut conn = self.pool.acquire().await?;
        let batches = sqlx::query_as::<_, BatchRow>(
            "SELECT * FROM mer.batches ORDER BY created_at DESC, uid",
        )
        .fetch_all(&mut *conn)
        .await?;
        self.read_review(&mut conn, actor, batches, true).await
    }
    pub async fn batch(&self, actor: &Actor, uid: Uuid) -> Result<Batch> {
        let mut conn = self.pool.acquire().await?;
        let batches = sqlx::query_as::<_, BatchRow>("SELECT * FROM mer.batches WHERE uid=$1")
            .bind(uid)
            .fetch_all(&mut *conn)
            .await?;
        self.read_review(&mut conn, actor, batches, false)
            .await?
            .pop()
            .ok_or(Error::NotFound)
    }
    /// Reading all of review needs reading the registry (`noi`) too; reading one batch needs
    /// reading only what it touches, so an agent allowed in one place sees what it proposed.
    async fn read_review(
        &self,
        conn: &mut PgConnection,
        actor: &Actor,
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
        for row in rows {
            let change: Change = serde_json::from_value(row.change.clone())?;
            resources.extend(change_resources(conn, std::slice::from_ref(&change)).await?);
            let open = ProposalState::parse(&row.state)?.open();
            let stale = open && is_stale(conn, &change).await?;
            proposals.push(row.into_proposal(stale)?);
        }
        if resources.is_empty() {
            return Ok(vec![]);
        }
        self.authorize(
            actor,
            Action::Read,
            resources,
            json!({"operation":"review"}),
        )
        .await?;
        Ok(batches
            .into_iter()
            .map(|b| Batch {
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
                uid: b.uid,
                title: b.title,
                proposer: b.proposer,
                created_at: b.created_at,
            })
            .collect())
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
                json!({"approve": rows.iter().map(|r| r.uid).collect::<Vec<_>>()}),
            )
            .await?;
        let under = Registry {
            pool: self.pool.clone(),
            authorizer: Arc::new(UnderApproval(decision.clone())),
        };
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
        let mut approved = vec![];
        for (row, result) in rows.into_iter().zip(results) {
            let outcome = result.expect("failures returned above");
            sqlx::query("UPDATE mer.proposals SET state='approved',decided_by=$2,decided_at=clock_timestamp(),outcome=$3,checked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE uid=$1")
                .bind(row.uid).bind(&approver.subject).bind(&outcome).execute(tx.as_mut()).await?;
            proposal_event(
                tx.as_mut(),
                row.batch,
                Some(row.uid),
                "proposal.approve",
                approver,
                &decision,
                None,
                json!({"steps": outcome["steps"]}),
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

    /// The places that approving (every waiting proposal of these, or of these batches) or sending
    /// back or rejecting (one proposal) asks Governance about: exactly what a touch must be for.
    pub async fn review_places(
        &self,
        actor: &Actor,
        uids: &[Uuid],
        whole_batches: bool,
    ) -> Result<Vec<String>> {
        let mut conn = self.pool.acquire().await?;
        let query = if whole_batches {
            "SELECT change FROM mer.proposals WHERE uid = ANY($1) OR (batch = ANY($1) AND state = 'waiting') ORDER BY batch, position"
        } else {
            "SELECT change FROM mer.proposals WHERE uid = ANY($1) ORDER BY batch, position"
        };
        let rows: Vec<Value> = sqlx::query_scalar(query)
            .bind(uids)
            .fetch_all(&mut *conn)
            .await?;
        if rows.is_empty() {
            return Err(Error::NotFound);
        }
        let changes = rows
            .into_iter()
            .map(serde_json::from_value)
            .collect::<std::result::Result<Vec<Change>, _>>()?;
        let resources = change_resources(&mut conn, &changes).await?;
        drop(conn);
        self.authorize(
            actor,
            Action::Read,
            resources.clone(),
            json!({"operation": "review-places"}),
        )
        .await?;
        Ok(places(&resources))
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
                json!({"proposal":uid,"to":to.as_str()}),
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
        self.batch(proposer, row.batch).await
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
                        results[i] = Err(e.to_string());
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
                    )
                    .await?;
                self.transition_in(
                    conn,
                    approver,
                    m.identity.uid,
                    m.revision,
                    MeronState::Active,
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
            Change::Add { meron, .. } => {
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
