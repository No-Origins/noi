//! Transactional PostgreSQL registry. Every domain operation crosses the Governance boundary.
use chrono::{DateTime, Utc};

/// A kept problem: seq, when, request ID, method, path, status, what.
type ProblemRow = (i64, DateTime<Utc>, String, String, String, i32, String);
use noi_gov::{
    answer, places, Action, Actor, Answer, AuthorizationRequest, Authorizer, Decision, DenyAll,
    Resource,
};
use noi_inv::*;
use serde_json::{json, Value};
use sqlx::{
    postgres::PgPoolOptions, Connection, FromRow, PgConnection, PgPool, Postgres, Transaction,
};
use std::{
    collections::{BTreeMap, HashMap},
    str::FromStr,
    sync::Arc,
    time::Duration,
};
use uuid::Uuid;

pub mod approved;
mod checks;
pub mod github;
pub mod reference;
mod review;
pub use review::{Batch, Change, NewBatch, Proposal, ProposalEvent, ProposalState};
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Validation(#[from] ValidationError),
    #[error("registry record not found")]
    NotFound,
    #[error("revision conflict (expected {expected}, actual {actual})")]
    Conflict { expected: i64, actual: i64 },
    #[error("Governance denied operation: {0}")]
    Denied(String),
    #[error("Governance approval required: {0}")]
    ApprovalRequired(String),
    #[error("database constraint or operation failed: {0}")]
    Database(#[from] sqlx::Error),
    #[error("migration failed: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("serialization failed: {0}")]
    Json(#[from] serde_json::Error),
}
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Clone)]
pub struct Registry {
    pool: PgPool,
    authorizer: Arc<dyn Authorizer>,
}
impl Registry {
    /// Keeps one problem for the Problems page (agreed 8 Nov). Nothing secret reaches here: the path
    /// has no query, and `what` is the inner reason a request failed.
    pub async fn record_problem(
        &self,
        request_id: &str,
        method: &str,
        path: &str,
        status: i32,
        what: &str,
    ) -> Result<()> {
        sqlx::query("INSERT INTO mer.problems(request_id, method, path, status, what) VALUES($1,$2,$3,$4,$5)")
            .bind(request_id)
            .bind(method)
            .bind(path)
            .bind(status)
            .bind(what)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Mero's problems, newest first, `limit` at a time, before `before` when given. Who may read
    /// them is Governance's to say; the caller asks first.
    pub async fn problems(&self, before: Option<i64>, limit: i64) -> Result<Vec<Value>> {
        let rows: Vec<ProblemRow> = sqlx::query_as(
            "SELECT seq, at, request_id, method, path, status, what FROM mer.problems
             WHERE $1::bigint IS NULL OR seq < $1 ORDER BY seq DESC LIMIT $2",
        )
        .bind(before)
        .bind(limit.clamp(1, 200))
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|(seq, at, request_id, method, path, status, what)| {
                serde_json::json!({"seq": seq, "at": at, "request_id": request_id, "method": method, "path": path, "status": status, "what": what})
            })
            .collect())
    }

    /// Whether Mero's database answers, for `/health/ready`.
    pub async fn database_answers(&self) -> bool {
        sqlx::query("SELECT 1").execute(&self.pool).await.is_ok()
    }

    pub async fn connect(url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect(url)
            .await?;
        Ok(Self {
            pool,
            authorizer: Arc::new(DenyAll),
        })
    }
    pub fn with_authorizer(mut self, authorizer: Arc<dyn Authorizer>) -> Self {
        self.authorizer = authorizer;
        self
    }
    /// Administrative migration operation. Use migration-owner credentials, not runtime credentials.
    pub async fn migrate(&self) -> Result<()> {
        let migrator = sqlx::migrate!("../../migrations");
        // Use a dedicated connection so migration search_path never reaches runtime queries.
        let mut conn = PgConnection::connect_with(&self.pool.connect_options()).await?;
        let mut tx = conn.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(726245902)")
            .execute(tx.as_mut())
            .await?;
        sqlx::query("CREATE SCHEMA IF NOT EXISTS mer_migrations")
            .execute(tx.as_mut())
            .await?;
        sqlx::query("REVOKE ALL ON SCHEMA mer_migrations FROM PUBLIC")
            .execute(tx.as_mut())
            .await?;
        let own_history: bool =
            sqlx::query_scalar("SELECT to_regclass('mer_migrations._sqlx_migrations') IS NOT NULL")
                .fetch_one(tx.as_mut())
                .await?;
        let legacy_schema: bool = sqlx::query_scalar("SELECT to_regnamespace('mer') IS NOT NULL")
            .fetch_one(tx.as_mut())
            .await?;
        if !own_history && legacy_schema {
            let legacy_history: bool =
                sqlx::query_scalar("SELECT to_regclass('public._sqlx_migrations') IS NOT NULL")
                    .fetch_one(tx.as_mut())
                    .await?;
            if !legacy_history {
                return Err(ValidationError("mer exists without registry migration history; reconcile with a migration owner".into()).into());
            }
            sqlx::query("LOCK TABLE public._sqlx_migrations IN ACCESS EXCLUSIVE MODE")
                .execute(tx.as_mut())
                .await?;
            let applied: Vec<(i64, Vec<u8>, bool)> =
                sqlx::query_as("SELECT version,checksum,success FROM public._sqlx_migrations")
                    .fetch_all(tx.as_mut())
                    .await?;
            if applied.is_empty()
                || applied.iter().any(|(version, checksum, success)| {
                    !success
                        || !migrator.iter().any(|m| {
                            m.version == *version && m.checksum.as_ref() == checksum.as_slice()
                        })
                })
            {
                return Err(ValidationError("legacy migration history is mixed, incomplete or changed; separate it manually before registry migration".into()).into());
            }
            // Relocate only a verified registry-only ledger. Application records are untouched.
            sqlx::query("ALTER TABLE public._sqlx_migrations SET SCHEMA mer_migrations")
                .execute(tx.as_mut())
                .await?;
        }
        tx.commit().await?;
        sqlx::query("SET search_path TO mer_migrations, pg_catalog")
            .execute(&mut conn)
            .await?;
        // SQLx exposes run_direct for the borrowed-connection Acquire/Send limitation.
        migrator.run_direct(&mut conn).await?;
        Ok(())
    }
    async fn write(&self) -> Result<Transaction<'_, Postgres>> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(726245901)")
            .execute(tx.as_mut())
            .await?;
        Ok(tx)
    }
    async fn authorize(
        &self,
        actor: &Actor,
        action: Action,
        resources: Vec<Resource>,
        intent: Value,
    ) -> Result<Decision> {
        nonblank("actor", &actor.subject, 200)?;
        let request = AuthorizationRequest {
            actor: actor.clone(),
            action,
            resources,
            intent,
        };
        let decision = self.authorizer.authorize(&request).await;
        match &decision {
            Decision::Allow { reference, .. } if !reference.trim().is_empty() => Ok(decision),
            Decision::Allow { .. } => Err(Error::Denied(
                "authorizer returned an empty decision reference".into(),
            )),
            Decision::Deny { reason } => Err(Error::Denied(reason.clone())),
            Decision::ApprovalRequired { reference, reason } => {
                Err(Error::ApprovalRequired(format!("{reference}: {reason}")))
            }
        }
    }
    pub async fn propose(&self, actor: &Actor, proposal: NewMeron) -> Result<Meron> {
        let mut tx = self.write().await?;
        let meron = self.propose_in(tx.as_mut(), actor, proposal).await?;
        tx.commit().await?;
        Ok(meron)
    }
    async fn propose_in(
        &self,
        conn: &mut PgConnection,
        actor: &Actor,
        proposal: NewMeron,
    ) -> Result<Meron> {
        proposal.validate()?;
        let uid = Uuid::new_v4();
        let scope = match proposal.authority_scope {
            Some(id) => id,
            None if proposal.path == "noi" && proposal.classification.kind == MeronType::System => {
                uid
            }
            None => {
                return Err(ValidationError(
                    "authority_scope is required except for the NOI root bootstrap".into(),
                )
                .into())
            }
        };
        let mut resources = vec![Resource {
            uid,
            path: proposal.path.clone(),
            revision: 0,
            authority_scope: scope,
        }];
        if scope != uid {
            let scope_meron = load(conn, scope).await?;
            if scope_meron.classification.kind != MeronType::System
                || scope_meron.lifecycle.state == MeronState::Retired
            {
                return Err(ValidationError("authority scope must be a live system".into()).into());
            }
            resources.push(resource(&scope_meron));
        }
        let (invariants, checked) = conformance(conn, uid, &proposal).await?;
        let decision = self
            .authorize(
                actor,
                Action::Propose,
                resources,
                json!({"proposal":proposal,"invariants":invariants,"checks":checked.records}),
            )
            .await?;
        sqlx::query("INSERT INTO mer.merons(uid,path,name,kind,subtype,roles,definition,responsibility,release_mode,authority_scope,metadata,spec) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)")
            .bind(uid).bind(&proposal.path).bind(&proposal.name).bind(proposal.classification.kind.as_str()).bind(&proposal.classification.subtype)
            .bind(json!(proposal.classification.roles)).bind(&proposal.semantics.definition).bind(&proposal.semantics.responsibility)
            .bind(proposal.release_mode.as_str()).bind(scope).bind(&proposal.metadata).bind(&proposal.spec).execute(&mut *conn).await?;
        sqlx::query("INSERT INTO mer.identifiers(path,meron_uid) VALUES($1,$2)")
            .bind(&proposal.path)
            .bind(uid)
            .execute(&mut *conn)
            .await?;
        let meron = load(conn, uid).await?;
        event(
            conn,
            uid,
            "meron.propose",
            actor,
            &decision,
            json!({"after":meron,"invariants":invariants,"checks":checked.records}),
        )
        .await?;
        Ok(meron)
    }
    pub async fn get(&self, actor: &Actor, path_or_uid: &str) -> Result<Meron> {
        let mut conn = self.pool.acquire().await?;
        let meron = if let Ok(uid) = Uuid::parse_str(path_or_uid) {
            load(&mut conn, uid).await?
        } else {
            resolve(&mut conn, path_or_uid).await?
        };
        self.authorize(
            actor,
            Action::Read,
            vec![resource(&meron)],
            json!({"operation":"get"}),
        )
        .await?;
        Ok(meron)
    }
    pub async fn snapshot(&self, actor: &Actor) -> Result<Snapshot> {
        self.snapshot_under(actor, None).await
    }
    /// The registry, or only one place and everything under it (9 Nov, step 6): Governance's
    /// pages read the roles and rules under noi.gov, not every meron.
    pub async fn snapshot_under(&self, actor: &Actor, under: Option<&str>) -> Result<Snapshot> {
        if let Some(place) = under {
            let ok = place.split('.').all(|p| {
                p.starts_with(|c: char| c.is_ascii_lowercase())
                    && p.chars()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            });
            if !ok {
                return Err(Error::Validation(ValidationError(format!(
                    "{place} is not a place in Mero"
                ))));
            }
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(tx.as_mut())
            .await?;
        let rows = sqlx::query_as::<_, MeronRow>(
            "SELECT * FROM mer.merons WHERE $1::text IS NULL OR path = $1 OR path LIKE $1 || '.%' ORDER BY path",
        )
        .bind(under)
        .fetch_all(tx.as_mut())
        .await?;
        let merons: Vec<Meron> = rows
            .into_iter()
            .map(TryInto::try_into)
            .collect::<Result<_>>()?;
        // Authorize even an empty registry: this resource is the requested namespace.
        let resources = if merons.is_empty() {
            vec![Resource {
                uid: Uuid::nil(),
                path: under.unwrap_or("noi").into(),
                revision: 0,
                authority_scope: Uuid::nil(),
            }]
        } else {
            merons.iter().map(resource).collect()
        };
        self.authorize(
            actor,
            Action::Read,
            resources,
            json!({"operation":"snapshot"}),
        )
        .await?;
        let uids: Vec<Uuid> = merons.iter().map(|m| m.identity.uid).collect();
        let relationships = sqlx::query_as::<_, RelationshipRow>(
            "SELECT * FROM mer.relationships WHERE $1 OR (source = ANY($2) AND target = ANY($2)) ORDER BY source,predicate,target",
        )
        .bind(under.is_none())
        .bind(&uids)
        .fetch_all(tx.as_mut())
        .await?
        .into_iter()
        .map(TryInto::try_into)
        .collect::<Result<_>>()?;
        let releases = sqlx::query_as::<_, ReleaseRow>(
            "SELECT * FROM mer.releases WHERE $1 OR meron_uid = ANY($2) ORDER BY meron_uid,generation,created_at,uid",
        )
        .bind(under.is_none())
        .bind(&uids)
        .fetch_all(tx.as_mut())
        .await?
        .into_iter()
        .map(TryInto::try_into)
        .collect::<Result<_>>()?;
        let generated_at = sqlx::query_scalar("SELECT transaction_timestamp()")
            .fetch_one(tx.as_mut())
            .await?;
        tx.commit().await?;
        Ok(Snapshot {
            schema_version: "inv-registry/0.1.0".into(),
            generated_at,
            merons,
            relationships,
            releases,
        })
    }
    /// The roles and rules under noi.gov, and nothing else: what Governance copies in order to
    /// decide. The one read Mero answers without asking Governance, which needs it to answer at
    /// all; roles and rules hold no secrets (rule 8).
    /// How current the roles and rules under noi.gov are (9 Nov, step 7), as Governance's copy of
    /// them is measured: sent with each question, so Governance never decides on a stale copy.
    pub async fn rules_version(&self) -> Result<String> {
        let snapshot = self.roles_and_rules().await?;
        Ok(noi_gov::rules_version(snapshot.merons.iter().map(|m| {
            (
                m.identity.path.as_str(),
                m.revision,
                m.lifecycle.state.as_str(),
            )
        })))
    }
    pub async fn roles_and_rules(&self) -> Result<Snapshot> {
        let mut conn = self.pool.acquire().await?;
        let rows = sqlx::query_as::<_, MeronRow>(
            "SELECT * FROM mer.merons WHERE kind = 'rule' AND path LIKE 'noi.gov.%' ORDER BY path",
        )
        .fetch_all(&mut *conn)
        .await?;
        let merons = rows
            .into_iter()
            .map(TryInto::try_into)
            .collect::<Result<_>>()?;
        let generated_at = sqlx::query_scalar("SELECT now()")
            .fetch_one(&mut *conn)
            .await?;
        Ok(Snapshot {
            schema_version: "inv-registry/0.1.0".into(),
            generated_at,
            merons,
            relationships: vec![],
            releases: vec![],
        })
    }
    pub async fn history(&self, actor: &Actor, uid: Uuid) -> Result<Vec<Event>> {
        let mut conn = self.pool.acquire().await?;
        let meron = load(&mut conn, uid).await?;
        self.authorize(
            actor,
            Action::Read,
            vec![resource(&meron)],
            json!({"operation":"history"}),
        )
        .await?;
        let rows=sqlx::query_as::<_,EventRow>("SELECT * FROM mer.events WHERE meron_uid=$1 OR payload->'relationship'->>'target'=$1::text ORDER BY sequence").bind(uid).fetch_all(&mut *conn).await?;
        // History can mention other endpoints, consumers and pre-rename locations.
        // A grant on the requested current name must not disclose those implicitly.
        let mut resources = vec![resource(&meron)];
        let mut related = std::collections::HashSet::new();
        for row in &rows {
            related.insert(row.meron_uid);
            for field in ["before", "after"] {
                if let Some(value) = row.payload.get(field) {
                    if let Ok(historical) = serde_json::from_value::<Meron>(value.clone()) {
                        resources.push(resource(&historical));
                    }
                }
            }
            if let Some(value) = row.payload.get("relationship") {
                let relationship: Relationship = serde_json::from_value(value.clone())?;
                related.insert(relationship.source);
                related.insert(relationship.target);
            }
            if let Some(consumers) = row
                .payload
                .get("affected_consumers")
                .and_then(Value::as_array)
            {
                for value in consumers {
                    related.insert(serde_json::from_value::<Uuid>(value.clone())?);
                }
            }
            for field in ["invariants", "covered", "rechecked"] {
                if let Some(refs) = row.payload.get(field).and_then(Value::as_array) {
                    for value in refs {
                        related.insert(serde_json::from_value::<RevisionRef>(value.clone())?.uid);
                    }
                }
            }
            for check in row
                .payload
                .get("checks")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                for value in check
                    .get("read")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    related.insert(serde_json::from_value::<RevisionRef>(value.clone())?.uid);
                }
            }
        }
        for related_uid in related {
            resources.push(resource(&load(&mut conn, related_uid).await?));
        }
        self.authorize(
            actor,
            Action::Read,
            resources,
            json!({"operation":"history-with-related-resources"}),
        )
        .await?;
        Ok(rows
            .into_iter()
            .map(|r| Event {
                sequence: r.sequence,
                meron_uid: r.meron_uid,
                action: r.action,
                actor: r.actor,
                authorization: r.authorization_decision,
                payload: r.payload,
                occurred_at: r.occurred_at,
            })
            .collect())
    }
    pub async fn rename(
        &self,
        actor: &Actor,
        uid: Uuid,
        expected_revision: i64,
        path: &str,
    ) -> Result<Meron> {
        let mut tx = self.write().await?;
        let after = self
            .rename_in(tx.as_mut(), actor, uid, expected_revision, path)
            .await?;
        tx.commit().await?;
        Ok(after)
    }
    async fn rename_in(
        &self,
        conn: &mut PgConnection,
        actor: &Actor,
        uid: Uuid,
        expected_revision: i64,
        path: &str,
    ) -> Result<Meron> {
        validate_path(path)?;
        let before = load(&mut *conn, uid).await?;
        revision(&before, expected_revision)?;
        if before.lifecycle.state == MeronState::Retired {
            return Err(ValidationError("retired meron is immutable".into()).into());
        }
        let mut new_resource = resource(&before);
        new_resource.path = path.into();
        let decision = self
            .authorize(
                actor,
                Action::Rename,
                vec![resource(&before), new_resource],
                json!({"before":before,"new_path":path}),
            )
            .await?;
        sqlx::query("INSERT INTO mer.identifiers(path,meron_uid) VALUES($1,$2)")
            .bind(path)
            .bind(uid)
            .execute(&mut *conn)
            .await?;
        sqlx::query("UPDATE mer.merons SET path=$2,revision=revision+1,updated_at=clock_timestamp() WHERE uid=$1").bind(uid).bind(path).execute(&mut *conn).await?;
        let after = load(&mut *conn, uid).await?;
        event(
            &mut *conn,
            uid,
            "meron.rename",
            actor,
            &decision,
            json!({"before":before,"after":after}),
        )
        .await?;
        Ok(after)
    }
    pub async fn update(
        &self,
        actor: &Actor,
        uid: Uuid,
        expected_revision: i64,
        proposal: NewMeron,
        evidence: CompatibilityEvidence,
    ) -> Result<Meron> {
        let mut tx = self.write().await?;
        let after = self
            .update_in(
                tx.as_mut(),
                actor,
                uid,
                expected_revision,
                proposal,
                evidence,
            )
            .await?;
        tx.commit().await?;
        Ok(after)
    }
    async fn update_in(
        &self,
        conn: &mut PgConnection,
        actor: &Actor,
        uid: Uuid,
        expected_revision: i64,
        proposal: NewMeron,
        evidence: CompatibilityEvidence,
    ) -> Result<Meron> {
        proposal.validate()?;
        evidence.validate()?;
        let before = load(&mut *conn, uid).await?;
        revision(&before, expected_revision)?;
        if before.lifecycle.state == MeronState::Retired {
            return Err(ValidationError("retired meron is immutable".into()).into());
        }
        if proposal.path != before.identity.path
            || proposal.classification.kind != before.classification.kind
            || proposal.release_mode != before.lifecycle.release_mode
            || proposal.authority_scope != Some(before.authority_scope)
        {
            return Err(ValidationError("update cannot change identity, primary type, release mode or governance binding; use rename for paths".into()).into());
        }
        let (invariants, checked) = conformance(&mut *conn, uid, &proposal).await?;
        // An admitted invariant applies now, so its new version must still pass every meron it covers.
        let mut covered = vec![];
        if before.classification.kind == MeronType::Invariant {
            let old = InvariantSpec::parse(&before.spec)?;
            let new = InvariantSpec::parse(&proposal.spec)?;
            if new.applies_to != old.applies_to {
                return Err(ValidationError(
                    "what an invariant applies to is fixed once created".into(),
                )
                .into());
            }
            if admitted(before.lifecycle.state) {
                let candidate = Meron {
                    spec: proposal.spec.clone(),
                    ..before.clone()
                };
                covered = verify_covered(&mut *conn, &candidate).await?;
            }
        }
        let consumers = consumers(&mut *conn, uid).await?;
        // Everything that reads this meron is checked again against the proposed spec.
        let overrides = HashMap::from([(uid, proposal.spec.clone())]);
        let rechecked = checks::recheck(&mut *conn, &consumers, &overrides).await?;
        let sync = admitted(before.lifecycle.state) && checked.ran();
        let mut resources = vec![resource(&before)];
        if sync {
            resources.extend(checked.references.values().map(resource));
        }
        let action = if evidence.impact == Impact::NonBreaking {
            Action::Update
        } else {
            Action::EvolveBreaking
        };
        let decision=self.authorize(actor,action,resources,json!({"before":before,"proposal":proposal,"compatibility":evidence,"affected_consumers":consumers,"invariants":invariants,"covered":covered,"checks":checked.records,"rechecked":rechecked})).await?;
        sqlx::query("UPDATE mer.merons SET name=$2,subtype=$3,roles=$4,definition=$5,responsibility=$6,metadata=$7,spec=$8,revision=revision+1,updated_at=clock_timestamp() WHERE uid=$1")
            .bind(uid).bind(&proposal.name).bind(&proposal.classification.subtype).bind(json!(proposal.classification.roles)).bind(&proposal.semantics.definition).bind(&proposal.semantics.responsibility).bind(&proposal.metadata).bind(&proposal.spec).execute(&mut *conn).await?;
        let after = load(&mut *conn, uid).await?;
        let dependencies = if sync {
            sync_dependencies(&mut *conn, actor, &decision, uid, &checked.references).await?
        } else {
            Value::Null
        };
        event(&mut *conn,uid,"meron.update",actor,&decision,json!({"before":before,"after":after,"compatibility":evidence,"affected_consumers":consumers,"invariants":invariants,"covered":covered,"checks":checked.records,"rechecked":rechecked,"dependencies":dependencies})).await?;
        Ok(after)
    }
    pub async fn transition(
        &self,
        actor: &Actor,
        uid: Uuid,
        expected_revision: i64,
        state: MeronState,
    ) -> Result<Meron> {
        let mut tx = self.write().await?;
        let after = self
            .transition_in(tx.as_mut(), actor, uid, expected_revision, state, None)
            .await?;
        tx.commit().await?;
        Ok(after)
    }
    /// Moves a meron one lifecycle step, with the reason when there is one (a reinstatement has).
    async fn transition_in(
        &self,
        conn: &mut PgConnection,
        actor: &Actor,
        uid: Uuid,
        expected_revision: i64,
        state: MeronState,
        reason: Option<&str>,
    ) -> Result<Meron> {
        let before = load(&mut *conn, uid).await?;
        revision(&before, expected_revision)?;
        if !before.lifecycle.state.can_transition(state) {
            return Err(ValidationError("invalid meron lifecycle transition".into()).into());
        }
        // Coming back from deprecated, a meron must meet today's invariants, as at registration.
        let reinstating =
            before.lifecycle.state == MeronState::Deprecated && state == MeronState::Active;
        // Proposed merons are drafts; registration is where invariants are enforced.
        let (mut invariants, mut covered) = (vec![], vec![]);
        let mut checked = checks::Outcome::default();
        if before.classification.kind == MeronType::Invariant {
            let invariant = InvariantSpec::parse(&before.spec)?;
            match state {
                MeronState::Registered => covered = verify_covered(&mut *conn, &before).await?,
                MeronState::Active if reinstating => {
                    covered = verify_covered(&mut *conn, &before).await?
                }
                MeronState::Retired
                    if !covered_by(&mut *conn, uid, &invariant).await?.is_empty() =>
                {
                    return Err(ValidationError(
                        "an invariant cannot retire while it covers admitted merons".into(),
                    )
                    .into())
                }
                _ => {}
            }
        } else if state == MeronState::Registered || reinstating {
            let applicable = applicable_invariants(&mut *conn, &before.classification).await?;
            invariants = conform(&before.spec, &applicable)?;
            checked = checks::run(
                &mut *conn,
                uid,
                &before.identity.path,
                &before.spec,
                &applicable,
                &HashMap::new(),
            )
            .await?;
        }
        let mut resources = vec![resource(&before)];
        resources.extend(checked.references.values().map(resource));
        let decision = self.authorize(
            actor,
            Action::Transition,
            resources,
            json!({"before":before,"target_state":state,"invariants":invariants,"covered":covered,"checks":checked.records}),
        ).await?;
        sqlx::query("UPDATE mer.merons SET state=$2,revision=revision+1,updated_at=clock_timestamp() WHERE uid=$1").bind(uid).bind(state.as_str()).execute(&mut *conn).await?;
        let after = load(&mut *conn, uid).await?;
        let dependencies = if checked.ran() {
            sync_dependencies(&mut *conn, actor, &decision, uid, &checked.references).await?
        } else {
            Value::Null
        };
        event(
            &mut *conn,
            uid,
            "meron.transition",
            actor,
            &decision,
            json!({"before":before,"after":after,"invariants":invariants,"covered":covered,"checks":checked.records,"dependencies":dependencies,"reason":reason}),
        )
        .await?;
        Ok(after)
    }
    pub async fn relate(
        &self,
        actor: &Actor,
        source: Uuid,
        predicate: Predicate,
        target: Uuid,
    ) -> Result<Relationship> {
        let mut tx = self.write().await?;
        let r = self
            .relate_in(tx.as_mut(), actor, source, predicate, target)
            .await?;
        tx.commit().await?;
        Ok(r)
    }
    async fn relate_in(
        &self,
        conn: &mut PgConnection,
        actor: &Actor,
        source: Uuid,
        predicate: Predicate,
        target: Uuid,
    ) -> Result<Relationship> {
        let s = load(conn, source).await?;
        let t = load(conn, target).await?;
        validate_relationship(&s, predicate, &t)?;
        let decision = self
            .authorize(
                actor,
                Action::Relate,
                vec![resource(&s), resource(&t)],
                json!({"predicate":predicate}),
            )
            .await?;
        let r:Relationship=sqlx::query_as::<_,RelationshipRow>("INSERT INTO mer.relationships(uid,source,predicate,target) VALUES($1,$2,$3,$4) RETURNING *").bind(Uuid::new_v4()).bind(source).bind(predicate.as_str()).bind(target).fetch_one(&mut *conn).await?.try_into()?;
        event(
            conn,
            source,
            "relationship.add",
            actor,
            &decision,
            json!({"relationship":r}),
        )
        .await?;
        Ok(r)
    }
    pub async fn unrelate(&self, actor: &Actor, uid: Uuid) -> Result<()> {
        let mut tx = self.write().await?;
        let r: Relationship =
            sqlx::query_as::<_, RelationshipRow>("SELECT * FROM mer.relationships WHERE uid=$1")
                .bind(uid)
                .fetch_optional(tx.as_mut())
                .await?
                .ok_or(Error::NotFound)?
                .try_into()?;
        let s = load(tx.as_mut(), r.source).await?;
        let t = load(tx.as_mut(), r.target).await?;
        let decision = self
            .authorize(
                actor,
                Action::Unrelate,
                vec![resource(&s), resource(&t)],
                json!({"relationship":r}),
            )
            .await?;
        sqlx::query("DELETE FROM mer.relationships WHERE uid=$1")
            .bind(uid)
            .execute(tx.as_mut())
            .await?;
        event(
            tx.as_mut(),
            r.source,
            "relationship.remove",
            actor,
            &decision,
            json!({"relationship":r}),
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn plan_release(
        &self,
        actor: &Actor,
        uid: Uuid,
        expected_revision: i64,
        generation: i32,
        version: &str,
        justification: &str,
    ) -> Result<Release> {
        nonblank("generation justification", justification, 8000)?;
        if generation < 1 || semver::Version::parse(version).is_err() || version.len() > 120 {
            return Err(ValidationError(
                "positive generation and semantic version required".into(),
            )
            .into());
        }
        let mut tx = self.write().await?;
        let meron = load(tx.as_mut(), uid).await?;
        revision(&meron, expected_revision)?;
        let decision = self
            .authorize(
                actor,
                Action::Release,
                vec![resource(&meron)],
                json!({"generation":generation,"version":version,"justification":justification}),
            )
            .await?;
        sqlx::query("INSERT INTO mer.generations(meron_uid,generation,justification) VALUES($1,$2,$3) ON CONFLICT(meron_uid,generation) DO NOTHING").bind(uid).bind(generation).bind(justification).execute(tx.as_mut()).await?;
        let r:Release=sqlx::query_as::<_,ReleaseRow>("INSERT INTO mer.releases(uid,meron_uid,generation,version,justification) VALUES($1,$2,$3,$4,$5) RETURNING *")
            .bind(Uuid::new_v4()).bind(uid).bind(generation).bind(version).bind(justification).fetch_one(tx.as_mut()).await?.try_into()?;
        event(
            tx.as_mut(),
            uid,
            "release.plan",
            actor,
            &decision,
            json!({"release":r}),
        )
        .await?;
        tx.commit().await?;
        Ok(r)
    }
    pub async fn transition_release(
        &self,
        actor: &Actor,
        uid: Uuid,
        expected_revision: i64,
        state: ReleaseState,
    ) -> Result<Release> {
        let mut tx = self.write().await?;
        let before: Release =
            sqlx::query_as::<_, ReleaseRow>("SELECT * FROM mer.releases WHERE uid=$1")
                .bind(uid)
                .fetch_optional(tx.as_mut())
                .await?
                .ok_or(Error::NotFound)?
                .try_into()?;
        if before.revision != expected_revision {
            return Err(Error::Conflict {
                expected: expected_revision,
                actual: before.revision,
            });
        }
        if !before.state.can_transition(state) {
            return Err(ValidationError("invalid release transition".into()).into());
        }
        let owner = load(tx.as_mut(), before.meron_uid).await?;
        let decision = self
            .authorize(
                actor,
                Action::TransitionRelease,
                vec![resource(&owner)],
                json!({"release":before,"target_state":state}),
            )
            .await?;
        let after: Release = sqlx::query_as::<_, ReleaseRow>(
            "UPDATE mer.releases SET state=$2,revision=revision+1 WHERE uid=$1 RETURNING *",
        )
        .bind(uid)
        .bind(state.as_str())
        .fetch_one(tx.as_mut())
        .await?
        .try_into()?;
        event(
            tx.as_mut(),
            before.meron_uid,
            "release.transition",
            actor,
            &decision,
            json!({"before":before,"after":after}),
        )
        .await?;
        tx.commit().await?;
        Ok(after)
    }
    /// Nearest structural ancestor owning a stable release. Namespace spelling has no effect.
    pub async fn effective_release(&self, actor: &Actor, uid: Uuid) -> Result<Option<Release>> {
        let snapshot = self.snapshot(actor).await?;
        let mut cursor = uid;
        loop {
            let meron = snapshot
                .merons
                .iter()
                .find(|e| e.identity.uid == cursor)
                .ok_or(Error::NotFound)?;
            if meron.lifecycle.release_mode == ReleaseMode::Independent {
                return Ok(snapshot
                    .releases
                    .iter()
                    .filter(|r| r.meron_uid == cursor && r.state == ReleaseState::Stable)
                    .max_by_key(|r| (r.generation, semver::Version::from_str(&r.version).ok()))
                    .cloned());
            }
            match snapshot
                .relationships
                .iter()
                .find(|r| r.predicate == Predicate::Contains && r.target == cursor)
            {
                Some(r) => cursor = r.source,
                None => return Ok(None),
            }
        }
    }
}
fn resource(e: &Meron) -> Resource {
    Resource {
        uid: e.identity.uid,
        path: e.identity.path.clone(),
        revision: e.revision,
        authority_scope: e.authority_scope,
    }
}
fn revision(e: &Meron, expected: i64) -> Result<()> {
    if e.revision != expected {
        Err(Error::Conflict {
            expected,
            actual: e.revision,
        })
    } else {
        Ok(())
    }
}
async fn load(conn: &mut PgConnection, uid: Uuid) -> Result<Meron> {
    sqlx::query_as::<_, MeronRow>("SELECT * FROM mer.merons WHERE uid=$1")
        .bind(uid)
        .fetch_optional(conn)
        .await?
        .ok_or(Error::NotFound)?
        .try_into()
}
async fn resolve(conn: &mut PgConnection, path: &str) -> Result<Meron> {
    sqlx::query_as::<_, MeronRow>(
        "SELECT e.* FROM mer.merons e JOIN mer.identifiers i ON e.uid=i.meron_uid WHERE i.path=$1",
    )
    .bind(path)
    .fetch_optional(conn)
    .await?
    .ok_or(Error::NotFound)?
    .try_into()
}
async fn event(
    conn: &mut PgConnection,
    uid: Uuid,
    action: &str,
    actor: &Actor,
    decision: &Decision,
    payload: Value,
) -> Result<()> {
    sqlx::query("INSERT INTO mer.events(meron_uid,action,actor,authorization_decision,payload) VALUES($1,$2,$3,$4,$5)").bind(uid).bind(action).bind(&actor.subject).bind(serde_json::to_value(decision)?).bind(payload).execute(conn).await?;
    Ok(())
}
/// Invariants apply once a maintainer admits them, and stop applying when retired.
fn admitted(state: MeronState) -> bool {
    matches!(
        state,
        MeronState::Registered | MeronState::Active | MeronState::Deprecated
    )
}
async fn known_subtype(conn: &mut PgConnection, kind: MeronType, subtype: &str) -> Result<()> {
    let known: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM mer.subtypes WHERE kind=$1 AND name=$2)")
            .bind(kind.as_str())
            .bind(subtype)
            .fetch_one(conn)
            .await?;
    if known {
        Ok(())
    } else {
        Err(ValidationError(format!("unregistered subtype {kind}/{subtype}")).into())
    }
}
/// Invariants checks that need registry state: a registered subtype, and a spec that satisfies its
/// invariants and the named checks they ask for (or, for an invariant, Invariants's built-in invariant
/// rules and only checks this registry can run).
async fn conformance(
    conn: &mut PgConnection,
    uid: Uuid,
    proposal: &NewMeron,
) -> Result<(Vec<RevisionRef>, checks::Outcome)> {
    let classification = &proposal.classification;
    if let Some(subtype) = &classification.subtype {
        known_subtype(conn, classification.kind, subtype).await?;
    }
    if classification.kind == MeronType::Invariant {
        let invariant = InvariantSpec::parse(&proposal.spec)?;
        if let Some(subtype) = &invariant.applies_to.subtype {
            known_subtype(conn, invariant.applies_to.kind, subtype).await?;
        }
        checks::validate(&invariant)?;
        return Ok((vec![], checks::Outcome::default()));
    }
    let applicable = applicable_invariants(conn, classification).await?;
    let invariants = conform(&proposal.spec, &applicable)?;
    let checked = checks::run(
        conn,
        uid,
        &proposal.path,
        &proposal.spec,
        &applicable,
        &HashMap::new(),
    )
    .await?;
    Ok((invariants, checked))
}
async fn applicable_invariants(
    conn: &mut PgConnection,
    classification: &Classification,
) -> Result<Vec<Meron>> {
    let rows = sqlx::query_as::<_, MeronRow>("SELECT * FROM mer.merons WHERE kind='invariant' AND state IN ('registered','active','deprecated') AND spec->'applies_to'->>'type'=$1 ORDER BY path")
        .bind(classification.kind.as_str()).fetch_all(conn).await?;
    let mut invariants = vec![];
    for row in rows {
        let invariant: Meron = row.try_into()?;
        if InvariantSpec::parse(&invariant.spec)?
            .applies_to
            .covers(classification)
        {
            invariants.push(invariant);
        }
    }
    Ok(invariants)
}
/// Admitted merons an invariant covers. Proposed drafts are checked when they are registered.
async fn covered_by(
    conn: &mut PgConnection,
    invariant_uid: Uuid,
    invariant: &InvariantSpec,
) -> Result<Vec<Meron>> {
    sqlx::query_as::<_, MeronRow>("SELECT * FROM mer.merons WHERE kind=$1 AND ($2::text IS NULL OR subtype=$2) AND state IN ('registered','active','deprecated') AND uid<>$3 ORDER BY path")
        .bind(invariant.applies_to.kind.as_str()).bind(&invariant.applies_to.subtype).bind(invariant_uid)
        .fetch_all(conn).await?.into_iter().map(TryInto::try_into).collect()
}
/// An invariant may only take effect, or change, if every meron it covers still passes it,
/// named checks included. `invariant` carries the spec being put into effect.
async fn verify_covered(conn: &mut PgConnection, invariant: &Meron) -> Result<Vec<RevisionRef>> {
    let spec = InvariantSpec::parse(&invariant.spec)?;
    let mut covered = vec![];
    for e in covered_by(conn, invariant.identity.uid, &spec).await? {
        let would_fail = |error: String| -> Error {
            ValidationError(format!(
                "{} (revision {}) would fail this invariant: {error}",
                e.identity.path, e.revision
            ))
            .into()
        };
        spec.check(&e.spec).map_err(|v| would_fail(v.0))?;
        checks::run(
            conn,
            e.identity.uid,
            &e.identity.path,
            &e.spec,
            std::slice::from_ref(invariant),
            &HashMap::new(),
        )
        .await
        .map_err(|error| match error {
            Error::Validation(v) => would_fail(v.0),
            other => other,
        })?;
        covered.push(RevisionRef {
            uid: e.identity.uid,
            revision: e.revision,
        });
    }
    Ok(covered)
}
/// A meron whose named checks read other merons depends on exactly those, so a change to
/// any of them lists it as an affected consumer and checks it again.
async fn sync_dependencies(
    conn: &mut PgConnection,
    actor: &Actor,
    decision: &Decision,
    source: Uuid,
    targets: &BTreeMap<Uuid, Meron>,
) -> Result<Value> {
    if targets.contains_key(&source) {
        return Err(ValidationError("a meron cannot depend on itself".into()).into());
    }
    let existing: Vec<Relationship> = sqlx::query_as::<_, RelationshipRow>(
        "SELECT * FROM mer.relationships WHERE source=$1 AND predicate='depends-on'",
    )
    .bind(source)
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .map(TryInto::try_into)
    .collect::<Result<_>>()?;
    let (mut added, mut removed) = (vec![], vec![]);
    for r in existing.iter().filter(|r| !targets.contains_key(&r.target)) {
        sqlx::query("DELETE FROM mer.relationships WHERE uid=$1")
            .bind(r.uid)
            .execute(&mut *conn)
            .await?;
        event(
            conn,
            source,
            "relationship.remove",
            actor,
            decision,
            json!({"relationship":r}),
        )
        .await?;
        removed.push(r.uid);
    }
    for target in targets
        .keys()
        .filter(|t| !existing.iter().any(|r| r.target == **t))
    {
        let r: Relationship = sqlx::query_as::<_, RelationshipRow>("INSERT INTO mer.relationships(uid,source,predicate,target) VALUES($1,$2,'depends-on',$3) RETURNING *")
            .bind(Uuid::new_v4()).bind(source).bind(target).fetch_one(&mut *conn).await?.try_into()?;
        event(
            conn,
            source,
            "relationship.add",
            actor,
            decision,
            json!({"relationship":r}),
        )
        .await?;
        added.push(r.uid);
    }
    Ok(json!({"added":added,"removed":removed}))
}
async fn consumers(conn: &mut PgConnection, uid: Uuid) -> Result<Vec<Uuid>> {
    Ok(sqlx::query_scalar("WITH RECURSIVE c(uid) AS (SELECT source FROM mer.relationships WHERE target=$1 AND predicate IN ('depends-on','implements') UNION SELECT r.source FROM mer.relationships r JOIN c ON r.target=c.uid WHERE r.predicate IN ('depends-on','implements')) SELECT uid FROM c ORDER BY uid").bind(uid).fetch_all(conn).await?)
}
#[derive(FromRow)]
struct MeronRow {
    uid: Uuid,
    path: String,
    name: String,
    kind: String,
    subtype: Option<String>,
    roles: Value,
    definition: String,
    responsibility: String,
    state: String,
    release_mode: String,
    authority_scope: Uuid,
    metadata: Value,
    spec: Value,
    revision: i64,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}
impl TryFrom<MeronRow> for Meron {
    type Error = Error;
    fn try_from(r: MeronRow) -> Result<Self> {
        Ok(Self {
            identity: Identity {
                uid: r.uid,
                path: r.path,
                name: r.name,
            },
            classification: Classification {
                kind: r.kind.parse()?,
                subtype: r.subtype,
                roles: serde_json::from_value(r.roles)?,
            },
            semantics: Semantics {
                definition: r.definition,
                responsibility: r.responsibility,
            },
            lifecycle: Lifecycle {
                state: r.state.parse()?,
                release_mode: r.release_mode.parse()?,
            },
            authority_scope: r.authority_scope,
            metadata: r.metadata,
            spec: r.spec,
            revision: r.revision,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
    }
}
#[derive(FromRow)]
struct RelationshipRow {
    uid: Uuid,
    source: Uuid,
    predicate: String,
    target: Uuid,
    created_at: DateTime<Utc>,
}
impl TryFrom<RelationshipRow> for Relationship {
    type Error = Error;
    fn try_from(r: RelationshipRow) -> Result<Self> {
        Ok(Self {
            uid: r.uid,
            source: r.source,
            predicate: r.predicate.parse()?,
            target: r.target,
            created_at: r.created_at,
        })
    }
}
#[derive(FromRow)]
struct ReleaseRow {
    uid: Uuid,
    meron_uid: Uuid,
    generation: i32,
    version: String,
    state: String,
    justification: String,
    revision: i64,
    created_at: DateTime<Utc>,
}
impl TryFrom<ReleaseRow> for Release {
    type Error = Error;
    fn try_from(r: ReleaseRow) -> Result<Self> {
        Ok(Self {
            uid: r.uid,
            meron_uid: r.meron_uid,
            generation: r.generation,
            version: r.version,
            state: r.state.parse()?,
            justification: r.justification,
            revision: r.revision,
            created_at: r.created_at,
        })
    }
}
#[derive(FromRow)]
struct EventRow {
    sequence: i64,
    meron_uid: Uuid,
    action: String,
    actor: String,
    authorization_decision: Value,
    payload: Value,
    occurred_at: DateTime<Utc>,
}
