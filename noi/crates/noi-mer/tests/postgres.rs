//! Real PostgreSQL integration test. Creates a disposable database; never resets postgres.
//! Explicit opt-in: NOI_TEST_ADMIN_URL=... cargo test --test postgres -- --ignored
use noi_gov::*;
use noi_inv::*;
use noi_mer::{Change, Error, NewBatch, ProposalState, Registry};
use serde_json::json;
use sqlx::{Connection, Executor, PgConnection};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
use uuid::Uuid;

struct Approval;
impl Authorizer for Approval {
    fn authorize<'a>(&'a self, _: &'a AuthorizationRequest) -> Answer<'a> {
        answer(Decision::ApprovalRequired {
            reference: "approval-test".into(),
            reason: "human review".into(),
        })
    }
}
fn proposal(root: Uuid, path: &str, kind: MeronType) -> NewMeron {
    NewMeron {
        path: path.into(),
        name: "Integration meron".into(),
        classification: Classification {
            kind,
            subtype: None,
            roles: vec![],
        },
        semantics: Semantics {
            definition: "Integration test definition".into(),
            responsibility: "Verify registry invariants".into(),
        },
        release_mode: ReleaseMode::Inherited,
        authority_scope: Some(root),
        metadata: json!({}),
        spec: json!({}),
    }
}
#[tokio::test]
#[ignore = "requires a reachable PostgreSQL admin URL and CREATE DATABASE; see docs/verification.md"]
async fn registry_invariants_on_real_postgres() {
    let admin = std::env::var("NOI_TEST_ADMIN_URL").expect("set NOI_TEST_ADMIN_URL explicitly");
    let name = format!("noi_test_{}", Uuid::new_v4().simple());
    let mut admin_conn = PgConnection::connect(&admin).await.unwrap();
    admin_conn
        .execute(format!("CREATE DATABASE {name}").as_str())
        .await
        .unwrap();
    let mut opts: sqlx::postgres::PgConnectOptions = admin.parse().unwrap();
    opts = opts.database(&name);
    let test_url = sqlx::ConnectOptions::to_url_lossy(&opts).to_string();
    // Catch test panics so even a failed assertion removes the disposable database.
    let task = tokio::spawn(async move {
        verify(&test_url).await;
        verify_governed_workflow(&test_url).await;
        verify_invariants(&test_url).await;
        verify_color_roles(&test_url).await;
        verify_text_styles(&test_url).await;
        verify_spacing(&test_url).await;
        verify_layout(&test_url).await;
        verify_shape(&test_url).await;
        verify_components(&test_url).await;
        verify_review(&test_url).await;
        verify_governance(&test_url).await;
    });
    let result = task.await;
    admin_conn
        .execute(format!("DROP DATABASE {name} WITH (FORCE)").as_str())
        .await
        .unwrap();
    if let Err(e) = result {
        std::panic::resume_unwind(e.into_panic());
    }
}
async fn verify(url: &str) {
    let actor = Actor {
        subject: "test-developer".into(),
    };
    let denied = Registry::connect(url).await.unwrap();
    // Another application may already have a public SQLx ledger on a shared database.
    let mut metadata = PgConnection::connect(url).await.unwrap();
    metadata.execute("CREATE TABLE public._sqlx_migrations(version bigint PRIMARY KEY,description text NOT NULL,installed_on timestamptz NOT NULL DEFAULT now(),success boolean NOT NULL,checksum bytea NOT NULL,execution_time bigint NOT NULL)").await.unwrap();
    metadata.execute("INSERT INTO public._sqlx_migrations(version,description,success,checksum,execution_time) VALUES(42,'other application',true,decode('00','hex'),0)").await.unwrap();
    denied.migrate().await.unwrap();
    denied.migrate().await.unwrap();
    let other_version: i64 = sqlx::query_scalar("SELECT version FROM public._sqlx_migrations")
        .fetch_one(&mut metadata)
        .await
        .unwrap();
    assert_eq!(other_version, 42);
    metadata
        .execute("DROP TABLE public._sqlx_migrations")
        .await
        .unwrap();
    assert!(matches!(
        denied.snapshot(&actor).await,
        Err(Error::Denied(_))
    ));
    // Health and problems (8 Nov) need no authorizer: the database answers, and a failure is kept,
    // newest first, refused when it is not a failure, and never changed by Mero's own login.
    assert!(denied.database_answers().await);
    denied
        .record_problem(
            "req-1",
            "GET",
            "/api/registry",
            503,
            "database: pool timed out",
        )
        .await
        .unwrap();
    denied
        .record_problem(
            "req-2",
            "POST",
            "/api/review/approve",
            500,
            "approval failed",
        )
        .await
        .unwrap();
    let problems = denied.problems(None, 1).await.unwrap();
    assert_eq!(
        (problems.len(), problems[0]["request_id"].as_str()),
        (1, Some("req-2"))
    );
    let older = denied
        .problems(problems[0]["seq"].as_i64(), 10)
        .await
        .unwrap();
    assert_eq!(older[0]["what"], "database: pool timed out");
    assert!(denied
        .record_problem("req-3", "GET", "/", 404, "not a failure")
        .await
        .is_err());
    let registry = denied.clone().with_authorizer(Arc::new(
        LocalDevelopmentGrant::new(actor.subject.clone(), "noi".into()).unwrap(),
    ));
    let first = registry.seed_reference(&actor).await.unwrap();
    assert_eq!(first.merons.len(), 3);
    assert_eq!(first.relationships.len(), 4);
    assert!(first.releases.is_empty());
    assert!(first
        .merons
        .iter()
        .all(|e| e.lifecycle.state == MeronState::Proposed));
    // Upgrade the earlier registry-only public ledger without reapplying schema/data.
    metadata
        .execute("ALTER TABLE mer_migrations._sqlx_migrations SET SCHEMA public")
        .await
        .unwrap();
    metadata.execute("INSERT INTO public._sqlx_migrations(version,description,success,checksum,execution_time) VALUES(42,'other application',true,decode('00','hex'),0)").await.unwrap();
    assert!(matches!(denied.migrate().await, Err(Error::Validation(_))));
    let unmoved: i64 = sqlx::query_scalar("SELECT count(*) FROM public._sqlx_migrations")
        .fetch_one(&mut metadata)
        .await
        .unwrap();
    // Every registry migration (15, the last landing by the files, 18 Nov) plus the other application's row.
    assert_eq!(unmoved, 16);
    metadata
        .execute("DELETE FROM public._sqlx_migrations WHERE version=42")
        .await
        .unwrap();
    denied.migrate().await.unwrap();
    let own_count: i64 = sqlx::query_scalar("SELECT count(*) FROM mer_migrations._sqlx_migrations")
        .fetch_one(&mut metadata)
        .await
        .unwrap();
    assert_eq!(own_count, 15);
    assert_eq!(registry.snapshot(&actor).await.unwrap().merons.len(), 3);
    let root = registry.get(&actor, "noi").await.unwrap();
    let root_uid = root.identity.uid;
    let history = registry.history(&actor, root_uid).await.unwrap();
    let count = history.len();
    registry.seed_reference(&actor).await.unwrap();
    assert_eq!(
        registry.history(&actor, root_uid).await.unwrap().len(),
        count
    );
    let scope = registry.get(&actor, "noi.gov").await.unwrap();
    let inv = registry.get(&actor, "noi.inv").await.unwrap();
    assert!(registry
        .relate(
            &actor,
            inv.identity.uid,
            Predicate::Contains,
            scope.identity.uid
        )
        .await
        .is_err());
    let approval = registry.clone().with_authorizer(Arc::new(Approval));
    assert!(matches!(
        approval
            .propose(
                &actor,
                proposal(root_uid, "noi.tests.approval", MeronType::Token)
            )
            .await,
        Err(Error::ApprovalRequired(_))
    ));
    assert!(registry.get(&actor, "noi.tests.approval").await.is_err());
    assert!(matches!(
        denied
            .propose(
                &actor,
                proposal(root_uid, "noi.tests.denied", MeronType::Token)
            )
            .await,
        Err(Error::Denied(_))
    ));
    assert!(registry.get(&actor, "noi.tests.denied").await.is_err());
    let e = registry
        .propose(
            &actor,
            proposal(root_uid, "noi.tests.original", MeronType::Component),
        )
        .await
        .unwrap();
    assert!(registry
        .propose(
            &actor,
            proposal(root_uid, "noi.tests.original", MeronType::Token)
        )
        .await
        .is_err());
    assert!(registry
        .rename(&actor, e.identity.uid, 99, "noi.tests.renamed")
        .await
        .is_err());
    let renamed = registry
        .rename(&actor, e.identity.uid, 1, "noi.tests.renamed")
        .await
        .unwrap();
    assert_eq!(renamed.identity.uid, e.identity.uid);
    assert_eq!(
        registry
            .get(&actor, "noi.tests.original")
            .await
            .unwrap()
            .identity
            .uid,
        e.identity.uid
    );
    assert!(registry
        .propose(
            &actor,
            proposal(root_uid, "noi.tests.original", MeronType::Token)
        )
        .await
        .is_err());
    let narrow = registry.clone().with_authorizer(Arc::new(
        LocalDevelopmentGrant::new(actor.subject.clone(), "noi.tests.renamed".into()).unwrap(),
    ));
    assert!(narrow.get(&actor, "noi.tests.renamed").await.is_ok());
    assert!(matches!(
        narrow.history(&actor, e.identity.uid).await,
        Err(Error::Denied(_))
    ));
    let b = registry
        .propose(
            &actor,
            proposal(root_uid, "noi.tests.consumer", MeronType::Component),
        )
        .await
        .unwrap();
    let edge = registry
        .relate(
            &actor,
            b.identity.uid,
            Predicate::DependsOn,
            renamed.identity.uid,
        )
        .await
        .unwrap();
    assert!(registry
        .relate(
            &actor,
            renamed.identity.uid,
            Predicate::DependsOn,
            b.identity.uid
        )
        .await
        .is_err());
    assert!(registry
        .relate(&actor, b.identity.uid, Predicate::DependsOn, b.identity.uid)
        .await
        .is_err());
    assert!(registry
        .relate(
            &actor,
            b.identity.uid,
            Predicate::Implements,
            renamed.identity.uid
        )
        .await
        .is_err());
    let mut revised = proposal(root_uid, "noi.tests.renamed", MeronType::Component);
    revised.name = "Updated component".into();
    let evidence = CompatibilityEvidence {
        impact: Impact::Unknown,
        rationale: "Invariant evaluator is not implemented".into(),
        invariant_checks: vec![],
        migration_plan: Some(
            "Inspect the affected component and retain its previous release until reviewed".into(),
        ),
    };
    let updated = registry
        .update(&actor, e.identity.uid, 2, revised.clone(), evidence.clone())
        .await
        .unwrap();
    assert_eq!(updated.revision, 3);
    let history = registry.history(&actor, e.identity.uid).await.unwrap();
    let last = history.last().unwrap();
    assert!(last.payload["affected_consumers"]
        .as_array()
        .unwrap()
        .contains(&json!(b.identity.uid)));
    assert!(registry
        .update(&actor, e.identity.uid, 2, revised, evidence)
        .await
        .is_err());
    assert!(registry
        .transition(&actor, e.identity.uid, 3, MeronState::Active)
        .await
        .is_err());
    registry
        .transition(&actor, e.identity.uid, 3, MeronState::Registered)
        .await
        .unwrap();
    registry
        .transition(&actor, e.identity.uid, 4, MeronState::Active)
        .await
        .unwrap();
    registry
        .transition(&actor, e.identity.uid, 5, MeronState::Deprecated)
        .await
        .unwrap();
    // The one way back (agreed 8 Nov): reinstated to active, then deprecated again.
    registry
        .transition(&actor, e.identity.uid, 6, MeronState::Active)
        .await
        .unwrap();
    registry
        .transition(&actor, e.identity.uid, 7, MeronState::Deprecated)
        .await
        .unwrap();
    assert!(registry
        .transition(&actor, e.identity.uid, 8, MeronState::Retired)
        .await
        .is_err());
    registry.unrelate(&actor, edge.uid).await.unwrap();
    registry
        .transition(&actor, e.identity.uid, 8, MeronState::Retired)
        .await
        .unwrap();
    // Retired stays final.
    assert!(registry
        .transition(&actor, e.identity.uid, 9, MeronState::Active)
        .await
        .is_err());
    assert!(registry
        .relate(&actor, b.identity.uid, Predicate::DependsOn, e.identity.uid)
        .await
        .is_err());
    assert!(registry
        .rename(&actor, e.identity.uid, 9, "noi.tests.retired")
        .await
        .is_err());
    assert!(registry
        .plan_release(&actor, b.identity.uid, 1, 1, "1.0.0", "test")
        .await
        .is_err());
    assert!(registry
        .plan_release(&actor, root_uid, 1, 1, "1.0.0", "test")
        .await
        .is_err());
    let root = registry
        .transition(&actor, root_uid, 1, MeronState::Registered)
        .await
        .unwrap();
    assert!(registry
        .plan_release(&actor, root_uid, 2, 1, "01.0.0", "test")
        .await
        .is_err());
    assert!(registry
        .plan_release(&actor, root_uid, 2, 1, "1.0.0", "")
        .await
        .is_err());
    let release = registry
        .plan_release(
            &actor,
            root_uid,
            2,
            1,
            "1.0.0",
            "Reference architecture lineage for integration verification",
        )
        .await
        .unwrap();
    assert_eq!(release.state, ReleaseState::Planned);
    assert!(registry
        .transition_release(&actor, release.uid, 1, ReleaseState::Stable)
        .await
        .is_err());
    registry
        .transition_release(&actor, release.uid, 1, ReleaseState::Experimental)
        .await
        .unwrap();
    let stable = registry
        .transition_release(&actor, release.uid, 2, ReleaseState::Stable)
        .await
        .unwrap();
    assert_eq!(
        registry
            .effective_release(&actor, scope.identity.uid)
            .await
            .unwrap()
            .unwrap()
            .uid,
        stable.uid
    );
    assert_eq!(
        registry.get(&actor, "noi").await.unwrap().revision,
        root.revision
    );
    assert_eq!(
        registry
            .get(&actor, "noi.gov")
            .await
            .unwrap()
            .lifecycle
            .state,
        MeronState::Proposed
    );
    registry
        .transition_release(&actor, release.uid, 3, ReleaseState::Deprecated)
        .await
        .unwrap();
    assert!(registry
        .effective_release(&actor, scope.identity.uid)
        .await
        .unwrap()
        .is_none());
    // Concurrent conflicting renames cannot overwrite one another.
    let c = registry
        .propose(
            &actor,
            proposal(root_uid, "noi.tests.concurrent", MeronType::Token),
        )
        .await
        .unwrap();
    let (a, b) = tokio::join!(
        registry.rename(&actor, c.identity.uid, 1, "noi.tests.concurrent-a"),
        registry.rename(&actor, c.identity.uid, 1, "noi.tests.concurrent-b")
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    // Real database constraints and runtime-role permissions, not just Rust checks.
    let mut conn = PgConnection::connect(url).await.unwrap();
    assert!(conn
        .execute("UPDATE mer.events SET actor='forged'")
        .await
        .is_err());
    assert!(conn.execute("DELETE FROM mer.identifiers").await.is_err());
    assert!(conn
        .execute("UPDATE mer.merons SET state='active',revision=revision+1 WHERE path='noi.inv'")
        .await
        .is_err());
    conn.execute("GRANT noi_mer_runtime TO CURRENT_USER WITH SET TRUE")
        .await
        .unwrap();
    conn.execute("SET ROLE noi_mer_runtime").await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM mer.merons")
        .fetch_one(&mut conn)
        .await
        .unwrap();
    assert!(count >= 3);
    assert!(conn.execute("TRUNCATE mer.events").await.is_err());
    assert!(conn.execute("DELETE FROM mer.events").await.is_err());
    conn.execute("RESET ROLE").await.unwrap();
    // A transaction failing its event insertion must roll back the meron too.
    conn.execute("CREATE FUNCTION mer.fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected event failure'; END $$").await.unwrap();
    conn.execute("CREATE TRIGGER injected_failure BEFORE INSERT ON mer.events FOR EACH ROW EXECUTE FUNCTION mer.fail_event()").await.unwrap();
    assert!(registry
        .propose(
            &actor,
            proposal(root_uid, "noi.tests.rollback", MeronType::Token)
        )
        .await
        .is_err());
    assert!(registry.get(&actor, "noi.tests.rollback").await.is_err());
    conn.execute("DROP TRIGGER injected_failure ON mer.events")
        .await
        .unwrap();
    registry.snapshot(&actor).await.unwrap();
}

// The entire local handoff workflow uses the real policy adapter and transactions.
async fn verify_governed_workflow(url: &str) {
    let developer = Actor {
        subject: "test-developer".into(),
    };
    let bootstrap = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(developer.subject.clone(), "noi".into()).unwrap(),
        ));
    let root = bootstrap.get(&developer, "noi").await.unwrap();
    let policy = GovernancePolicy {
        id: "GOV-001-workflow".into(),
        revision: 1,
        scopes: vec![Scope {
            uid: root.identity.uid,
            parent: None,
        }],
        grants: vec![
            Grant {
                subject: "design-agent".into(),
                scope: root.identity.uid,
                role: Role::Contributor,
            },
            Grant {
                subject: "maintainer".into(),
                scope: root.identity.uid,
                role: Role::Maintainer,
            },
            Grant {
                subject: "observer".into(),
                scope: root.identity.uid,
                role: Role::Observer,
            },
        ],
    };
    let registry = bootstrap.with_authorizer(Arc::new(ScopedAuthorizer::new(policy).unwrap()));
    let agent = Actor {
        subject: "design-agent".into(),
    };
    let human = Actor {
        subject: "maintainer".into(),
    };
    let observer = Actor {
        subject: "observer".into(),
    };
    let root_uid = root.identity.uid;
    assert!(matches!(
        registry
            .propose(
                &observer,
                proposal(root_uid, "noi.workflow.denied", MeronType::Token)
            )
            .await,
        Err(Error::Denied(_))
    ));
    let token = registry
        .propose(
            &agent,
            proposal(root_uid, "noi.workflow.token", MeronType::Token),
        )
        .await
        .unwrap();
    let button = registry
        .propose(
            &agent,
            proposal(root_uid, "noi.workflow.button", MeronType::Component),
        )
        .await
        .unwrap();
    let initial_events = registry
        .history(&human, token.identity.uid)
        .await
        .unwrap()
        .len();
    assert!(matches!(
        registry
            .transition(&agent, token.identity.uid, 1, MeronState::Registered)
            .await,
        Err(Error::ApprovalRequired(_))
    ));
    assert_eq!(
        registry
            .get(&agent, &token.identity.uid.to_string())
            .await
            .unwrap()
            .revision,
        1
    );
    assert_eq!(
        registry
            .history(&human, token.identity.uid)
            .await
            .unwrap()
            .len(),
        initial_events
    );
    registry
        .transition(&human, token.identity.uid, 1, MeronState::Registered)
        .await
        .unwrap();
    registry
        .transition(&human, token.identity.uid, 2, MeronState::Active)
        .await
        .unwrap();
    assert!(matches!(
        registry
            .relate(
                &agent,
                button.identity.uid,
                Predicate::DependsOn,
                token.identity.uid
            )
            .await,
        Err(Error::ApprovalRequired(_))
    ));
    registry
        .relate(
            &human,
            button.identity.uid,
            Predicate::DependsOn,
            token.identity.uid,
        )
        .await
        .unwrap();
    let mut change = proposal(root_uid, "noi.workflow.token", MeronType::Token);
    change.semantics.definition = "Revised token semantics requiring consumer review".into();
    let evidence = CompatibilityEvidence {
        impact: Impact::Breaking,
        rationale: "Changed semantics may affect the button".into(),
        invariant_checks: vec![],
        migration_plan: Some(
            "Review the dependent button, migrate its use, then roll out the owning release".into(),
        ),
    };
    assert!(matches!(
        registry
            .update(
                &agent,
                token.identity.uid,
                3,
                change.clone(),
                evidence.clone()
            )
            .await,
        Err(Error::ApprovalRequired(_))
    ));
    assert_eq!(
        registry
            .get(&agent, &token.identity.uid.to_string())
            .await
            .unwrap()
            .revision,
        3
    );
    let updated = registry
        .update(
            &human,
            token.identity.uid,
            3,
            change.clone(),
            evidence.clone(),
        )
        .await
        .unwrap();
    assert_eq!(updated.revision, 4);
    assert!(matches!(
        registry
            .update(&human, token.identity.uid, 3, change, evidence)
            .await,
        Err(Error::Conflict { .. })
    ));
    // Caller-supplied 'non-breaking' claims cannot bypass maintainer review either.
    let safe_claim = CompatibilityEvidence {
        impact: Impact::NonBreaking,
        rationale: "Claim only".into(),
        invariant_checks: vec!["Caller supplied check".into()],
        migration_plan: None,
    };
    assert!(matches!(
        registry
            .update(
                &agent,
                token.identity.uid,
                4,
                proposal(root_uid, "noi.workflow.token", MeronType::Token),
                safe_claim
            )
            .await,
        Err(Error::ApprovalRequired(_))
    ));
    assert!(matches!(
        registry
            .plan_release(
                &agent,
                root_uid,
                root.revision,
                2,
                "2.0.0",
                "Candidate lineage"
            )
            .await,
        Err(Error::ApprovalRequired(_))
    ));
    let events = registry.history(&human, token.identity.uid).await.unwrap();
    let last = events.last().unwrap();
    assert_eq!(last.actor, "maintainer");
    assert!(last.payload["affected_consumers"]
        .as_array()
        .unwrap()
        .contains(&json!(button.identity.uid)));
    assert_eq!(
        last.payload["compatibility"]["migration_plan"],
        "Review the dependent button, migrate its use, then roll out the owning release"
    );
    assert_eq!(last.authorization["policies"][0], "GOV-001-workflow@1");
    let snapshot = registry.snapshot(&observer).await.unwrap();
    assert!(snapshot
        .merons
        .iter()
        .any(|e| e.identity.uid == token.identity.uid && e.revision == 4));
    assert!(snapshot
        .relationships
        .iter()
        .any(|r| r.source == button.identity.uid && r.target == token.identity.uid));
}

// Eidos's first token: a color invariant governs lime's spec, and invariant changes cannot strand it.
async fn verify_invariants(url: &str) {
    let actor = Actor {
        subject: "test-developer".into(),
    };
    let registry = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(actor.subject.clone(), "noi".into()).unwrap(),
        ));
    let root_uid = registry.get(&actor, "noi").await.unwrap().identity.uid;
    let mut eio = proposal(root_uid, "noi.eio", MeronType::System);
    eio.classification.subtype = Some("design-system".into());
    eio.release_mode = ReleaseMode::Independent;
    let eio = registry.propose(&actor, eio).await.unwrap();
    let eio_uid = eio.identity.uid;
    let mut colour = proposal(eio_uid, "noi.eio.color.palette.typo", MeronType::Token);
    colour.classification.subtype = Some("colour".into());
    assert!(registry.propose(&actor, colour).await.is_err());

    let color_schema = json!({
        "type":"object","required":["value"],"additionalProperties":false,
        "properties":{"value":{"type":"object","required":["colorSpace","components"],"additionalProperties":false,
            "properties":{"colorSpace":{"const":"oklch"},
                "components":{"type":"array","minItems":3,"maxItems":3,"items":{"type":"number"}},
                "hex":{"type":"string","pattern":"^#[0-9A-Fa-f]{6}$"}}}}});
    let mut invariant = proposal(eio_uid, "noi.eio.inv.color-token", MeronType::Invariant);
    invariant.spec = json!({"applies_to":{"type":"invariant"},"schema":color_schema});
    assert!(registry.propose(&actor, invariant.clone()).await.is_err());
    invariant.spec = json!({"applies_to":{"type":"token","subtype":"color"},"schema":color_schema});
    let invariant_meron = registry.propose(&actor, invariant.clone()).await.unwrap();
    let invariant_uid = invariant_meron.identity.uid;

    let lime_spec =
        json!({"value":{"colorSpace":"oklch","components":[0.896,0.196,119.552],"hex":"#CEEE38"}});
    let mut lime = proposal(eio_uid, "noi.eio.color.palette.lime", MeronType::Token);
    lime.classification.subtype = Some("color".into());
    lime.spec = lime_spec.clone();
    // A proposed invariant does not apply yet, so nothing could check lime's spec.
    assert!(registry.propose(&actor, lime.clone()).await.is_err());
    registry
        .transition(&actor, invariant_uid, 1, MeronState::Registered)
        .await
        .unwrap();
    let mut broken = lime.clone();
    broken.spec = json!({"value":{"colorSpace":"srgb","components":[1,1,1]}});
    assert!(registry.propose(&actor, broken).await.is_err());
    let lime_meron = registry.propose(&actor, lime.clone()).await.unwrap();
    let lime_uid = lime_meron.identity.uid;
    assert_eq!(lime_meron.spec, lime_spec);
    let proposed = registry.history(&actor, lime_uid).await.unwrap();
    assert_eq!(
        proposed[0].payload["invariants"],
        json!([{"uid":invariant_uid,"revision":2}])
    );
    registry
        .transition(&actor, lime_uid, 1, MeronState::Registered)
        .await
        .unwrap();
    registry
        .relate(&actor, eio_uid, Predicate::Contains, lime_uid)
        .await
        .unwrap();

    let evidence = CompatibilityEvidence {
        impact: Impact::Breaking,
        rationale: "Tightened color rules".into(),
        invariant_checks: vec![],
        migration_plan: Some("Add the new field to every color token first".into()),
    };
    // A new version lime would fail is refused, and the invariant keeps its current revision.
    let mut stricter = invariant.clone();
    stricter.spec["schema"]["required"] = json!(["value", "description"]);
    let refused = registry
        .update(&actor, invariant_uid, 2, stricter, evidence.clone())
        .await
        .unwrap_err()
        .to_string();
    assert!(refused.contains("noi.eio.color.palette.lime"), "{refused}");
    assert_eq!(
        registry
            .get(&actor, "noi.eio.inv.color-token")
            .await
            .unwrap()
            .revision,
        2
    );
    let mut moved = invariant.clone();
    moved.spec["applies_to"]["subtype"] = json!(null);
    assert!(registry
        .update(&actor, invariant_uid, 2, moved, evidence.clone())
        .await
        .is_err());
    // A version lime passes is accepted, and history names lime as checked.
    let mut hex_required = invariant.clone();
    hex_required.spec["schema"]["properties"]["value"]["required"] =
        json!(["colorSpace", "components", "hex"]);
    let updated = registry
        .update(&actor, invariant_uid, 2, hex_required, evidence)
        .await
        .unwrap();
    assert_eq!(updated.revision, 3);
    let last = registry.history(&actor, invariant_uid).await.unwrap();
    assert_eq!(
        last.last().unwrap().payload["covered"],
        json!([{"uid":lime_uid,"revision":2}])
    );
    registry
        .transition(&actor, invariant_uid, 3, MeronState::Active)
        .await
        .unwrap();
    registry
        .transition(&actor, invariant_uid, 4, MeronState::Deprecated)
        .await
        .unwrap();
    assert!(registry
        .transition(&actor, invariant_uid, 5, MeronState::Retired)
        .await
        .is_err());
}

// Eidos color roles: values must be usable palette colors, declared pairs must be readable, roles
// depend on what they read, and a change that would make a role unreadable is refused.
async fn verify_color_roles(url: &str) {
    const P: &str = "noi.eio.color.palette.";
    const R: &str = "noi.eio.color.";
    let actor = Actor {
        subject: "test-developer".into(),
    };
    let registry = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(actor.subject.clone(), "noi".into()).unwrap(),
        ));
    let eio_uid = registry.get(&actor, "noi.eio").await.unwrap().identity.uid;
    let token = |path: String, subtype: &str, spec: serde_json::Value| {
        let mut p = proposal(eio_uid, &path, MeronType::Token);
        p.classification.subtype = Some(subtype.into());
        p.spec = spec;
        p
    };
    let grey =
        |l: f64, hex: &str| json!({"value":{"colorSpace":"oklch","components":[l,0,0],"hex":hex}});
    let refs = |light: &str, dark: &str| json!({"light":{"ref":format!("{P}{light}")},"dark":{"ref":format!("{P}{dark}")}});
    let mut ids = HashMap::new();
    for (name, l, hex) in [("white", 1.0, "#FFFFFF"), ("neutral-950", 0.145, "#0A0A0A")] {
        let e = registry
            .propose(&actor, token(format!("{P}{name}"), "color", grey(l, hex)))
            .await
            .unwrap();
        registry
            .transition(&actor, e.identity.uid, 1, MeronState::Registered)
            .await
            .unwrap();
        ids.insert(name, e.identity.uid);
    }
    // A draft palette color cannot be relied on yet.
    registry
        .propose(
            &actor,
            token(format!("{P}neutral-400"), "color", grey(0.708, "#A1A1A1")),
        )
        .await
        .unwrap();

    let mut invariant = proposal(eio_uid, "noi.eio.inv.color-role", MeronType::Invariant);
    invariant.spec = json!({"applies_to":{"type":"token","subtype":"color-role"},
        "schema":{"type":"object","required":["light","dark"]},"checks":[{"name":"eio.unknown"}]});
    assert!(registry.propose(&actor, invariant.clone()).await.is_err());
    invariant.spec["checks"] =
        json!([{"name":"eio.color-role","params":{"minimums":{"text":4.5,"ui":3}}}]);
    let invariant_uid = registry
        .propose(&actor, invariant.clone())
        .await
        .unwrap()
        .identity
        .uid;
    registry
        .transition(&actor, invariant_uid, 1, MeronState::Registered)
        .await
        .unwrap();

    let page = registry
        .propose(
            &actor,
            token(
                format!("{R}surface.page"),
                "color-role",
                refs("white", "neutral-950"),
            ),
        )
        .await
        .unwrap()
        .identity
        .uid;
    registry
        .transition(&actor, page, 1, MeronState::Registered)
        .await
        .unwrap();
    let depends_on = |snapshot: &Snapshot, uid: Uuid| -> HashSet<Uuid> {
        snapshot
            .relationships
            .iter()
            .filter(|r| r.source == uid && r.predicate == Predicate::DependsOn)
            .map(|r| r.target)
            .collect()
    };
    let snapshot = registry.snapshot(&actor).await.unwrap();
    assert_eq!(
        depends_on(&snapshot, page),
        HashSet::from([ids["white"], ids["neutral-950"]])
    );

    let draft = registry
        .propose(
            &actor,
            token(
                format!("{R}text.faint"),
                "color-role",
                refs("neutral-400", "neutral-950"),
            ),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(
        draft.contains("neutral-400 is not a usable palette color"),
        "{draft}"
    );
    let mut lime_text = refs("lime", "lime");
    lime_text["contrast"] = json!([{"against":format!("{R}surface.page"),"kind":"text"}]);
    let unreadable = registry
        .propose(
            &actor,
            token(format!("{R}text.brand"), "color-role", lime_text),
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(
        unreadable.contains("light: 1.32 : 1") && !unreadable.contains("dark:"),
        "{unreadable}"
    );
    let hover = json!({"light":{"mix":{"color":format!("{P}lime"),"percent":14,"over":format!("{P}white")}},
        "dark":{"mix":{"color":format!("{P}lime"),"percent":14,"over":format!("{P}neutral-950")}}});
    registry
        .propose(
            &actor,
            token(format!("{R}state.hover"), "color-role", hover),
        )
        .await
        .unwrap();

    let mut primary_spec = refs("neutral-950", "white");
    primary_spec["contrast"] = json!([{"against":format!("{R}surface.page"),"kind":"text"}]);
    let primary = token(format!("{R}text.primary"), "color-role", primary_spec);
    let primary_uid = registry
        .propose(&actor, primary.clone())
        .await
        .unwrap()
        .identity
        .uid;
    registry
        .transition(&actor, primary_uid, 1, MeronState::Registered)
        .await
        .unwrap();
    let snapshot = registry.snapshot(&actor).await.unwrap();
    assert_eq!(
        depends_on(&snapshot, primary_uid),
        HashSet::from([ids["white"], ids["neutral-950"], page])
    );
    let history = registry.history(&actor, primary_uid).await.unwrap();
    let registered = history
        .iter()
        .find(|e| e.action == "meron.transition")
        .unwrap();
    assert_eq!(
        registered.payload["checks"][0]["invariant"],
        json!({"uid":invariant_uid,"revision":2})
    );
    assert_eq!(
        registered.payload["checks"][0]["read"]
            .as_array()
            .unwrap()
            .len(),
        3
    );

    let evidence = CompatibilityEvidence {
        impact: Impact::Breaking,
        rationale: "Color change".into(),
        invariant_checks: vec![],
        migration_plan: Some("Move dependent roles first".into()),
    };
    // A lighter ink would leave primary text unreadable on white, so it is refused.
    let lighter = token(format!("{P}neutral-950"), "color", grey(0.7, "#A1A1A1"));
    let refused = registry
        .update(&actor, ids["neutral-950"], 2, lighter, evidence.clone())
        .await
        .unwrap_err()
        .to_string();
    assert!(
        refused.contains("noi.eio.color.text.primary would fail"),
        "{refused}"
    );
    // So is a stricter minimum that primary text (19.8 : 1) cannot meet.
    let mut stricter = invariant.clone();
    stricter.spec["checks"][0]["params"]["minimums"]["text"] = json!(20);
    let refused = registry
        .update(&actor, invariant_uid, 2, stricter, evidence.clone())
        .await
        .unwrap_err()
        .to_string();
    assert!(refused.contains("noi.eio.color.text.primary"), "{refused}");
    // A role's links follow its references when it changes.
    let mut no_pairs = primary.clone();
    no_pairs.spec = refs("neutral-950", "white");
    no_pairs.authority_scope = Some(eio_uid);
    registry
        .update(&actor, primary_uid, 2, no_pairs, evidence)
        .await
        .unwrap();
    let snapshot = registry.snapshot(&actor).await.unwrap();
    assert_eq!(
        depends_on(&snapshot, primary_uid),
        HashSet::from([ids["white"], ids["neutral-950"]])
    );
    // A palette color in use cannot retire.
    for (revision, state) in [(2, MeronState::Active), (3, MeronState::Deprecated)] {
        registry
            .transition(&actor, ids["white"], revision, state)
            .await
            .unwrap();
    }
    assert!(registry
        .transition(&actor, ids["white"], 4, MeronState::Retired)
        .await
        .is_err());
}

async fn verify_text_styles(url: &str) {
    const F: &str = "noi.eio.type.font.";
    const S: &str = "noi.eio.type.size.";
    const T: &str = "noi.eio.type.style.";
    let actor = Actor {
        subject: "test-developer".into(),
    };
    let registry = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(actor.subject.clone(), "noi".into()).unwrap(),
        ));
    let eio_uid = registry.get(&actor, "noi.eio").await.unwrap().identity.uid;
    // The real proposal files, moved into this database's Eidos.
    let file = |name: &str| -> NewMeron {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/eio")
            .join(name);
        let mut e: NewMeron =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        e.authority_scope = Some(eio_uid);
        e
    };
    let register = |e: NewMeron| {
        let registry = &registry;
        let actor = &actor;
        async move {
            let uid = registry.propose(actor, e).await.unwrap().identity.uid;
            registry
                .transition(actor, uid, 1, MeronState::Registered)
                .await
                .unwrap();
            uid
        }
    };
    let mut ids = HashMap::new();
    for name in ["font-family", "font-size", "text-style"] {
        ids.insert(
            name.to_string(),
            register(file(&format!("{name}-invariant.json"))).await,
        );
    }
    for name in ["yatra-one", "tenor-sans", "geist", "geist-mono"] {
        ids.insert(
            name.to_string(),
            register(file(&format!("type/fonts/{name}.json"))).await,
        );
    }
    // The 20 px step is still a draft, so nothing can rely on it yet.
    for px in [12, 16, 30, 36, 48] {
        ids.insert(
            format!("px{px}"),
            register(file(&format!("type/sizes/px{px}.json"))).await,
        );
    }
    let px20 = registry
        .propose(&actor, file("type/sizes/px20.json"))
        .await
        .unwrap()
        .identity
        .uid;
    let refused = |e: NewMeron| {
        let registry = &registry;
        let actor = &actor;
        async move { registry.propose(actor, e).await.unwrap_err().to_string() }
    };

    let mut tight = file("type/styles/hero.json");
    tight.spec["lineHeight"] = json!(48);
    let error = refused(tight).await;
    assert!(
        error.contains("it can show Devanagari, so line height must be at least 1.25 × size (60 px), not 48 px"),
        "{error}"
    );
    let mut tight_title = file("type/styles/title.json");
    tight_title.spec["lineHeight"] = json!(36);
    let error = refused(tight_title).await;
    assert!(error.contains("(37.5 px), not 36 px"), "{error}");
    let mut bold = file("type/styles/display.json");
    bold.spec["weight"] = json!(700);
    let error = refused(bold).await;
    assert!(
        error.contains("Yatra One has no 700 weight (it has 400)"),
        "{error}"
    );
    let mut small_tenor = file("type/styles/title.json");
    small_tenor.spec["size"] = json!(format!("{S}px16"));
    small_tenor.spec["lineHeight"] = json!(24);
    let error = refused(small_tenor).await;
    assert!(
        error.contains("Tenor Sans is only set at 24 px and up, not 16 px"),
        "{error}"
    );
    let mut cramped = file("type/styles/body.json");
    cramped.spec["lineHeight"] = json!(20);
    let error = refused(cramped).await;
    assert!(
        error.contains("reading text needs line height at least 1.5 × size (24 px), not 20 px"),
        "{error}"
    );
    let error = refused(file("type/styles/heading.json")).await;
    assert!(
        error.contains(&format!("{S}px20 is not a usable size step")),
        "{error}"
    );

    registry
        .transition(&actor, px20, 1, MeronState::Registered)
        .await
        .unwrap();
    let mut styles = HashMap::new();
    for name in [
        "hero", "display", "title", "heading", "label", "body", "caption", "mono",
    ] {
        styles.insert(
            name,
            register(file(&format!("type/styles/{name}.json"))).await,
        );
    }
    let depends_on = |snapshot: &Snapshot, uid: Uuid| -> HashSet<Uuid> {
        snapshot
            .relationships
            .iter()
            .filter(|r| r.source == uid && r.predicate == Predicate::DependsOn)
            .map(|r| r.target)
            .collect()
    };
    let snapshot = registry.snapshot(&actor).await.unwrap();
    assert_eq!(
        depends_on(&snapshot, styles["heading"]),
        HashSet::from([ids["geist"], ids["yatra-one"], px20])
    );
    assert_eq!(
        depends_on(&snapshot, styles["label"]),
        HashSet::from([ids["geist-mono"], ids["px12"]])
    );
    let history = registry.history(&actor, styles["heading"]).await.unwrap();
    let registered = history
        .iter()
        .find(|e| e.action == "meron.transition")
        .unwrap();
    assert_eq!(registered.payload["checks"][0]["check"], "eio.text-style");
    assert_eq!(
        registered.payload["checks"][0]["invariant"],
        json!({"uid":ids["text-style"],"revision":2})
    );
    assert_eq!(
        registered.payload["checks"][0]["read"]
            .as_array()
            .unwrap()
            .len(),
        3
    );

    let evidence = CompatibilityEvidence {
        impact: Impact::Breaking,
        rationale: "Typography change".into(),
        invariant_checks: vec![],
        migration_plan: Some("Move dependent styles first".into()),
    };
    // Geist without its 600 weight would leave card headings faking bold, so it is refused.
    let mut thinner = file("type/fonts/geist.json");
    thinner.spec["weights"] = json!([100, 200, 300, 400, 500, 700, 800, 900]);
    let error = registry
        .update(&actor, ids["geist"], 2, thinner, evidence.clone())
        .await
        .unwrap_err()
        .to_string();
    assert!(
        error.contains(&format!("{T}heading would fail"))
            && error.contains("Geist has no 600 weight"),
        "{error}"
    );
    // So is a stricter Devanagari minimum that display (48 px lines) and hero (60 px) cannot meet.
    let mut stricter = file("text-style-invariant.json");
    stricter.spec["checks"][0]["params"]["minimums"]["devanagariLineHeight"] = json!(1.5);
    let error = registry
        .update(&actor, ids["text-style"], 2, stricter, evidence.clone())
        .await
        .unwrap_err()
        .to_string();
    assert!(
        error.contains(&format!(
            "{T}display (revision 2) would fail this invariant"
        )) && error.contains("at least 1.5 × size (54 px), not 48 px"),
        "{error}"
    );
    // A font a style no longer reads loses the link: the title drops its Devanagari fallback.
    let mut latin_title = file("type/styles/title.json");
    latin_title.spec.as_object_mut().unwrap().remove("fallback");
    latin_title.spec["lineHeight"] = json!(36);
    registry
        .update(&actor, styles["title"], 2, latin_title, evidence)
        .await
        .unwrap();
    let snapshot = registry.snapshot(&actor).await.unwrap();
    assert_eq!(
        depends_on(&snapshot, styles["title"]),
        HashSet::from([ids["tenor-sans"], ids["px30"]])
    );
    // A size step in use cannot retire.
    for (revision, state) in [(2, MeronState::Active), (3, MeronState::Deprecated)] {
        registry
            .transition(&actor, ids["px48"], revision, state)
            .await
            .unwrap();
    }
    assert!(registry
        .transition(&actor, ids["px48"], 4, MeronState::Retired)
        .await
        .is_err());
    assert!(!snapshot
        .merons
        .iter()
        .any(|e| e.identity.path.starts_with(F) && e.lifecycle.state != MeronState::Registered));
}

async fn verify_spacing(url: &str) {
    const SC: &str = "noi.eio.space.scale.";
    const SP: &str = "noi.eio.space.";
    let actor = Actor {
        subject: "test-developer".into(),
    };
    let registry = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(actor.subject.clone(), "noi".into()).unwrap(),
        ));
    let eio_uid = registry.get(&actor, "noi.eio").await.unwrap().identity.uid;
    let file = |name: &str| -> NewMeron {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/eio")
            .join(name);
        let mut e: NewMeron =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        e.authority_scope = Some(eio_uid);
        e
    };
    let register = |e: NewMeron| {
        let registry = &registry;
        let actor = &actor;
        async move {
            let uid = registry.propose(actor, e).await.unwrap().identity.uid;
            registry
                .transition(actor, uid, 1, MeronState::Registered)
                .await
                .unwrap();
            uid
        }
    };
    let refused = |e: NewMeron| {
        let registry = &registry;
        let actor = &actor;
        async move { registry.propose(actor, e).await.unwrap_err().to_string() }
    };

    // An invariant naming the reference check must say which field and which kind of token.
    let mut vague = file("space-role-invariant.json");
    vague.spec["checks"][0]["params"] = json!({"field":"ref"});
    let error = refused(vague).await;
    assert!(
        error.contains("invalid eio.reference parameters"),
        "{error}"
    );
    let mut ids = HashMap::new();
    for name in ["space", "space-role", "size"] {
        ids.insert(
            name.to_string(),
            register(file(&format!("{name}-invariant.json"))).await,
        );
    }
    for px in [8, 16, 24] {
        ids.insert(
            format!("px{px}"),
            register(file(&format!("space/scale/px{px}.json"))).await,
        );
    }
    // The 48 px step is still a draft.
    let px48 = registry
        .propose(&actor, file("space/scale/px48.json"))
        .await
        .unwrap()
        .identity
        .uid;
    for name in [
        "control.default",
        "control.large",
        "target.minimum",
        "icon.small",
        "icon.default",
        "icon.large",
    ] {
        ids.insert(
            name.to_string(),
            register(file(&format!("size/{name}.json"))).await,
        );
    }

    let error = refused(file("space/roles/gap.section.json")).await;
    assert!(
        error.contains(&format!("{SC}px48 is not a usable space token")),
        "{error}"
    );
    let mut unknown = file("space/roles/gap.stack.json");
    unknown.spec["ref"] = json!(format!("{SC}px12"));
    let error = refused(unknown).await;
    assert!(
        error.contains(&format!("{SC}px12 is not a usable space token")),
        "{error}"
    );
    // A role holds a reference, never a raw value; a step and a size stay on the grid.
    let mut raw = file("space/roles/gap.stack.json");
    raw.spec = json!({"px": 16});
    refused(raw).await;
    let mut off_scale = file("space/scale/px8.json");
    off_scale.path = format!("{SC}px20");
    off_scale.spec = json!({"px": 20});
    refused(off_scale).await;
    let mut off_grid = file("size/icon.small.json");
    off_grid.path = "noi.eio.size.icon.odd".into();
    off_grid.spec = json!({"px": 18});
    let error = refused(off_grid).await;
    assert!(error.contains("multiple of 4"), "{error}");
    // Text sits on the grid too.
    let mut loose = file("type/styles/body.json");
    loose.path = "noi.eio.type.style.loose".into();
    loose.spec["lineHeight"] = json!(26);
    let error = refused(loose).await;
    assert!(error.contains("multiple of 4"), "{error}");

    registry
        .transition(&actor, px48, 1, MeronState::Registered)
        .await
        .unwrap();
    let mut roles = HashMap::new();
    for name in [
        "gap.inline",
        "gap.stack",
        "gap.group",
        "gap.section",
        "inset.control",
        "inset.card",
    ] {
        roles.insert(
            name,
            register(file(&format!("space/roles/{name}.json"))).await,
        );
    }
    let depends_on = |snapshot: &Snapshot, uid: Uuid| -> HashSet<Uuid> {
        snapshot
            .relationships
            .iter()
            .filter(|r| r.source == uid && r.predicate == Predicate::DependsOn)
            .map(|r| r.target)
            .collect()
    };
    let snapshot = registry.snapshot(&actor).await.unwrap();
    assert_eq!(
        depends_on(&snapshot, roles["gap.section"]),
        HashSet::from([px48])
    );
    assert_eq!(
        depends_on(&snapshot, roles["inset.card"]),
        HashSet::from([ids["px24"]])
    );
    let history = registry.history(&actor, roles["gap.stack"]).await.unwrap();
    let registered = history
        .iter()
        .find(|e| e.action == "meron.transition")
        .unwrap();
    assert_eq!(registered.payload["checks"][0]["check"], "eio.reference");
    assert_eq!(
        registered.payload["checks"][0]["invariant"],
        json!({"uid":ids["space-role"],"revision":2})
    );
    assert_eq!(
        registered.payload["checks"][0]["read"],
        json!([{"uid":ids["px16"],"revision":2}])
    );

    // A role's link follows its reference when it changes.
    let evidence = CompatibilityEvidence {
        impact: Impact::Breaking,
        rationale: "Spacing change".into(),
        invariant_checks: vec![],
        migration_plan: Some("Move dependent layouts first".into()),
    };
    let mut tighter = file("space/roles/gap.stack.json");
    tighter.spec["ref"] = json!(format!("{SC}px8"));
    registry
        .update(&actor, roles["gap.stack"], 2, tighter, evidence)
        .await
        .unwrap();
    let snapshot = registry.snapshot(&actor).await.unwrap();
    assert_eq!(
        depends_on(&snapshot, roles["gap.stack"]),
        HashSet::from([ids["px8"]])
    );
    // A step in use cannot retire.
    for (revision, state) in [(2, MeronState::Active), (3, MeronState::Deprecated)] {
        registry
            .transition(&actor, ids["px24"], revision, state)
            .await
            .unwrap();
    }
    assert!(registry
        .transition(&actor, ids["px24"], 4, MeronState::Retired)
        .await
        .is_err());
    assert!(snapshot
        .merons
        .iter()
        .filter(|e| e.identity.path.starts_with(SP))
        .all(|e| e.lifecycle.state == MeronState::Registered));
}

async fn verify_layout(url: &str) {
    const SC: &str = "noi.eio.space.scale.";
    let actor = Actor {
        subject: "test-developer".into(),
    };
    let registry = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(actor.subject.clone(), "noi".into()).unwrap(),
        ));
    let eio_uid = registry.get(&actor, "noi.eio").await.unwrap().identity.uid;
    let file = |name: &str| -> NewMeron {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/eio")
            .join(name);
        let mut e: NewMeron =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        e.authority_scope = Some(eio_uid);
        e
    };
    let register = |e: NewMeron| {
        let registry = &registry;
        let actor = &actor;
        async move {
            let uid = registry.propose(actor, e).await.unwrap().identity.uid;
            registry
                .transition(actor, uid, 1, MeronState::Registered)
                .await
                .unwrap();
            uid
        }
    };
    let refused = |e: NewMeron| {
        let registry = &registry;
        let actor = &actor;
        async move { registry.propose(actor, e).await.unwrap_err().to_string() }
    };
    let uid = |path: &str| {
        let registry = &registry;
        let actor = &actor;
        let path = path.to_string();
        async move { registry.get(actor, &path).await.unwrap().identity.uid }
    };

    register(file("window-invariant.json")).await;
    // Three window classes only, and at most two panes.
    let mut fourth = file("layout/window/expanded.json");
    fourth.path = "noi.eio.layout.window.large".into();
    fourth.spec["minWidth"] = json!(1200);
    refused(fourth).await;
    let mut crowded = file("layout/window/expanded.json");
    crowded.path = "noi.eio.layout.window.wide".into();
    crowded.spec["panes"] = json!(3);
    refused(crowded).await;
    for name in ["compact", "medium", "expanded"] {
        register(file(&format!("layout/window/{name}.json"))).await;
    }
    // Content widths are sizes, on the grid.
    for name in ["width.reading", "width.page"] {
        register(file(&format!("size/{name}.json"))).await;
    }
    let mut off_grid = file("size/width.page.json");
    off_grid.path = "noi.eio.size.width.odd".into();
    off_grid.spec = json!({"px": 1210});
    let error = refused(off_grid).await;
    assert!(error.contains("multiple of 4"), "{error}");
    // Margins and the pane gap are spacing roles on existing steps.
    let mut roles = HashMap::new();
    for name in [
        "margin.compact",
        "margin.medium",
        "margin.expanded",
        "gap.pane",
    ] {
        roles.insert(
            name,
            register(file(&format!("space/roles/{name}.json"))).await,
        );
    }
    let snapshot = registry.snapshot(&actor).await.unwrap();
    let depends_on = |uid: Uuid| -> HashSet<Uuid> {
        snapshot
            .relationships
            .iter()
            .filter(|r| r.source == uid && r.predicate == Predicate::DependsOn)
            .map(|r| r.target)
            .collect()
    };
    let (px16, px24) = (
        uid(&format!("{SC}px16")).await,
        uid(&format!("{SC}px24")).await,
    );
    assert_eq!(depends_on(roles["margin.compact"]), HashSet::from([px16]));
    assert_eq!(depends_on(roles["gap.pane"]), HashSet::from([px24]));
    // The raised size limit cannot be lowered again while the content widths need it.
    let size_invariant = registry.get(&actor, "noi.eio.inv.size").await.unwrap();
    let mut lowered = file("size-invariant.json");
    lowered.spec["schema"]["properties"]["px"]["maximum"] = json!(96);
    let error = registry
        .update(
            &actor,
            size_invariant.identity.uid,
            size_invariant.revision,
            lowered,
            CompatibilityEvidence {
                impact: Impact::Breaking,
                rationale: "Lower the size limit".into(),
                invariant_checks: vec![],
                migration_plan: Some("Remove the content widths first".into()),
            },
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(
        error.contains("noi.eio.size.width.page (revision 2) would fail this invariant"),
        "{error}"
    );
}

async fn verify_shape(url: &str) {
    let actor = Actor {
        subject: "test-developer".into(),
    };
    let registry = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(actor.subject.clone(), "noi".into()).unwrap(),
        ));
    let eio_uid = registry.get(&actor, "noi.eio").await.unwrap().identity.uid;
    let file = |name: &str| -> NewMeron {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/eio")
            .join(name);
        let mut e: NewMeron =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        e.authority_scope = Some(eio_uid);
        e
    };
    let register = |e: NewMeron| {
        let registry = &registry;
        let actor = &actor;
        async move {
            let uid = registry.propose(actor, e).await.unwrap().identity.uid;
            registry
                .transition(actor, uid, 1, MeronState::Registered)
                .await
                .unwrap();
            uid
        }
    };
    let refused = |e: NewMeron| {
        let registry = &registry;
        let actor = &actor;
        async move { registry.propose(actor, e).await.unwrap_err().to_string() }
    };

    let radius_invariant = register(file("radius-invariant.json")).await;
    register(file("border-width-invariant.json")).await;
    // A corner off the scale, a corner that is both a number and fully round, a third border width.
    let mut odd = file("radius/card.json");
    odd.path = "noi.eio.radius.odd".into();
    odd.spec = json!({"px": 10});
    refused(odd).await;
    let mut both = file("radius/button.json");
    both.path = "noi.eio.radius.both".into();
    both.spec = json!({"px": 16, "full": true});
    refused(both).await;
    let mut thick = file("border/width.focus.json");
    thick.path = "noi.eio.border.width.thick".into();
    thick.spec = json!({"px": 3});
    refused(thick).await;
    for name in ["button", "pill", "field", "card"] {
        register(file(&format!("radius/{name}.json"))).await;
    }
    for name in ["default", "focus"] {
        register(file(&format!("border/width.{name}.json"))).await;
    }
    // Taking 16 off the scale is refused while fields and cards use it.
    let mut narrower = file("radius-invariant.json");
    narrower.spec["schema"]["properties"]["px"]["enum"] = json!([0, 4, 8, 12, 24]);
    let error = registry
        .update(
            &actor,
            radius_invariant,
            2,
            narrower,
            CompatibilityEvidence {
                impact: Impact::Breaking,
                rationale: "Narrow the corner scale".into(),
                invariant_checks: vec![],
                migration_plan: Some("Move fields and cards first".into()),
            },
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(
        error.contains("noi.eio.radius.card (revision 2) would fail this invariant"),
        "{error}"
    );
    let snapshot = registry.snapshot(&actor).await.unwrap();
    let shapes: Vec<_> = snapshot
        .merons
        .iter()
        .filter(|e| {
            e.identity.path.starts_with("noi.eio.radius.")
                || e.identity.path.starts_with("noi.eio.border.")
        })
        .collect();
    assert_eq!(shapes.len(), 6);
    assert!(shapes
        .iter()
        .all(|e| e.lifecycle.state == MeronState::Registered));
}

/// Components in Mero (agreed 17 Nov): a component's meron holds its contract and fingerprints;
/// Mero links it to the values it reads and the components it uses, and refuses a file another
/// component already lists.
async fn verify_components(url: &str) {
    const C: &str = "noi.eio.components.";
    let actor = Actor {
        subject: "test-developer".into(),
    };
    let registry = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(actor.subject.clone(), "noi".into()).unwrap(),
        ));
    let eio_uid = registry.get(&actor, "noi.eio").await.unwrap().identity.uid;
    let uid_of = |path: &'static str| {
        let registry = &registry;
        let actor = &actor;
        async move {
            let e = registry.get(actor, path).await.unwrap();
            assert_eq!(e.lifecycle.state, MeronState::Registered, "{path}");
            e.identity.uid
        }
    };
    let icon_small = uid_of("noi.eio.size.icon.small").await;
    let gap_inline = uid_of("noi.eio.space.gap.inline").await;
    let file = |name: &str| -> NewMeron {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/eio")
            .join(name);
        let mut e: NewMeron =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        e.authority_scope = Some(eio_uid);
        e
    };
    let fingerprint = |c: char| c.to_string().repeat(64);
    let component = |name: &str, package: &str, reads: &[&str], uses: &[&str], files: &[&str]| {
        let mut e = proposal(eio_uid, &format!("{C}{name}"), MeronType::Component);
        e.spec = json!({
            "package": package,
            "part": "component",
            "job": "A test component.",
            "states": {"look": {"plain": "as it is"}},
            "reads": reads,
            "uses": uses.iter().map(|u| format!("{C}{u}")).collect::<Vec<_>>(),
            "files": files.iter().map(|f| json!({"path": f, "sha256": fingerprint('a')})).collect::<Vec<_>>(),
        });
        e
    };
    let register = |e: NewMeron| {
        let registry = &registry;
        let actor = &actor;
        async move {
            let uid = registry.propose(actor, e).await.unwrap().identity.uid;
            registry
                .transition(actor, uid, 1, MeronState::Registered)
                .await
                .unwrap();
            uid
        }
    };
    let refused = |e: NewMeron| {
        let registry = &registry;
        let actor = &actor;
        async move { registry.propose(actor, e).await.unwrap_err().to_string() }
    };

    // The invariant must say where components live.
    let mut vague = file("component-invariant.json");
    vague.spec["checks"][0]["params"] = json!({});
    let error = refused(vague).await;
    assert!(
        error.contains("invalid eio.component parameters"),
        "{error}"
    );
    let invariant = register(file("component-invariant.json")).await;

    const R: &str = "@noi/eio-react";
    let icon = register(component(
        "icon",
        R,
        &["noi.eio.size.icon.small"],
        &[],
        &["src/Icon/Icon.tsx"],
    ))
    .await;
    // A value Eidos lacks, a component still a draft, and code in the meron are refused.
    let error = refused(component(
        "odd",
        R,
        &["noi.eio.size.icon.huge"],
        &[],
        &["src/Odd/Odd.tsx"],
    ))
    .await;
    assert!(
        error.contains("reads values Eidos does not have: noi.eio.size.icon.huge"),
        "{error}"
    );
    let draft = registry
        .propose(
            &actor,
            component("draft", R, &[], &[], &["src/Draft/Draft.tsx"]),
        )
        .await
        .unwrap()
        .identity
        .uid;
    let error = refused(component("odd", R, &[], &["draft"], &["src/Odd/Odd.tsx"])).await;
    assert!(
        error.contains(&format!("{C}draft is not a component in Mero")),
        "{error}"
    );
    let mut code = component("odd", R, &[], &[], &["src/Odd/Odd.tsx"]);
    code.spec["code"] = json!("export function Odd() {}");
    refused(code).await;
    // Each file sits in a folder named for its meron (the rule's `folders`, 18 Nov).
    let error = refused(component("odd", R, &[], &[], &["src/Icon/Odd.tsx"])).await;
    assert!(
        error.contains("its file src/Icon/Odd.tsx is not in its folder"),
        "{error}"
    );
    // A file belongs to one meron only; the same place in another package is another file. With
    // folders, only a meron named for the same folder could list it.
    let mut twin = component("world.icon", R, &[], &[], &["src/Icon/Icon.tsx"]);
    twin.spec["states"] = json!({"measure": {"height": "how tall it stands"}});
    let error = refused(twin).await;
    assert!(
        error.contains(&format!(
            "src/Icon/Icon.tsx of {R} is already listed by {C}icon"
        )),
        "{error}"
    );
    // Two components may not give one type name: world.icon's group look would give IconLook, which
    // icon gives already, and Mero could then not write components.ts after the approval.
    let error = refused(component(
        "world.icon",
        "@noi/eio-3d",
        &[],
        &[],
        &["src/icon/icon.ts"],
    ))
    .await;
    assert!(
        error.contains(&format!(
            "its group look gives the type IconLook, which {C}icon gives already"
        )),
        "{error}"
    );
    let mut world_icon = component("world.icon", "@noi/eio-3d", &[], &[], &["src/icon/icon.ts"]);
    world_icon.spec["states"] = json!({"measure": {"height": "how tall it stands"}});
    register(world_icon).await;
    // A draft lists nothing: only admitted merons own files, so another meron named for its folder may
    // list its file, and the draft then cannot be registered.
    let mut draft_twin = component("world.draft", R, &[], &[], &["src/Draft/Draft.tsx"]);
    draft_twin.spec["states"] = json!({"measure": {"height": "how tall it stands"}});
    register(draft_twin).await;
    register(component(
        "button",
        R,
        &["noi.eio.space.gap.inline"],
        &["icon"],
        &["src/Button/Button.tsx"],
    ))
    .await;
    let button = registry
        .get(&actor, &format!("{C}button"))
        .await
        .unwrap()
        .identity
        .uid;
    let error = registry
        .transition(&actor, draft, 1, MeronState::Registered)
        .await
        .unwrap_err()
        .to_string();
    assert!(
        error.contains(&format!("already listed by {C}world.draft")),
        "{error}"
    );

    let snapshot = registry.snapshot(&actor).await.unwrap();
    let depends_on = |uid: Uuid| -> HashSet<Uuid> {
        snapshot
            .relationships
            .iter()
            .filter(|r| r.source == uid && r.predicate == Predicate::DependsOn)
            .map(|r| r.target)
            .collect()
    };
    assert_eq!(depends_on(icon), HashSet::from([icon_small]));
    assert_eq!(depends_on(button), HashSet::from([icon, gap_inline]));
    let history = registry.history(&actor, button).await.unwrap();
    let registered = history
        .iter()
        .find(|e| e.action == "meron.transition")
        .unwrap();
    assert_eq!(registered.payload["checks"][0]["check"], "eio.component");
    assert_eq!(
        registered.payload["checks"][0]["invariant"],
        json!({"uid": invariant, "revision": 2})
    );
    let read = registered.payload["checks"][0]["read"].as_array().unwrap();
    for uid in [icon, gap_inline] {
        assert!(read.iter().any(|r| r["uid"] == json!(uid)), "{read:?}");
    }

    // A new version of a component keeps its own files: they are not "listed by another".
    let evidence = CompatibilityEvidence {
        impact: Impact::Breaking,
        rationale: "A new icon".into(),
        invariant_checks: vec![],
        migration_plan: Some("Nothing to move".into()),
    };
    let mut newer = component(
        "icon",
        R,
        &["noi.eio.size.icon.small"],
        &[],
        &["src/Icon/Icon.tsx", "src/Icon/Icon.module.css"],
    );
    newer.spec["files"][0]["sha256"] = json!(fingerprint('b'));
    registry
        .update(&actor, icon, 2, newer, evidence)
        .await
        .unwrap();
    // A component in use cannot retire, and neither can a value a component reads.
    for (revision, state) in [(3, MeronState::Active), (4, MeronState::Deprecated)] {
        registry
            .transition(&actor, icon, revision, state)
            .await
            .unwrap();
    }
    assert!(registry
        .transition(&actor, icon, 5, MeronState::Retired)
        .await
        .is_err());
    let small = registry
        .get(&actor, "noi.eio.size.icon.small")
        .await
        .unwrap();
    assert!(registry
        .transition(&actor, icon_small, small.revision, MeronState::Active)
        .await
        .is_ok());
    let small = registry
        .get(&actor, "noi.eio.size.icon.small")
        .await
        .unwrap();
    registry
        .transition(&actor, icon_small, small.revision, MeronState::Deprecated)
        .await
        .unwrap();
    assert!(registry
        .transition(&actor, icon_small, small.revision + 1, MeronState::Retired)
        .await
        .is_err());

    // A component renamed takes its folder with it, in the same batch (18 Nov): renamed alone, it
    // fails its rule under its new name; renamed with its files moved, both changes pass, in either
    // order.
    let tree = register(component("tree", R, &[], &[], &["src/Tree/Tree.tsx"])).await;
    let revision = registry
        .get(&actor, &format!("{C}tree"))
        .await
        .unwrap()
        .revision;
    let rename = Change::Rename {
        uid: tree,
        expected_revision: revision,
        path: format!("{C}tree-row"),
    };
    // A component's change names its branch and commit (part B, agreed 18 Nov).
    let commit = "a".repeat(40);
    let batch = |changes: Vec<Change>| NewBatch {
        title: "Tree becomes Tree row".into(),
        note: None,
        changes,
        touch: None,
        branch: Some("claude/tree-row".into()),
        commit: Some(commit.clone()),
    };
    let alone = registry
        .propose_batch(&actor, batch(vec![rename.clone()]))
        .await
        .unwrap();
    let outcome = &alone.proposals[0].outcome;
    assert_eq!(outcome["ok"], json!(false), "{outcome}");
    let error = outcome["error"].as_str().unwrap();
    assert!(
        error.contains(&format!("as {C}tree-row, it does not pass its rule"))
            && error.contains("its file src/Tree/Tree.tsx is not in its folder"),
        "{error}"
    );
    let moved = Change::Update {
        uid: tree,
        expected_revision: revision + 1,
        meron: component("tree-row", R, &[], &[], &["src/TreeRow/Tree.tsx"]),
        compatibility: CompatibilityEvidence {
            impact: Impact::NonBreaking,
            rationale: "Its files move with its name".into(),
            invariant_checks: vec!["Its rule, under its new name".into()],
            migration_plan: None,
        },
    };
    let both = registry
        .propose_batch(&actor, batch(vec![moved, rename]))
        .await
        .unwrap();
    for p in &both.proposals {
        assert_eq!(p.outcome["ok"], json!(true), "{}", p.outcome);
    }

    // In force, as Mero's components are: active.
    registry
        .transition(&actor, tree, revision, MeronState::Active)
        .await
        .unwrap();
    let revision = revision + 1;

    // What you approve is what lands (part B, decision 4, agreed 18 Nov). A component's change with no
    // branch is refused; with one, approving it waits for its commit, and landing applies it.
    let mut quieter = component("tree", R, &[], &[], &["src/Tree/Tree.tsx"]);
    quieter.spec["job"] = json!("Show a tree, more quietly.");
    let change = |rev: i64| Change::Update {
        uid: tree,
        expected_revision: rev,
        meron: quieter.clone(),
        compatibility: CompatibilityEvidence {
            impact: Impact::NonBreaking,
            rationale: "Its words".into(),
            invariant_checks: vec!["Its rule".into()],
            migration_plan: None,
        },
    };
    let error = registry
        .propose_batch(
            &actor,
            NewBatch {
                branch: None,
                commit: None,
                ..batch(vec![change(revision)])
            },
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(
        error.contains(&format!(
            "{C}tree: a change to a component names its branch and commit"
        )),
        "{error}"
    );
    let waits = registry
        .propose_batch(&actor, batch(vec![change(revision)]))
        .await
        .unwrap();
    assert_eq!(waits.commit.as_deref(), Some(commit.as_str()));
    let approved = registry.approve(&actor, &[waits.uid]).await.unwrap();
    assert_eq!(
        approved[0].state,
        ProposalState::Landing,
        "approved, waiting to land"
    );
    let held = registry.get(&actor, &format!("{C}tree")).await.unwrap();
    assert_eq!(held.revision, revision, "nothing in Mero changed yet");
    assert_eq!(held.spec["job"], json!("A test component."));
    // Waiting to land, as it leaves its meron: Mero reads from the files whether a commit carries it
    // (decision 4, changed 18 Nov: by the files, not the commit's id), so a squash or a rebase does.
    let waiting = registry.waiting_to_land().await.unwrap();
    let w = waiting.iter().find(|w| w.batch == waits.uid).unwrap();
    assert_eq!(w.merons.len(), 1);
    assert_eq!(w.merons[0].spec["job"], json!("Show a tree, more quietly."));
    let file = |m: &noi_inv::Meron| json!({"path": m.identity.path, "name": m.identity.name, "semantics": m.semantics, "spec": m.spec});
    let held = registry.snapshot(&actor).await.unwrap().merons;
    let carried = [file(&w.merons[0])];
    assert!(noi_mer::approved::carries(&held, &carried, w));
    let before = [file(held.iter().find(|m| m.identity.uid == tree).unwrap())];
    assert!(!noi_mer::approved::carries(&held, &before, w));
    // Another batch, with another change to the same meron, approved too.
    let mut louder = component("tree", R, &[], &[], &["src/Tree/Tree.tsx"]);
    louder.spec["job"] = json!("Show a tree, loudly.");
    let rival = registry
        .propose_batch(
            &actor,
            batch(vec![Change::Update {
                uid: tree,
                expected_revision: revision,
                meron: louder.clone(),
                compatibility: CompatibilityEvidence {
                    impact: Impact::NonBreaking,
                    rationale: "Its words".into(),
                    invariant_checks: vec!["Its rule".into()],
                    migration_plan: None,
                },
            }]),
        )
        .await
        .unwrap();
    registry.approve(&actor, &[rival.uid]).await.unwrap();
    let made = chrono::Utc::now();
    let waiting = registry.waiting_to_land().await.unwrap();
    assert_eq!(
        noi_mer::approved::lands_first(&held, &carried, &waiting, made),
        Some(waits.uid),
        "main's files carry the first, and only it"
    );
    // Approved once; not again.
    assert!(registry.approve(&actor, &[waits.uid]).await.is_err());
    let landed = registry.land(&actor, waits.uid).await.unwrap();
    assert_eq!(landed.proposals[0].state, ProposalState::Approved);
    let held = registry.get(&actor, &format!("{C}tree")).await.unwrap();
    assert_eq!(
        held.spec["job"],
        json!("Show a tree, more quietly."),
        "landed: now it is in Mero"
    );
    // The other was approved against what was there before: it goes back to its proposer.
    assert_eq!(landed.sent_back, [rival.uid]);
    let back = registry.batch(&actor, rival.uid).await.unwrap();
    assert_eq!(back.proposals[0].state, ProposalState::SentBack);
    assert!(back.proposals[0].decided_by.is_none());
    assert!(back.events.iter().any(|e| e.action == "proposal.send-back"
        && e.note
            .as_deref()
            .is_some_and(|n| n.contains("landed first"))));
    assert!(registry
        .waiting_to_land()
        .await
        .unwrap()
        .iter()
        .all(|w| w.batch != waits.uid && w.batch != rival.uid));
    assert!(
        matches!(registry.land(&actor, waits.uid).await, Err(Error::NotFound)),
        "it lands once"
    );
    // Revised against what landed, it waits, and is approved again, to wait for its code again.
    registry
        .revise(
            &actor,
            back.proposals[0].uid,
            Change::Update {
                uid: tree,
                expected_revision: held.revision,
                meron: louder,
                compatibility: CompatibilityEvidence {
                    impact: Impact::NonBreaking,
                    rationale: "Its words, after the other landed".into(),
                    invariant_checks: vec!["Its rule".into()],
                    migration_plan: None,
                },
            },
            None,
        )
        .await
        .unwrap();
    let again = registry.approve(&actor, &[rival.uid]).await.unwrap();
    assert_eq!(again[0].state, ProposalState::Landing);
}

/// Review: proposals wait in batches; Mero holds only what a maintainer approved.
async fn verify_review(url: &str) {
    const P: &str = "noi.eio.color.palette.";
    let developer = Actor {
        subject: "test-developer".into(),
    };
    let bootstrap = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(developer.subject.clone(), "noi".into()).unwrap(),
        ));
    let root = bootstrap.get(&developer, "noi").await.unwrap().identity.uid;
    let eio = bootstrap.get(&developer, "noi.eio").await.unwrap();
    let eio_uid = eio.identity.uid;
    let grant = |subject: &str, role| Grant {
        subject: subject.into(),
        scope: root,
        role,
    };
    let policy = GovernancePolicy {
        id: "GOV-001-review".into(),
        revision: 1,
        scopes: vec![
            Scope {
                uid: root,
                parent: None,
            },
            Scope {
                uid: eio_uid,
                parent: Some(root),
            },
        ],
        grants: vec![
            grant("design-agent", Role::Contributor),
            grant("maintainer", Role::Maintainer),
            grant("observer", Role::Observer),
        ],
    };
    let registry = bootstrap.with_authorizer(Arc::new(ScopedAuthorizer::new(policy).unwrap()));
    let agent = Actor {
        subject: "design-agent".into(),
    };
    let human = Actor {
        subject: "maintainer".into(),
    };
    let observer = Actor {
        subject: "observer".into(),
    };
    let token = |path: &str, subtype: &str, spec: serde_json::Value| {
        let mut p = proposal(eio_uid, path, MeronType::Token);
        p.classification.subtype = Some(subtype.into());
        p.spec = spec;
        p
    };
    let grey =
        |l: f64, hex: &str| json!({"value":{"colorSpace":"oklch","components":[l,0,0],"hex":hex}});
    let role = |path: &str, color: &str| {
        token(
            path,
            "color-role",
            json!({"light":{"ref":format!("{P}{color}")},"dark":{"ref":format!("{P}{color}")}}),
        )
    };
    let add = |meron: NewMeron| Change::Add {
        meron,
        container: None,
    };
    let batch = |title: &str, changes: Vec<Change>| NewBatch {
        title: title.into(),
        note: Some("From the review test".into()),
        changes,
        touch: None,
        branch: None,
        commit: None,
    };

    // Order inside a batch does not matter: the role comes before the color it reads.
    let first = registry
        .propose_batch(
            &agent,
            batch(
                "Ink",
                vec![
                    add(role("noi.eio.color.text.review-ink", "review-ink")),
                    add(token(
                        &format!("{P}review-ink"),
                        "color",
                        grey(0.145, "#0A0A0A"),
                    )),
                ],
            ),
        )
        .await
        .unwrap();
    assert_eq!(first.proposals.len(), 2);
    assert!(
        first
            .proposals
            .iter()
            .all(|p| p.outcome["ok"] == json!(true)
                && p.state == ProposalState::Waiting
                && !p.stale),
        "{:#?}",
        first.proposals
    );
    // The test run left nothing behind: Mero holds only what was approved.
    assert!(matches!(
        registry.get(&human, &format!("{P}review-ink")).await,
        Err(Error::NotFound)
    ));
    assert!(matches!(
        registry.get(&human, "noi.eio.color.text.review-ink").await,
        Err(Error::NotFound)
    ));
    assert_eq!(first.events.len(), 1);
    assert_eq!(
        first.events[0].note.as_deref(),
        Some("From the review test")
    );

    // Observers cannot propose; contributors cannot approve, not even their own work.
    assert!(matches!(
        registry
            .propose_batch(
                &observer,
                batch(
                    "No",
                    vec![add(token(
                        &format!("{P}review-no"),
                        "color",
                        grey(0.5, "#636363")
                    ))]
                )
            )
            .await,
        Err(Error::Denied(_))
    ));
    assert!(registry.approve(&agent, &[first.uid]).await.is_err());
    assert!(registry
        .send_back(&agent, first.proposals[0].uid, "no")
        .await
        .is_err());
    assert!(registry
        .review(&observer)
        .await
        .unwrap()
        .iter()
        .any(|b| b.uid == first.uid));

    // A failing change shows in the test run, and approving its batch changes nothing.
    let second = registry
        .propose_batch(
            &agent,
            batch(
                "Paper",
                vec![
                    add(token(
                        &format!("{P}review-paper"),
                        "color",
                        grey(1.0, "#FFFFFF"),
                    )),
                    add(role("noi.eio.color.surface.review-paper", "missing")),
                ],
            ),
        )
        .await
        .unwrap();
    assert_eq!(second.proposals[0].outcome["ok"], json!(true));
    assert_eq!(second.proposals[1].outcome["ok"], json!(false));
    let refused = registry
        .approve(&human, &[second.uid])
        .await
        .unwrap_err()
        .to_string();
    assert!(
        refused.contains("nothing was approved")
            && refused.contains("noi.eio.color.surface.review-paper"),
        "{refused}"
    );
    assert!(matches!(
        registry.get(&human, &format!("{P}review-paper")).await,
        Err(Error::NotFound)
    ));

    // Send back with a note; only the proposer revises; the revision is checked again and waits.
    let bad = second.proposals[1].uid;
    assert!(
        registry.send_back(&human, bad, "  ").await.is_err(),
        "a note is required"
    );
    let sent = registry
        .send_back(&human, bad, "Read Paper, not a missing color")
        .await
        .unwrap();
    assert_eq!(sent.state, ProposalState::SentBack);
    assert!(
        registry.approve(&human, &[bad]).await.is_err(),
        "a sent-back proposal waits for its proposer"
    );
    let fixed = add(role("noi.eio.color.surface.review-paper", "review-paper"));
    assert!(matches!(
        registry.revise(&human, bad, fixed.clone(), None).await,
        Err(Error::Denied(_))
    ));
    let revised = registry
        .revise(&agent, bad, fixed, Some("Now reads Paper"))
        .await
        .unwrap();
    let again = revised.proposals.iter().find(|p| p.uid == bad).unwrap();
    assert_eq!(
        (again.state, again.revision, again.outcome["ok"].clone()),
        (ProposalState::Waiting, 2, json!(true))
    );

    // Approving runs it for real: added, filed under its system, registered and activated.
    let approved = registry
        .approve(&human, &[second.uid, first.uid])
        .await
        .unwrap();
    assert_eq!(approved.len(), 4);
    assert!(approved.iter().all(
        |p| p.state == ProposalState::Approved && p.decided_by.as_deref() == Some("maintainer")
    ));
    let ink_role = registry
        .get(&human, "noi.eio.color.text.review-ink")
        .await
        .unwrap();
    assert_eq!(ink_role.lifecycle.state, MeronState::Active);
    let snapshot = registry.snapshot(&human).await.unwrap();
    let ink = snapshot
        .merons
        .iter()
        .find(|m| m.identity.path == format!("{P}review-ink"))
        .unwrap();
    assert!(snapshot.relationships.iter().any(|r| r.source == eio_uid
        && r.predicate == Predicate::Contains
        && r.target == ink.identity.uid));
    assert!(snapshot
        .relationships
        .iter()
        .any(|r| r.source == ink_role.identity.uid
            && r.predicate == Predicate::DependsOn
            && r.target == ink.identity.uid));
    // Mero's own history says who proposed and who admitted it.
    let history = registry
        .history(&human, ink_role.identity.uid)
        .await
        .unwrap();
    let steps: Vec<(&str, &str)> = history
        .iter()
        .filter(|e| e.meron_uid == ink_role.identity.uid)
        .map(|e| (e.action.as_str(), e.actor.as_str()))
        .collect();
    // Registering it also records what it reads (depends-on Ink).
    assert_eq!(
        steps,
        vec![
            ("meron.propose", "design-agent"),
            ("relationship.add", "maintainer"),
            ("meron.transition", "maintainer"),
            ("meron.transition", "maintainer")
        ]
    );
    assert!(
        registry
            .approve(&human, &[first.proposals[0].uid])
            .await
            .is_err(),
        "approved is final"
    );

    // Two changes to the same meron: once one is approved, the other is stale and cannot apply.
    let renamed = |definition: &str| {
        let mut m = token(&format!("{P}review-ink"), "color", ink.spec.clone());
        m.semantics.definition = definition.into();
        Change::Update {
            uid: ink.identity.uid,
            expected_revision: ink.revision,
            meron: m,
            compatibility: CompatibilityEvidence {
                impact: Impact::NonBreaking,
                rationale: "Clearer words".into(),
                invariant_checks: vec!["color token invariant".into()],
                migration_plan: None,
            },
        }
    };
    let a = registry
        .propose_batch(
            &human,
            batch("Words A", vec![renamed("Ink for review tests")]),
        )
        .await
        .unwrap();
    let b = registry
        .propose_batch(
            &agent,
            batch("Words B", vec![renamed("Ink, but other words")]),
        )
        .await
        .unwrap();
    let approved_a = registry.approve(&human, &[a.uid]).await.unwrap();
    // The record keeps the meron as it was, so the change still reads as a change afterwards.
    assert_eq!(
        approved_a[0].outcome["before"]["semantics"]["definition"],
        json!(ink.semantics.definition)
    );
    assert_eq!(
        approved_a[0].outcome["meron"]["semantics"]["definition"],
        json!("Ink for review tests")
    );
    let b = registry
        .review(&human)
        .await
        .unwrap()
        .into_iter()
        .find(|x| x.uid == b.uid)
        .unwrap();
    assert!(b.proposals[0].stale);
    assert!(registry
        .approve(&human, &[b.uid])
        .await
        .unwrap_err()
        .to_string()
        .contains("revision conflict"));
    let closed = registry
        .reject(&human, b.proposals[0].uid, "Superseded by Words A")
        .await
        .unwrap();
    assert_eq!(closed.state, ProposalState::Rejected);
    assert!(
        registry
            .reject(&human, b.proposals[0].uid, "again")
            .await
            .is_err(),
        "rejected is final"
    );
    assert_eq!(
        registry
            .get(&human, &format!("{P}review-ink"))
            .await
            .unwrap()
            .semantics
            .definition,
        "Ink for review tests"
    );

    // The one way back through Review (agreed 8 Nov): set aside, then reinstated with a reason,
    // meeting today's invariants again.
    let ink_now = registry
        .get(&human, &format!("{P}review-ink"))
        .await
        .unwrap();
    let aside = registry
        .propose_batch(
            &agent,
            batch(
                "Set ink aside",
                vec![Change::Deprecate {
                    uid: ink_now.identity.uid,
                    expected_revision: ink_now.revision,
                }],
            ),
        )
        .await
        .unwrap();
    registry.approve(&human, &[aside.uid]).await.unwrap();
    let aside = registry
        .get(&human, &format!("{P}review-ink"))
        .await
        .unwrap();
    assert_eq!(aside.lifecycle.state, MeronState::Deprecated);
    let back = |reason: &str| Change::Reinstate {
        uid: aside.identity.uid,
        expected_revision: aside.revision,
        reason: reason.into(),
    };
    assert!(registry
        .propose_batch(&agent, batch("No reason", vec![back("  ")]))
        .await
        .is_err());
    let again = registry
        .propose_batch(
            &agent,
            batch("Ink again", vec![back("The review tests need it")]),
        )
        .await
        .unwrap();
    assert_eq!(
        again.proposals[0].outcome["ok"],
        json!(true),
        "{:#?}",
        again.proposals
    );
    registry.approve(&human, &[again.uid]).await.unwrap();
    let ink_back = registry
        .get(&human, &format!("{P}review-ink"))
        .await
        .unwrap();
    assert_eq!(ink_back.lifecycle.state, MeronState::Active);

    // Nothing is deleted, and decided proposals cannot be edited, even with direct SQL.
    let mut sql = PgConnection::connect(url).await.unwrap();
    let reason: Option<String> = sqlx::query_scalar(
        "SELECT payload->>'reason' FROM mer.events WHERE meron_uid=$1 AND action='meron.transition' ORDER BY sequence DESC LIMIT 1",
    )
    .bind(ink_back.identity.uid)
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert_eq!(reason.as_deref(), Some("The review tests need it"));
    assert!(sql
        .execute("DELETE FROM mer.proposal_events")
        .await
        .is_err());
    assert!(sql
        .execute(
            format!(
                "UPDATE mer.proposals SET state='waiting' WHERE uid='{}'",
                b.proposals[0].uid
            )
            .as_str()
        )
        .await
        .is_err());
    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM mer.proposal_events WHERE batch=$1 ORDER BY sequence",
    )
    .bind(second.uid)
    .fetch_all(&mut sql)
    .await
    .unwrap();
    assert_eq!(
        actions,
        [
            "proposal.submit",
            "proposal.send-back",
            "proposal.revise",
            "proposal.approve",
            "proposal.approve"
        ]
    );
}

/// Governance's roles and rules come in through Review, checked as Cedar against the actions each
/// system declares.
async fn verify_governance(url: &str) {
    let developer = Actor {
        subject: "test-developer".into(),
    };
    let bootstrap = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(developer.subject.clone(), "noi".into()).unwrap(),
        ));
    let root = bootstrap.get(&developer, "noi").await.unwrap().identity.uid;
    let gov = bootstrap
        .get(&developer, "noi.gov")
        .await
        .unwrap()
        .identity
        .uid;
    let grant = |subject: &str, role| Grant {
        subject: subject.into(),
        scope: root,
        role,
    };
    let policy = GovernancePolicy {
        id: "GOV-001-governance".into(),
        revision: 1,
        scopes: vec![
            Scope {
                uid: root,
                parent: None,
            },
            Scope {
                uid: gov,
                parent: Some(root),
            },
        ],
        grants: vec![
            grant("design-agent", Role::Contributor),
            grant("maintainer", Role::Maintainer),
        ],
    };
    let registry = bootstrap.with_authorizer(Arc::new(ScopedAuthorizer::new(policy).unwrap()));
    let agent = Actor {
        subject: "design-agent".into(),
    };
    let human = Actor {
        subject: "maintainer".into(),
    };
    let file = |name: &str| -> NewMeron {
        // Mero's role and rule merons as they were before they moved to Governance (step 3).
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/before-step-3")
            .join(name);
        let mut m: NewMeron =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        m.authority_scope = Some(gov);
        m
    };
    let add = |meron: NewMeron| Change::Add {
        meron,
        container: None,
    };
    let batch = |title: &str, changes: Vec<Change>| NewBatch {
        title: title.into(),
        note: None,
        changes,
        touch: None,
        branch: None,
        commit: None,
    };
    let names = [
        "role-invariant.json",
        "rule-invariant.json",
        "roles/maintainer.json",
        "roles/owner.json",
        "rules/fresh-touch.json",
        "rules/owners-approve-gov.json",
    ];
    // The roles come before their invariant in the batch; order does not matter.
    let mut changes: Vec<Change> = names.iter().rev().map(|n| add(file(n))).collect();
    // A role granting another system's actions, and a rule with blanks, fail their test run.
    let mut stray = file("roles/owner.json");
    stray.path = "noi.gov.roles.stray".into();
    stray.spec["system"] = json!("mero");
    let mut blank = file("rules/fresh-touch.json");
    blank.path = "noi.gov.rules.blank".into();
    blank.spec["cedar"] = json!("forbid (principal == ?principal, action, resource);");
    changes.push(add(stray));
    changes.push(add(blank));
    // Some of these rules are written by hand, which an agent may not propose (9 Nov, step 7: it
    // asks "write Cedar"); a maintainer proposes them here, as the local policy allows.
    assert!(registry
        .propose_batch(&agent, batch("Governance roles and rules", changes.clone()))
        .await
        .is_err());
    let sent = registry
        .propose_batch(&human, batch("Governance roles and rules", changes))
        .await
        .unwrap();
    let outcome = |path: &str| {
        sent.proposals
            .iter()
            .find(|p| serde_json::to_value(&p.change).unwrap()["meron"]["path"] == json!(path))
            .unwrap()
            .outcome
            .clone()
    };
    for p in &sent.proposals[..names.len()] {
        assert_eq!(p.outcome["ok"], json!(true), "{:#?}", p);
    }
    let stray = outcome("noi.gov.roles.stray");
    assert!(
        stray["error"]
            .as_str()
            .unwrap()
            .contains(r#"Action::"governance" is not an action mero declares"#),
        "{stray}"
    );
    let blank = outcome("noi.gov.rules.blank");
    assert!(
        blank["error"].as_str().unwrap().contains("is a role"),
        "{blank}"
    );
    assert!(
        registry.approve(&human, &[sent.uid]).await.is_err(),
        "nothing is approved while two fail"
    );
    for p in &sent.proposals[names.len()..] {
        registry
            .reject(&human, p.uid, "Not a role or rule we agreed")
            .await
            .unwrap();
    }
    let approved = registry.approve(&human, &[sent.uid]).await.unwrap();
    assert_eq!(approved.len(), names.len());
    // The whole test database spans scopes this policy does not list, so read it as the developer.
    let reader = Registry::connect(url)
        .await
        .unwrap()
        .with_authorizer(Arc::new(
            LocalDevelopmentGrant::new(developer.subject.clone(), "noi".into()).unwrap(),
        ));
    let snapshot = reader.snapshot(&developer).await.unwrap();
    for path in [
        "noi.gov.inv.role",
        "noi.gov.inv.rule",
        "noi.gov.roles.maintainer",
        "noi.gov.roles.owner",
        "noi.gov.rules.fresh-touch",
        "noi.gov.rules.owners-approve-gov",
    ] {
        let m = snapshot
            .merons
            .iter()
            .find(|m| m.identity.path == path)
            .unwrap_or_else(|| panic!("{path}"));
        assert_eq!(m.lifecycle.state, MeronState::Active, "{path}");
        assert!(
            snapshot.relationships.iter().any(|r| r.source == gov
                && r.predicate == Predicate::Contains
                && r.target == m.identity.uid),
            "{path}"
        );
    }
    // Once admitted, the role invariant refuses a role naming an action nobody declares.
    let mut unknown = file("roles/maintainer.json");
    unknown.path = "noi.gov.roles.unknown".into();
    unknown.spec["cedar"] = json!(
        r#"permit (principal == ?principal, action == Action::"delete", resource in ?resource);"#
    );
    // Cedar the form can't read is written by hand: a maintainer's to propose here (step 7).
    let later = registry
        .propose_batch(&human, batch("Unknown action", vec![add(unknown)]))
        .await
        .unwrap();
    assert!(
        later.proposals[0].outcome["error"]
            .as_str()
            .unwrap()
            .contains("noi.gov.inv.role"),
        "{:#?}",
        later.proposals[0]
    );
}
