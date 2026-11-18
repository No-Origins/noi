//! Step 3, end to end: Mero asks a real Governance server about every request, on real PostgreSQL,
//! with a software passkey standing in for Touch ID. Creates a disposable database and drops it;
//! never touches the shared one.
//! Explicit opt-in: NOI_TEST_ADMIN_URL=... cargo test -p noi-mer --test governance -- --ignored
use noi_gov::server::{grant_about, http, new_voucher_key, vouch, Config, Governance, GrantSpec};
use noi_gov::*;
use noi_inv::*;
use noi_mer::{Change, Error, NewBatch, ProposalState, Registry};
use serde_json::{json, Value};
use sqlx::{Connection, Executor, PgConnection};
use std::sync::Arc;
use url::Url;
use uuid::Uuid;
use webauthn_authenticator_rs::{prelude::WebauthnAuthenticator, softpasskey::SoftPasskey};

#[tokio::test]
#[ignore = "requires a reachable PostgreSQL admin URL and CREATE DATABASE; see docs/verification.md"]
async fn mero_asks_governance_on_real_postgres() {
    let admin = std::env::var("NOI_TEST_ADMIN_URL").expect("set NOI_TEST_ADMIN_URL explicitly");
    let name = format!("noi_step3_test_{}", Uuid::new_v4().simple());
    let mut admin_conn = PgConnection::connect(&admin).await.unwrap();
    admin_conn
        .execute(format!("CREATE DATABASE {name}").as_str())
        .await
        .unwrap();
    let mut opts: sqlx::postgres::PgConnectOptions = admin.parse().unwrap();
    opts = opts.database(&name);
    let url = sqlx::ConnectOptions::to_url_lossy(&opts).to_string();
    let task = tokio::spawn(async move { verify(&url).await });
    let result = task.await;
    admin_conn
        .execute(format!("DROP DATABASE {name} WITH (FORCE)").as_str())
        .await
        .unwrap();
    if let Err(e) = result {
        std::panic::resume_unwind(e.into_panic());
    }
}

/// A person with a software passkey.
struct Person {
    key: SoftPasskey,
    origin: Url,
}
impl Person {
    async fn add_passkey(&mut self, gov: &Governance, link: &str) {
        let s = gov
            .link_start(link.rsplit('#').next().unwrap())
            .await
            .unwrap();
        let c = self
            .key
            .do_registration(self.origin.clone(), s.options)
            .unwrap();
        gov.link_finish(s.ceremony, &c, "Soft passkey")
            .await
            .unwrap();
    }
    async fn sign_in(&mut self, gov: &Governance, handle: &str) -> String {
        let s = gov.sign_in_start(handle).await.unwrap();
        let c = self
            .key
            .do_authentication(self.origin.clone(), s.options)
            .unwrap();
        gov.sign_in_finish(s.ceremony, &c).await.unwrap()
    }
    async fn touch(
        &mut self,
        gov: &Governance,
        session: &str,
        action: &str,
        targets: &[Target],
    ) -> Uuid {
        self.touch_for(gov, session, action, targets, None).await
    }
    /// A touch naming what else it is for (9 Nov, step 7).
    async fn touch_for(
        &mut self,
        gov: &Governance,
        session: &str,
        action: &str,
        targets: &[Target],
        about: Option<Value>,
    ) -> Uuid {
        let s = gov
            .touch_start_about(session, action, targets, about.as_ref())
            .await
            .unwrap();
        let c = self
            .key
            .do_authentication(self.origin.clone(), s.options)
            .unwrap();
        gov.touch_finish(session, s.ceremony, &c).await.unwrap()
    }
}

fn meron(scope: Uuid, path: &str) -> NewMeron {
    NewMeron {
        path: path.into(),
        name: "Step 3 meron".into(),
        classification: Classification {
            kind: MeronType::Component,
            subtype: None,
            roles: vec![],
        },
        semantics: Semantics {
            definition: "A meron an agent proposes".into(),
            responsibility: "Show that Mero asks Governance".into(),
        },
        release_mode: ReleaseMode::Inherited,
        authority_scope: Some(scope),
        metadata: json!({}),
        spec: json!({}),
    }
}
fn batch(title: &str, changes: Vec<Change>) -> NewBatch {
    NewBatch {
        title: title.into(),
        note: None,
        changes,
        touch: None,
        branch: None,
        commit: None,
    }
}
fn add(m: NewMeron) -> Change {
    Change::Add {
        meron: m,
        container: None,
    }
}
fn denied<T: std::fmt::Debug>(result: std::result::Result<T, Error>, why: &str) {
    match result {
        Err(Error::Denied(reason)) => assert!(reason.contains(why), "{reason} should say {why}"),
        other => panic!("expected a refusal saying {why}, got {other:?}"),
    }
}

async fn verify(url: &str) {
    // Mero, holding the agreed roles and rules and a proposer role an owner made in the UI. They
    // are put there the old way, with a test-only authorizer.
    let mero = Registry::connect(url).await.unwrap();
    mero.migrate().await.unwrap();
    let dev = Actor {
        subject: "test-developer".into(),
    };
    let boot = mero.clone().with_authorizer(Arc::new(
        LocalDevelopmentGrant::new(dev.subject.clone(), "noi".into()).unwrap(),
    ));
    boot.seed_reference(&dev).await.unwrap();
    let gov_scope = boot.get(&dev, "noi.gov").await.unwrap().identity.uid;
    let inv_scope = boot.get(&dev, "noi.inv").await.unwrap().identity.uid;
    let file = |name: &str| -> NewMeron {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/gov")
            .join(name);
        let mut m: NewMeron =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        m.authority_scope = Some(gov_scope);
        m
    };
    let mut proposer = file("roles/maintainer.json");
    proposer.path = "noi.gov.roles.proposer".into();
    proposer.name = "Proposer".into();
    proposer.spec["cedar"] = json!(
        r#"permit (principal == ?principal, action in [Action::"read", Action::"propose"], resource in ?resource);"#
    );
    let mut changes: Vec<Change> = [
        "role-invariant.json",
        "rule-invariant.json",
        "roles/maintainer.json",
        "roles/owner.json",
        "rules/fresh-touch.json",
        "rules/owners-approve-gov.json",
    ]
    .iter()
    .map(|n| add(file(n)))
    .collect();
    changes.push(add(proposer));
    let roles = boot
        .propose_batch(&dev, batch("Roles and rules", changes))
        .await
        .unwrap();
    boot.approve(&dev, &[roles.uid]).await.unwrap();

    // The door Governance copies through holds the roles and rules under noi.gov, and nothing else.
    let door = mero.roles_and_rules().await.unwrap();
    assert_eq!(door.merons.len(), 5, "three roles and two rules");
    assert!(door.merons.iter().all(
        |m| m.identity.path.starts_with("noi.gov.") && m.classification.kind == MeronType::Rule
    ));
    assert!(door.relationships.is_empty() && door.releases.is_empty());

    // Governance, on its own port, with its copy.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let origin = Url::parse(&format!("http://localhost:{port}")).unwrap();
    let gov = Governance::connect(
        url,
        Config {
            origin: origin.clone(),
            pages: Url::parse("https://gov.no-origins.localhost:3000/").unwrap(),
            domain: "no-origins.localhost".into(),
            mail: noi_gov::server::Mailer::None,
            mero: None,
        },
    )
    .await
    .unwrap();
    gov.migrate().await.unwrap();
    let copied = gov
        .copy_from_snapshot(&serde_json::to_value(&door).unwrap(), "mero")
        .await
        .unwrap();
    assert_eq!((copied.roles, copied.rules), (3, 2));
    let app = http::router(gov.clone());
    tokio::spawn(async move { axum::serve(listener, app).await });
    let client = GovernanceClient::new(&format!("http://127.0.0.1:{port}"));
    let with = |credential: Credential, touch: Option<Uuid>| {
        mero.clone()
            .with_authorizer(Arc::new(client.asking(credential, touch)))
    };

    // You: the first owner, a passkey, a session.
    let setup = gov
        .setup("hiddenstack", "Ada", "ada@example.com")
        .await
        .unwrap();
    // Where the passkey is used: the app's pages on the subdomains (agreed 8 Nov); https, as the
    // software passkey takes http only for plain localhost.
    let mut person = Person {
        key: SoftPasskey::new(true),
        origin: Url::parse("https://mero.no-origins.localhost:3000").unwrap(),
    };
    person.add_passkey(&gov, &setup.link).await;
    let session = person.sign_in(&gov, "hiddenstack").await;
    let you = Credential::Session(session.clone());
    let who = client.who(&you).await.unwrap();
    assert_eq!(
        (who.handle.as_str(), who.kind.as_str()),
        ("hiddenstack", "person")
    );
    let me = Actor {
        subject: who.handle.clone(),
    };

    // Signed out: nothing, since no one has granted visitors a role.
    let visitors = Actor {
        subject: client.who(&Credential::Visitor).await.unwrap().handle,
    };
    denied(
        with(Credential::Visitor, None).snapshot(&visitors).await,
        "no grant",
    );
    // Signed in as a maintainer, Mero reads for you.
    with(you.clone(), None).snapshot(&me).await.unwrap();
    // Mero writes the name Governance gives; any other name is refused.
    denied(
        with(you.clone(), None)
            .snapshot(&Actor {
                subject: "local-maintainer".into(),
            })
            .await,
        "someone else",
    );
    // A made-up credential is no one.
    assert!(client
        .who(&Credential::Session("made-up".into()))
        .await
        .is_err());

    // An agent: vouched for by this Mac, sponsored by you, allowed to propose in Invariants only.
    let (pem, public) = new_voucher_key();
    gov.add_voucher("hyperbase:this-mac", &public)
        .await
        .unwrap();
    let t = person
        .touch_for(
            &gov,
            &session,
            "add-agent",
            &[Target::Path("noi".into())],
            Some(json!({"handle": "design-agent"})),
        )
        .await;
    let agent_id = gov
        .add_agent(
            &you,
            Some(t),
            "design-agent",
            "Design agent",
            "Proposes changes",
            "hiddenstack",
            "hyperbase:this-mac",
        )
        .await
        .unwrap();
    let proposing = GrantSpec {
        role: "noi.gov.roles.proposer".into(),
        scope: "noi.inv".into(),
    };
    let t = person
        .touch_for(
            &gov,
            &session,
            "grant",
            &[Target::Account(agent_id)],
            Some(grant_about(&proposing)),
        )
        .await;
    gov.grant(&you, Some(t), "design-agent", &proposing)
        .await
        .unwrap();
    let v = vouch(
        &pem,
        "hyperbase:this-mac",
        "design-agent",
        "run-1",
        Some("hiddenstack"),
    )
    .unwrap();
    let run = Credential::RunToken(client.run_token(&v).await.unwrap());
    let agent = Actor {
        subject: client.who(&run).await.unwrap().handle,
    };
    assert_eq!(agent.subject, "design-agent");
    let as_agent = with(run.clone(), None);

    // The agent proposes in Invariants; outside it, it is refused.
    denied(
        as_agent
            .propose_batch(
                &agent,
                batch("Outside", vec![add(meron(gov_scope, "noi.gov.outside"))]),
            )
            .await,
        "no grant",
    );
    let sent = as_agent
        .propose_batch(
            &agent,
            batch("Step 3", vec![add(meron(inv_scope, "noi.inv.step-three"))]),
        )
        .await
        .unwrap();
    assert_eq!(sent.proposer, "design-agent");
    assert_eq!(
        sent.proposals[0].outcome["ok"],
        json!(true),
        "{}",
        sent.proposals[0].outcome
    );
    // Agents never approve.
    denied(as_agent.approve(&agent, &[sent.uid]).await, "");
    // Reading Review is its own action (9 Nov, step 6): this agent may propose, and gets its batch
    // back, but may not read Review; a maintainer may, and sees the batch's places and the count.
    denied(as_agent.review(&agent).await, "read-review");
    let seen = with(you.clone(), None).review(&me).await.unwrap();
    let mine = seen.iter().find(|b| b.uid == sent.uid).unwrap();
    assert_eq!(
        mine.places,
        vec!["noi.inv".to_string(), "noi.inv.step-three".to_string()]
    );
    assert!(with(you.clone(), None).waiting(&me).await.unwrap() >= 1);
    denied(as_agent.waiting(&agent).await, "read-review");
    // Only one place and what is under it, for Governance's pages.
    let gov_only = with(you.clone(), None)
        .snapshot_under(&me, Some("noi.gov"))
        .await
        .unwrap();
    assert!(!gov_only.merons.is_empty());
    assert!(gov_only
        .merons
        .iter()
        .all(|m| m.identity.path == "noi.gov" || m.identity.path.starts_with("noi.gov.")));
    assert!(with(you.clone(), None)
        .snapshot_under(&me, Some("noi.gov%"))
        .await
        .is_err());

    // Approving: without a touch the fresh-touch rule says no.
    denied(
        with(you.clone(), None).approve(&me, &[sent.uid]).await,
        "fresh-touch",
    );
    // Mero says what approving will ask about: exactly what the touch must be for.
    let places = with(you.clone(), None)
        .review_places(&me, &[sent.uid], true)
        .await
        .unwrap();
    assert_eq!(
        places,
        vec!["noi.inv".to_string(), "noi.inv.step-three".to_string()]
    );
    let targets: Vec<Target> = places.iter().cloned().map(Target::Path).collect();
    // A touch for something else is refused.
    let wrong = person
        .touch(&gov, &session, "review", &[Target::Path("noi.inv".into())])
        .await;
    denied(
        with(you.clone(), Some(wrong))
            .approve(&me, &[sent.uid])
            .await,
        "touch",
    );
    // A touch names the decision and each proposal at its revision (9 Nov, step 7): one made to
    // send it back, on the same places, does not approve it.
    let (_, back) = with(you.clone(), None)
        .review_places_for(&me, &[sent.uid], true, Some("send-back"))
        .await
        .unwrap();
    let to_send_back = person
        .touch_for(&gov, &session, "review", &targets, back)
        .await;
    denied(
        with(you.clone(), Some(to_send_back))
            .approve(&me, &[sent.uid])
            .await,
        "touch",
    );
    // The right touch approves the whole batch.
    let (_, about) = with(you.clone(), None)
        .review_places_for(&me, &[sent.uid], true, Some("approve"))
        .await
        .unwrap();
    assert_eq!(about.as_ref().unwrap()["decision"], "approve");
    let touch = person
        .touch_for(&gov, &session, "review", &targets, about)
        .await;
    let approved = with(you.clone(), Some(touch))
        .approve(&me, &[sent.uid])
        .await
        .unwrap();
    assert_eq!(approved.len(), 1);
    assert_eq!(approved[0].state, ProposalState::Approved);
    assert_eq!(approved[0].decided_by.as_deref(), Some("hiddenstack"));

    // One approval, one question: every step inside it carries the approval's one record number.
    let uid: Uuid =
        serde_json::from_value(approved[0].outcome["meron"]["identity"]["uid"].clone()).unwrap();
    let history = with(you.clone(), None).history(&me, uid).await.unwrap();
    let references: std::collections::HashSet<String> = history
        .iter()
        .map(|e| e.authorization["reference"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(references.len(), 1, "{references:?}");
    assert!(references
        .iter()
        .next()
        .unwrap()
        .starts_with("governance:record:"));
    assert!(history
        .iter()
        .any(|e| e.action == "meron.propose" && e.actor == "design-agent"));
    assert!(history
        .iter()
        .any(|e| e.action == "meron.transition" && e.actor == "hiddenstack"));
    let m = with(you.clone(), None)
        .get(&me, "noi.inv.step-three")
        .await
        .unwrap();
    assert_eq!(m.lifecycle.state, MeronState::Active);

    // A change that changes nothing is refused before it reaches Review.
    let same = NewMeron {
        path: m.identity.path.clone(),
        name: m.identity.name.clone(),
        classification: m.classification.clone(),
        semantics: m.semantics.clone(),
        release_mode: m.lifecycle.release_mode,
        authority_scope: Some(m.authority_scope),
        metadata: m.metadata.clone(),
        spec: m.spec.clone(),
    };
    let evidence = CompatibilityEvidence {
        impact: Impact::NonBreaking,
        rationale: "Nothing, on purpose".into(),
        invariant_checks: vec!["none".into()],
        migration_plan: None,
    };
    let nothing = Change::Update {
        uid: m.identity.uid,
        expected_revision: m.revision,
        meron: same.clone(),
        compatibility: evidence.clone(),
    };
    match with(you.clone(), None)
        .propose_batch(&me, batch("Nothing", vec![nothing]))
        .await
    {
        Err(Error::Validation(e)) => assert!(e.to_string().contains("changes nothing"), "{e}"),
        other => panic!("a change that changes nothing was not refused: {other:?}"),
    }
    let in_place = Change::Rename {
        uid: m.identity.uid,
        expected_revision: m.revision,
        path: m.identity.path.clone(),
    };
    match with(you.clone(), None)
        .propose_batch(&me, batch("Same path", vec![in_place]))
        .await
    {
        Err(Error::Validation(e)) => assert!(e.to_string().contains("already at this path"), "{e}"),
        other => panic!("a rename to the same path was not refused: {other:?}"),
    }
    // One real difference is enough.
    let mut renamed = same;
    renamed.name = "Step 3 meron, renamed".into();
    let real = Change::Update {
        uid: m.identity.uid,
        expected_revision: m.revision,
        meron: renamed,
        compatibility: evidence,
    };
    with(you.clone(), None)
        .propose_batch(&me, batch("Something", vec![real]))
        .await
        .unwrap();

    // The touch counted once.
    let again = as_agent
        .propose_batch(
            &agent,
            batch("Again", vec![add(meron(inv_scope, "noi.inv.again"))]),
        )
        .await
        .unwrap();
    denied(
        with(you.clone(), Some(touch))
            .approve(&me, &[again.uid])
            .await,
        "touch",
    );

    // Cedar the form didn't write asks "write Cedar", with a touch (9 Nov, step 7): refused
    // without one, proposed with one made for it.
    let mut by_hand = meron(gov_scope, "noi.gov.rules.by-hand");
    by_hand.classification = Classification {
        kind: MeronType::Rule,
        subtype: Some("policy".into()),
        roles: vec![],
    };
    by_hand.spec = json!({"cedar": "forbid (principal, action, resource) when { context.fresh_signature && !context.fresh_signature };"});
    let by_hand_batch = || batch("By hand", vec![add(by_hand.clone())]);
    denied(
        with(you.clone(), None)
            .propose_batch(&me, by_hand_batch())
            .await,
        "fresh-touch",
    );
    let written = vec![Target::Path("noi.gov.rules.by-hand".into())];
    let t = person
        .touch_for(&gov, &session, "write-cedar", &written, None)
        .await;
    let mut with_touch = by_hand_batch();
    with_touch.touch = Some(t);
    assert!(with(you.clone(), Some(t))
        .propose_batch(&me, with_touch)
        .await
        .is_ok());
    // Revising asks it too (10 Nov): a rule the form wrote can't be revised into Cedar written by
    // hand without that touch.
    let mut formed = by_hand.clone();
    formed.path = "noi.gov.rules.formed".into();
    formed.spec = json!({"cedar": noi_gov::form::write_rule(&noi_gov::form::RuleForm {
        effect: noi_gov::form::Effect::Forbid,
        who: noi_gov::form::Who::Anyone,
        doing: vec![noi_gov::form::Doing {
            system: "mero".into(),
            pick: noi_gov::form::Pick::These { verbs: vec!["transition".into()] },
        }],
        place: noi_gov::form::Where::Everywhere,
        unless: vec![],
    })
    .unwrap()});
    let waiting = with(you.clone(), None)
        .propose_batch(&me, batch("Formed", vec![add(formed.clone())]))
        .await
        .unwrap();
    let mut rewritten = formed.clone();
    rewritten.spec = by_hand.spec.clone();
    denied(
        with(you.clone(), None)
            .revise(&me, waiting.proposals[0].uid, add(rewritten), None)
            .await,
        "fresh-touch",
    );
    // Governance's record holds every answer Mero asked for, refusals too, but not an allowed read
    // (agreed 9 Nov, finding I).
    let mut sql = PgConnection::connect(url).await.unwrap();
    let asked: Vec<(Option<String>, bool)> =
        sqlx::query_as("SELECT action, allowed FROM gov.record WHERE kind = 'decision'")
            .fetch_all(&mut sql)
            .await
            .unwrap();
    // Approving asked what each change does too (9 Nov, step 7): a new meron is linked into its
    // container and moved to active.
    for action in ["relate", "transition"] {
        assert!(
            asked
                .iter()
                .any(|(a, ok)| a.as_deref() == Some(action) && *ok),
            "{action} asked on approval"
        );
    }
    for action in ["read", "propose", "review"] {
        assert_eq!(
            asked
                .iter()
                .any(|(a, ok)| a.as_deref() == Some(action) && *ok),
            action != "read",
            "{action} allowed"
        );
        // The one refused read here was a visitor's, which is no longer recorded (10 Nov).
        assert_eq!(
            asked
                .iter()
                .any(|(a, ok)| a.as_deref() == Some(action) && !*ok),
            action != "read",
            "{action} refused"
        );
    }

    // Governance down: Mero refuses everything, reading too.
    let down = GovernanceClient::new("http://127.0.0.1:9");
    let gone = mero
        .clone()
        .with_authorizer(Arc::new(down.asking(you.clone(), None)));
    denied(gone.snapshot(&me).await, "did not answer");
    denied(
        gone.propose_batch(
            &me,
            batch("Down", vec![add(meron(inv_scope, "noi.inv.down"))]),
        )
        .await,
        "did not answer",
    );
    let _: Value = json!(null);
}
