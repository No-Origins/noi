//! Roles and rules kept by Governance (build order step 3, agreed 9 Nov 2026: "Where Roles and
//! Rules Live"), on real PostgreSQL, with a software passkey standing in for Touch ID: every version
//! kept, proposals approved by an owner with a touch, nobody locked out, the recovery command, and
//! the move refusing a Governance that holds roles and rules already. Creates a disposable database
//! and drops it; never touches the shared one.
//! Explicit opt-in: NOI_TEST_ADMIN_URL=... cargo test -p noi-gov --features server --test roles -- --ignored
#![cfg(feature = "server")]
use noi_gov::form::{
    write_role, write_rule, Condition, Doing, Effect, Pick, RoleForm, RuleForm, Where, Who,
};
use noi_gov::moving::MoveFile;
use noi_gov::server::{
    decide_about, grant_about, http, invite_about, new_voucher_key, vouch, Config, Credential,
    Decide, Draft, Governance, GrantSpec, Mailer, Target,
};
use serde_json::{json, Value};
use sqlx::{Connection, Executor, PgConnection};
use url::Url;
use uuid::Uuid;
use webauthn_authenticator_rs::{prelude::WebauthnAuthenticator, softpasskey::SoftPasskey};

fn gov_page() -> Url {
    Url::parse("https://gov.no-origins.localhost:3000").unwrap()
}
fn mero_page() -> Url {
    Url::parse("https://mero.no-origins.localhost:3000").unwrap()
}
fn path(p: &str) -> Target {
    Target::Path(p.into())
}
fn draft(v: Value) -> Draft {
    serde_json::from_value(v).unwrap()
}

/// You, with a software passkey.
struct Person {
    key: SoftPasskey,
}
impl Person {
    async fn add_passkey(&mut self, gov: &Governance, link: &str) {
        let s = gov
            .link_start(link.rsplit('#').next().unwrap())
            .await
            .unwrap();
        let c = self.key.do_registration(gov_page(), s.options).unwrap();
        gov.link_finish(s.ceremony, &c, "Soft passkey")
            .await
            .unwrap();
    }
    async fn sign_in(&mut self, gov: &Governance, handle: &str) -> String {
        let s = gov.sign_in_start(handle).await.unwrap();
        let c = self.key.do_authentication(gov_page(), s.options).unwrap();
        gov.sign_in_finish(s.ceremony, &c).await.unwrap()
    }
    async fn touch(
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
        let c = self.key.do_authentication(mero_page(), s.options).unwrap();
        gov.touch_finish(session, s.ceremony, &c).await.unwrap()
    }
    /// The touch to decide one proposal on its place.
    async fn touch_to_decide(
        &mut self,
        gov: &Governance,
        session: &str,
        place: &str,
        decide: Decide,
        proposal: Uuid,
    ) -> Uuid {
        self.touch(
            gov,
            session,
            "review",
            &[path(place)],
            Some(decide_about(decide, proposal)),
        )
        .await
    }
}

/// The two checks run one after the other, each on a database and login of its own, dropped after:
/// on a new Postgres, two migrations at once would both make Governance's runtime role, and one
/// would fail (seen on GitHub, 21 Nov).
#[tokio::test]
#[ignore = "requires a reachable PostgreSQL admin URL and CREATE DATABASE; see noi/docs/verification.md"]
async fn roles_and_rules_on_real_postgres() {
    let admin = std::env::var("NOI_TEST_ADMIN_URL").expect("set NOI_TEST_ADMIN_URL explicitly");
    for check in ["roles", "move"] {
        let name = format!("noi_{check}_test_{}", Uuid::new_v4().simple());
        let mut admin_conn = PgConnection::connect(&admin).await.unwrap();
        admin_conn
            .execute(format!("CREATE DATABASE {name}").as_str())
            .await
            .unwrap();
        let mut opts: sqlx::postgres::PgConnectOptions = admin.parse().unwrap();
        opts = opts.database(&name);
        let url = sqlx::ConnectOptions::to_url_lossy(&opts).to_string();
        let login = format!("noi_{check}_test_login_{}", Uuid::new_v4().simple());
        let task = tokio::spawn({
            let login = login.clone();
            async move {
                match check {
                    "roles" => verify(&url, &login).await,
                    _ => verify_move(&url, &login).await,
                }
            }
        });
        let result = task.await;
        admin_conn
            .execute(format!("DROP DATABASE {name} WITH (FORCE)").as_str())
            .await
            .unwrap();
        admin_conn
            .execute(format!("DROP ROLE IF EXISTS {login}").as_str())
            .await
            .unwrap();
        if let Err(e) = result {
            std::panic::resume_unwind(e.into_panic());
        }
    }
}

async fn verify(url: &str, login: &str) {
    // Governance's API on a port of its own, as it runs live, and as a login holding only its own
    // role's rights.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let config = Config {
        origin: Url::parse(&format!("http://localhost:{port}")).unwrap(),
        pages: Url::parse("https://gov.no-origins.localhost:3000").unwrap(),
        domain: "no-origins.localhost".into(),
        mail: Mailer::None,
    };
    let owner = Governance::connect(url, config.clone()).await.unwrap();
    owner.migrate().await.unwrap();
    owner.migrate().await.unwrap();
    let mut sql = PgConnection::connect(url).await.unwrap();
    sql.execute(
        format!("CREATE ROLE {login} LOGIN PASSWORD 'test-only' IN ROLE noi_gov_runtime").as_str(),
    )
    .await
    .unwrap();
    let runtime: sqlx::postgres::PgConnectOptions = url.parse().unwrap();
    let runtime =
        sqlx::ConnectOptions::to_url_lossy(&runtime.username(login).password("test-only"))
            .to_string();
    let gov = Governance::connect(&runtime, config).await.unwrap();
    let app = http::router(gov.clone());
    tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .await
    });

    // You, the first owner: setup gives Governance its first roles and rules.
    let setup = gov
        .setup("hiddenstack", "Ada", "ada@example.com")
        .await
        .unwrap();
    let mut you = Person {
        key: SoftPasskey::new(true),
    };
    you.add_passkey(&gov, &setup.link).await;
    let session = you.sign_in(&gov, "hiddenstack").await;
    let you_c = Credential::Session(session.clone());
    let your_id: Uuid =
        serde_json::from_value(gov.me(&you_c).await.unwrap()["account"].clone()).unwrap();

    // 1 · Governance holds roles and rules itself, every version (decision 1). Signed out with no
    // reading given, nothing; signed in, every role and rule in force.
    assert!(gov.roles_and_rules(&Credential::Visitor).await.is_err());
    let held = gov.roles_and_rules(&you_c).await.unwrap();
    assert_eq!(held["roles"].as_array().unwrap().len(), 2);
    assert_eq!(held["rules"].as_array().unwrap().len(), 2);
    assert_eq!(held["version"], 4);
    assert_eq!(held["roles"][1]["verbs"], json!(["governance"]));
    let versions = gov.versions(&you_c, "noi.gov.roles.owner").await.unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(versions[0].came, "setup");
    // Versions are never changed or removed.
    assert!(sql
        .execute("UPDATE gov.versions SET state = 'retired'")
        .await
        .is_err());
    assert!(sql.execute("DELETE FROM gov.versions").await.is_err());

    // 2 · A new role, proposed with the form's Cedar (decision 2): no touch to propose it.
    let proposer = write_role(&RoleForm {
        system: "mero".into(),
        pick: Pick::These {
            verbs: vec!["read".into(), "propose".into()],
        },
    })
    .unwrap();
    let new_role = draft(json!({
        "operation": "add", "path": "noi.gov.roles.proposer", "name": "Proposer",
        "definition": "Reading Mero and proposing changes.", "responsibility": "Suggest; never decide.",
        "system": "mero", "cedar": proposer, "why": "Agents propose.",
    }));
    let p = gov.propose(&you_c, None, &new_role).await.unwrap();
    assert_eq!(
        (p.state.as_str(), p.by_hand, p.stale),
        ("waiting", false, false)
    );
    assert!(p.before.is_none());
    // Proposed twice, the second is refused once the first is approved; and a new role that
    // exists already is refused at once later on.
    let waiting = gov.proposals(&you_c, false).await.unwrap();
    assert_eq!(waiting.len(), 1);
    assert_eq!(waiting[0].proposed_by, "hiddenstack");
    // Approving needs a fresh touch for exactly this decision on exactly this proposal.
    assert!(gov
        .decide_proposal(&you_c, None, p.id, Decide::Approve, "")
        .await
        .unwrap_err()
        .to_string()
        .contains("fresh-touch"));
    let to_send_back = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.roles.proposer",
            Decide::SendBack,
            p.id,
        )
        .await;
    assert!(gov
        .decide_proposal(&you_c, Some(to_send_back), p.id, Decide::Approve, "")
        .await
        .unwrap_err()
        .to_string()
        .contains("touch"));
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.roles.proposer",
            Decide::Approve,
            p.id,
        )
        .await;
    let done = gov
        .decide_proposal(&you_c, Some(t), p.id, Decide::Approve, "")
        .await
        .unwrap();
    assert_eq!(
        (done["revision"].as_i64(), done["state"].as_str()),
        (Some(1), Some("active"))
    );
    assert!(gov
        .decide_proposal(&you_c, None, p.id, Decide::Reject, "late")
        .await
        .unwrap_err()
        .to_string()
        .contains("approved already"));
    assert_eq!(
        gov.roles_and_rules(&you_c).await.unwrap()["roles"]
            .as_array()
            .unwrap()
            .len(),
        3,
        "it counts from the next request"
    );
    assert!(gov
        .propose(&you_c, None, &new_role)
        .await
        .unwrap_err()
        .to_string()
        .contains("exists already"));

    // 3 · An agent may propose where its role lets it, and never approve.
    let (pem, public) = new_voucher_key();
    gov.add_voucher("hyperbase:this-mac", &public)
        .await
        .unwrap();
    let t = you
        .touch(
            &gov,
            &session,
            "add-agent",
            &[path("noi")],
            Some(json!({"handle": "design-agent"})),
        )
        .await;
    let agent_id = gov
        .add_agent(
            &you_c,
            Some(t),
            "design-agent",
            "Design agent",
            "Proposes",
            "hiddenstack",
            "hyperbase:this-mac",
        )
        .await
        .unwrap();
    let proposing = GrantSpec {
        role: "noi.gov.roles.proposer".into(),
        scope: "noi".into(),
    };
    let t = you
        .touch(
            &gov,
            &session,
            "grant",
            &[Target::Account(agent_id)],
            Some(grant_about(&proposing)),
        )
        .await;
    gov.grant(&you_c, Some(t), "design-agent", &proposing)
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
    let (run, _) = gov.run_token(&v).await.unwrap();
    let agent = Credential::RunToken(run);
    let renamed = |name: &str, base: i64| {
        draft(json!({
            "operation": "change", "path": "noi.gov.roles.proposer", "base_revision": base,
            "name": name, "definition": "Reading Mero and proposing changes.",
            "responsibility": "Suggest; never decide.", "system": "mero", "cedar": proposer,
            "why": "A clearer name.",
        }))
    };
    let by_agent = gov
        .propose(&agent, None, &renamed("Proposer of changes", 1))
        .await
        .unwrap();
    assert_eq!(by_agent.proposed_by, "design-agent");
    assert_eq!(by_agent.before.as_ref().unwrap().revision, 1);
    assert!(gov
        .decide_proposal(&agent, None, by_agent.id, Decide::Approve, "")
        .await
        .is_err());
    // Nothing that changes nothing.
    assert!(gov
        .propose(&you_c, None, &renamed("Proposer", 1))
        .await
        .unwrap_err()
        .to_string()
        .contains("nothing in it changes"));

    // 4 · Two proposals from one revision: once one is approved, the other is stale.
    let yours = gov
        .propose(&you_c, None, &renamed("Proposer, for agents", 1))
        .await
        .unwrap();
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.roles.proposer",
            Decide::Approve,
            by_agent.id,
        )
        .await;
    gov.decide_proposal(&you_c, Some(t), by_agent.id, Decide::Approve, "")
        .await
        .unwrap();
    let stale = gov.proposal(&you_c, yours.id).await.unwrap();
    assert!(stale.stale);
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.roles.proposer",
            Decide::Approve,
            yours.id,
        )
        .await;
    assert!(gov
        .decide_proposal(&you_c, Some(t), yours.id, Decide::Approve, "")
        .await
        .unwrap_err()
        .to_string()
        .contains("stale"));
    // Sending back needs a note, and its own touch.
    assert!(gov
        .decide_proposal(&you_c, None, yours.id, Decide::SendBack, " ")
        .await
        .unwrap_err()
        .to_string()
        .contains("write a note"));
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.roles.proposer",
            Decide::SendBack,
            yours.id,
        )
        .await;
    gov.decide_proposal(
        &you_c,
        Some(t),
        yours.id,
        Decide::SendBack,
        "Start from revision 2.",
    )
    .await
    .unwrap();
    let back = gov.proposal(&you_c, yours.id).await.unwrap();
    assert_eq!(
        (back.state.as_str(), back.note.as_deref()),
        ("sent-back", Some("Start from revision 2."))
    );
    let history = gov
        .versions(&you_c, "noi.gov.roles.proposer")
        .await
        .unwrap();
    assert_eq!(
        history.iter().map(|v| v.revision).collect::<Vec<_>>(),
        [2, 1]
    );
    assert_eq!(history[0].name, "Proposer of changes");
    assert_eq!(history[0].approved_by.as_deref(), Some("hiddenstack"));
    assert_eq!(history[0].why.as_deref(), Some("A clearer name."));
    // Review 5: approving the change also asked `update` of the approver, as Mero did.
    let asked: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM gov.record WHERE kind = 'decision' AND action = 'update' AND allowed
         AND resources = '[\"noi.gov.roles.proposer\"]'",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert!(asked >= 1, "update asked on approval");

    // 5 · Cedar the form can't read is for owners, with a touch for writing it (as in Mero before).
    let by_hand = draft(json!({
        "operation": "add", "path": "noi.gov.rules.by-hand", "name": "By hand",
        "definition": "A rule the form can't say.", "responsibility": "Test.",
        "cedar": "forbid (principal, action, resource) when { context.fresh_signature && !context.fresh_signature };",
        "why": "Owners may write Cedar.",
    }));
    assert!(gov
        .propose(&you_c, None, &by_hand)
        .await
        .unwrap_err()
        .to_string()
        .contains("fresh-touch"));
    assert!(gov.propose(&agent, None, &by_hand).await.is_err());
    let t = you
        .touch(
            &gov,
            &session,
            "write-cedar",
            &[path("noi.gov.rules.by-hand")],
            None,
        )
        .await;
    let hand = gov.propose(&you_c, Some(t), &by_hand).await.unwrap();
    assert!(hand.by_hand);
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.rules.by-hand",
            Decide::Reject,
            hand.id,
        )
        .await;
    gov.decide_proposal(&you_c, Some(t), hand.id, Decide::Reject, "Not needed.")
        .await
        .unwrap();

    // 6 · Nobody is locked out (decision 4): a rule that would stop every owner approving roles and
    // rules is refused when approved, recorded, and the touch is not spent.
    let no_approving = draft(json!({
        "operation": "add", "path": "noi.gov.rules.no-approving", "name": "No approving",
        "definition": "Nobody approves in noi.gov.", "responsibility": "Test.",
        "cedar": "forbid (\n  principal,\n  action == Action::\"review\",\n  resource in Scope::\"noi.gov\"\n);",
        "why": "To see the lockout check.",
    }));
    let lock = gov.propose(&you_c, None, &no_approving).await.unwrap();
    assert!(!lock.by_hand, "the form can say it");
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.rules.no-approving",
            Decide::Approve,
            lock.id,
        )
        .await;
    let refused = gov
        .decide_proposal(&you_c, Some(t), lock.id, Decide::Approve, "")
        .await
        .unwrap_err()
        .to_string();
    assert!(refused.contains("nobody is locked out"), "{refused}");
    assert_eq!(
        gov.proposal(&you_c, lock.id).await.unwrap().state,
        "waiting"
    );
    let recorded: (bool, String) = sqlx::query_as(
        "SELECT allowed, reason FROM gov.record WHERE kind = 'approve' ORDER BY seq DESC LIMIT 1",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert!(!recorded.0 && recorded.1.contains("nobody is locked out"));
    let reject = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.rules.no-approving",
            Decide::Reject,
            lock.id,
        )
        .await;
    gov.decide_proposal(
        &you_c,
        Some(reject),
        lock.id,
        Decide::Reject,
        "It would lock us out.",
    )
    .await
    .unwrap();
    // Ending your own Maintainer would do the same: refused too.
    let maintainer: Uuid = sqlx::query_scalar(
        "SELECT id FROM gov.grants WHERE account = $1 AND role = 'noi.gov.roles.maintainer' AND ended_at IS NULL",
    )
    .bind(your_id)
    .fetch_one(&mut sql)
    .await
    .unwrap();
    let t = you
        .touch(
            &gov,
            &session,
            "end-grant",
            &[Target::Account(your_id)],
            Some(json!({"grant": maintainer})),
        )
        .await;
    assert!(gov
        .end_grant(&you_c, Some(t), maintainer)
        .await
        .unwrap_err()
        .to_string()
        .contains("no one could change roles and rules"));
    // Review 6: and the refusal is in the record.
    let kept: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM gov.record WHERE kind = 'end-grant' AND NOT allowed",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert_eq!(kept, 1);

    // Review 1: a rule that stops approving one role only (here Owner) is a lockout too.
    let rule = |name: &str, who: Who, place: &str| {
        let cedar = write_rule(&RuleForm {
            effect: Effect::Forbid,
            who,
            doing: vec![Doing {
                system: "mero".into(),
                pick: Pick::These {
                    verbs: vec!["review".into()],
                },
            }],
            place: Where::Place(place.into()),
            unless: vec![],
        })
        .unwrap();
        draft(json!({
            "operation": "add", "path": format!("noi.gov.rules.{name}"), "name": name,
            "definition": "A test rule.", "responsibility": "Test.", "cedar": cedar, "why": "To test the lockout check.",
        }))
    };
    let lock_b = gov
        .propose(
            &you_c,
            None,
            &rule("lock-b", Who::Anyone, "noi.gov.roles.owner"),
        )
        .await
        .unwrap();
    assert!(!lock_b.by_hand);
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.rules.lock-b",
            Decide::Approve,
            lock_b.id,
        )
        .await;
    let refused = gov
        .decide_proposal(&you_c, Some(t), lock_b.id, Decide::Approve, "")
        .await
        .unwrap_err()
        .to_string();
    assert!(refused.contains("nobody is locked out"), "{refused}");

    // Second review, A: a rule on proposing that asks a touch, which proposing never carries. It
    // reads as "proposing needs a touch"; approved, no proposal could ever be made again.
    let cedar_of = |verb: &str, place: &str, unless: Vec<Condition>| {
        write_rule(&RuleForm {
            effect: Effect::Forbid,
            who: Who::Anyone,
            doing: vec![Doing {
                system: "mero".into(),
                pick: Pick::These {
                    verbs: vec![verb.into()],
                },
            }],
            place: Where::Place(place.into()),
            unless,
        })
        .unwrap()
    };
    let approve_refused =
        |cedar: String, name: &'static str, touch_for_cedar: Option<Uuid>| {
            let gov = gov.clone();
            let you_c = you_c.clone();
            async move {
                let p = gov
                .propose(&you_c, touch_for_cedar, &draft(json!({
                    "operation": "add", "path": format!("noi.gov.rules.{name}"), "name": name,
                    "definition": "A test rule.", "responsibility": "Test.", "cedar": cedar,
                    "why": "To test the lockout check through the server.",
                })))
                .await
                .unwrap();
                p
            }
        };
    let propose_touch = approve_refused(
        cedar_of("propose", "noi.gov", vec![Condition::FreshTouch]),
        "propose-touch",
        None,
    )
    .await;
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.rules.propose-touch",
            Decide::Approve,
            propose_touch.id,
        )
        .await;
    let refused = gov
        .decide_proposal(&you_c, Some(t), propose_touch.id, Decide::Approve, "")
        .await
        .unwrap_err()
        .to_string();
    assert!(refused.contains("nobody is locked out"), "{refused}");
    // Review 1, through the server: a rule that stops approving its own place can never be retired.
    let self_lock = approve_refused(
        cedar_of("review", "noi.gov.rules.self-lock", vec![]),
        "self-lock",
        None,
    )
    .await;
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.rules.self-lock",
            Decide::Approve,
            self_lock.id,
        )
        .await;
    let refused = gov
        .decide_proposal(&you_c, Some(t), self_lock.id, Decide::Approve, "")
        .await
        .unwrap_err()
        .to_string();
    assert!(refused.contains("nobody is locked out"), "{refused}");
    // Review 1, through the server: approving allowed only on the two places above, nowhere real
    // (written by hand, so its touch for writing Cedar first).
    let only_above = r#"forbid (principal, action == Action::"review", resource in Scope::"noi.gov") unless { resource == Scope::"noi.gov.roles" || resource == Scope::"noi.gov.rules" };"#.to_string();
    let t = you
        .touch(
            &gov,
            &session,
            "write-cedar",
            &[path("noi.gov.rules.only-above")],
            None,
        )
        .await;
    let above = approve_refused(only_above, "only-above", Some(t)).await;
    assert!(above.by_hand);
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.rules.only-above",
            Decide::Approve,
            above.id,
        )
        .await;
    let refused = gov
        .decide_proposal(&you_c, Some(t), above.id, Decide::Approve, "")
        .await
        .unwrap_err()
        .to_string();
    assert!(refused.contains("nobody is locked out"), "{refused}");

    // Review 6: giving a role can lock everyone out too. A role no one holds, a rule that stops its
    // holders approving roles and rules, and that role given to the only owner: refused, and recorded.
    let marked = write_role(&RoleForm {
        system: "mero".into(),
        pick: Pick::These {
            verbs: vec!["read".into()],
        },
    })
    .unwrap();
    let role = gov
        .propose(&you_c, None, &draft(json!({
            "operation": "add", "path": "noi.gov.roles.marked", "name": "Marked", "definition": "A test role.",
            "responsibility": "Test.", "system": "mero", "cedar": marked, "why": "To test giving a role.",
        })))
        .await
        .unwrap();
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.roles.marked",
            Decide::Approve,
            role.id,
        )
        .await;
    gov.decide_proposal(&you_c, Some(t), role.id, Decide::Approve, "")
        .await
        .unwrap();
    let never = gov
        .propose(
            &you_c,
            None,
            &rule(
                "marked-never-approve",
                Who::Role("marked".into()),
                "noi.gov",
            ),
        )
        .await
        .unwrap();
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.rules.marked-never-approve",
            Decide::Approve,
            never.id,
        )
        .await;
    gov.decide_proposal(&you_c, Some(t), never.id, Decide::Approve, "")
        .await
        .unwrap();
    let giving = GrantSpec {
        role: "noi.gov.roles.marked".into(),
        scope: "noi".into(),
    };
    let t = you
        .touch(
            &gov,
            &session,
            "grant",
            &[Target::Account(your_id)],
            Some(grant_about(&giving)),
        )
        .await;
    let refused = gov
        .grant(&you_c, Some(t), "hiddenstack", &giving)
        .await
        .unwrap_err()
        .to_string();
    assert!(
        refused.contains("no one could change roles and rules"),
        "{refused}"
    );
    let kept: i64 =
        sqlx::query_scalar("SELECT count(*) FROM gov.record WHERE kind = 'grant' AND NOT allowed")
            .fetch_one(&mut sql)
            .await
            .unwrap();
    assert_eq!(kept, 1);

    // Review 5, through the server: a second owner who may review but not update can't approve a
    // change, as in Mero.
    let reviewing = write_role(&RoleForm {
        system: "mero".into(),
        pick: Pick::These {
            verbs: vec![
                "read".into(),
                "read-review".into(),
                "propose".into(),
                "review".into(),
            ],
        },
    })
    .unwrap();
    let r = gov
        .propose(&you_c, None, &draft(json!({
            "operation": "add", "path": "noi.gov.roles.reviewer", "name": "Reviewer", "definition": "A test role.",
            "responsibility": "Test.", "system": "mero", "cedar": reviewing, "why": "To test approving without update.",
        })))
        .await
        .unwrap();
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.roles.reviewer",
            Decide::Approve,
            r.id,
        )
        .await;
    gov.decide_proposal(&you_c, Some(t), r.id, Decide::Approve, "")
        .await
        .unwrap();
    let gives = [
        GrantSpec {
            role: "noi.gov.roles.reviewer".into(),
            scope: "noi".into(),
        },
        GrantSpec {
            role: "noi.gov.roles.owner".into(),
            scope: "noi".into(),
        },
    ];
    let t = you
        .touch(
            &gov,
            &session,
            "invite",
            &[path("noi")],
            Some(invite_about("steward", &gives)),
        )
        .await;
    let link = gov
        .invite(
            &you_c,
            Some(t),
            "steward",
            "Steward",
            "steward@example.com",
            &gives,
        )
        .await
        .unwrap();
    let mut steward = Person {
        key: SoftPasskey::new(true),
    };
    steward.add_passkey(&gov, &link).await;
    let theirs = steward.sign_in(&gov, "steward").await;
    let steward_c = Credential::Session(theirs.clone());
    let rename = gov
        .propose(&you_c, None, &draft(json!({
            "operation": "change", "path": "noi.gov.roles.marked", "base_revision": 1, "name": "Marked, renamed",
            "definition": "A test role.", "responsibility": "Test.", "system": "mero", "cedar": marked,
            "why": "A change for the steward to try.",
        })))
        .await
        .unwrap();
    let t = steward
        .touch_to_decide(
            &gov,
            &theirs,
            "noi.gov.roles.marked",
            Decide::Approve,
            rename.id,
        )
        .await;
    let refused = gov
        .decide_proposal(&steward_c, Some(t), rename.id, Decide::Approve, "")
        .await
        .unwrap_err()
        .to_string();
    assert!(refused.contains("no grant allows update"), "{refused}");

    // Review 10: a proposal can't be changed in the database once made, and a decided one stays
    // decided, even by Governance's own login.
    let mut as_runtime = PgConnection::connect(&runtime).await.unwrap();
    assert!(as_runtime
        .execute(format!("UPDATE gov.proposals SET cedar = 'permit (principal, action, resource);' WHERE id = '{}'", lock_b.id).as_str())
        .await
        .is_err());
    assert!(as_runtime
        .execute(
            format!(
                "UPDATE gov.proposals SET state = 'waiting', decided_at = NULL WHERE id = '{}'",
                hand.id
            )
            .as_str()
        )
        .await
        .is_err());

    // 7 · Retiring a role ends its grants: the agent proposes no more.
    let retire = draft(json!({
        "operation": "retire", "path": "noi.gov.roles.proposer", "base_revision": 2,
        "why": "Not needed.",
    }));
    let r = gov.propose(&you_c, None, &retire).await.unwrap();
    let t = you
        .touch_to_decide(
            &gov,
            &session,
            "noi.gov.roles.proposer",
            Decide::Approve,
            r.id,
        )
        .await;
    let done = gov
        .decide_proposal(&you_c, Some(t), r.id, Decide::Approve, "")
        .await
        .unwrap();
    assert_eq!(
        (done["state"].as_str(), done["ended_grants"].as_u64()),
        (Some("retired"), Some(1))
    );
    assert!(
        !gov.may(&agent, "propose", &[path("noi.inv")], None)
            .await
            .unwrap()
            .allowed
    );
    assert!(
        gov.propose(&you_c, None, &retire).await.is_err(),
        "retired is for good"
    );

    // 8 · The recovery command (decision 4), for the worst case: here a bad rule written straight
    // into the database, past every check. With someone able, it does nothing.
    let nothing = gov.recover("hiddenstack").await.unwrap();
    assert_eq!(nothing["done"], json!([]));
    sql.execute(
        "INSERT INTO gov.versions(path, revision, kind, name, definition, responsibility, cedar, state, came, why)
         VALUES('noi.gov.rules.no-approving', 1, 'rule', 'No approving', 'd', 'r',
                'forbid (principal, action == Action::\"review\", resource in Scope::\"noi.gov\");', 'active', 'recovery', 'a bad edit')",
    )
    .await
    .unwrap();
    let preview = |gov: Governance, c: Credential| async move {
        gov.may_preview(&c, &[("review".into(), vec![path("noi.gov.roles")])])
            .await
            .unwrap()[0]
    };
    assert!(!preview(gov.clone(), you_c.clone()).await, "locked out");
    let recovered = gov.recover("hiddenstack").await.unwrap();
    assert!(
        recovered["done"].as_array().unwrap().iter().any(|d| d
            .as_str()
            .unwrap()
            .contains("noi.gov.rules.no-approving retired")),
        "{recovered}"
    );
    assert!(
        preview(gov.clone(), you_c.clone()).await,
        "back within reach"
    );
    let kinds: Vec<String> =
        sqlx::query_scalar("SELECT kind FROM gov.record WHERE allowed ORDER BY seq")
            .fetch_all(&mut sql)
            .await
            .unwrap();
    for k in [
        "setup",
        "propose",
        "approve",
        "send-back",
        "reject",
        "recover",
    ] {
        assert!(kinds.iter().any(|x| x == k), "{k} is recorded");
    }
    assert!(
        gov.recover("design-agent").await.is_err(),
        "for a person only"
    );
    // Review 4: a refused recovery is in the record too.
    let kept: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM gov.record WHERE kind = 'recover' AND NOT allowed",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert_eq!(kept, 1);

    // 9 · The move runs once, into a Governance that holds none: this one holds its own.
    let file: MoveFile = serde_json::from_value(json!({
        "moved_from": "mero", "written_at": "2026-11-21T00:00:00Z", "roles_and_rules": [{
            "uid": "x", "path": "noi.gov.roles.owner", "subtype": "role", "state": "active", "revision": 1,
            "revisions": [{"revision": 1, "path": "noi.gov.roles.owner", "name": "Owner", "definition": "d",
                "responsibility": "r", "spec": {"system": "governance", "cedar": "permit (principal == ?principal, action in Action::\"governance\", resource in ?resource);"},
                "state": "active", "at": "2026-11-06T00:00:00Z", "by": "hiddenstack", "action": "meron.propose",
                "reference": "governance:record:1"}],
        }],
    }))
    .unwrap();
    assert!(gov
        .move_in(&file)
        .await
        .unwrap_err()
        .to_string()
        .contains("the move runs once"));

    // 10 · Over HTTP, as the app asks: reading needs a sign-in here, and so do the form's Cedar
    // reading and writing, which moved from Mero.
    let client = reqwest::Client::new();
    let at = |p: &str| format!("http://127.0.0.1:{port}{p}");
    let host = format!("localhost:{port}");
    let cookie = format!("noi_session={session}");
    let get = |p: &str, signed_in: bool| {
        let r = client.get(at(p)).header("host", &host);
        if signed_in {
            r.header("cookie", &cookie)
        } else {
            r
        }
    };
    assert_eq!(
        get("/api/roles-and-rules", false)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let read: Value = get("/api/roles-and-rules", true)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        read["roles"].as_array().unwrap().len(),
        4,
        "maintainer, owner, marked and reviewer"
    );
    let listed: Value = get("/api/proposals?all=true", true)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(listed["proposals"].as_array().unwrap().len() >= 5);
    assert_eq!(
        get("/api/proposals", false).send().await.unwrap().status(),
        403
    );
    let one: Value = get(&format!("/api/proposals/{}", yours.id), true)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(one["state"], "sent-back");
    let versions: Value = get(
        "/api/roles-and-rules/versions?path=noi.gov.roles.proposer",
        true,
    )
    .send()
    .await
    .unwrap()
    .json()
    .await
    .unwrap();
    assert_eq!(versions["versions"].as_array().unwrap().len(), 3);
    let cedar_read = |signed_in: bool| {
        let r = client
            .post(at("/api/cedar/read"))
            .header("host", &host)
            .json(&json!({"items": [{"kind": "role", "system": "mero", "cedar": proposer}]}));
        if signed_in {
            r.header("cookie", &cookie)
        } else {
            r
        }
    };
    assert_eq!(cedar_read(false).send().await.unwrap().status(), 403);
    let readings: Value = cedar_read(true).send().await.unwrap().json().await.unwrap();
    assert_eq!(readings["readings"][0]["form"]["pick"], "these");
    let wrote: Value = client
        .post(at("/api/cedar/write"))
        .header("host", &host)
        .header("cookie", &cookie)
        .json(&json!({"kind": "role", "form": readings["readings"][0]["form"]}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(wrote["cedar"], json!(proposer));
    // The copy's door is gone.
    let copy = client
        .post(at("/api/copy"))
        .header("host", &host)
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(copy.status(), 404);
}

/// The four roles and rules every Governance starts with, as files.
fn first_files() -> Vec<Value> {
    [
        "roles/maintainer.json",
        "roles/owner.json",
        "rules/fresh-touch.json",
        "rules/owners-approve-gov.json",
    ]
    .iter()
    .map(|f| {
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/gov")
            .join(f);
        serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap()
    })
    .collect()
}

/// A move file from Mero holding these roles and rules, each proposed, registered and made active
/// (revisions 1 to 3): by `someone` proposed, by hiddenstack approved.
fn move_file(items: &[Value]) -> MoveFile {
    let moving: Vec<Value> = items
        .iter()
        .map(|f| {
            let path = f["path"].as_str().unwrap();
            let role = path.starts_with("noi.gov.roles.");
            let spec = if role { json!({"system": f["system"], "cedar": f["cedar"]}) } else { json!({"cedar": f["cedar"]}) };
            let revision = |n: i64, state: &str, by: &str, action: &str| json!({
                "revision": n, "path": path, "name": f["name"], "definition": f["definition"],
                "responsibility": f["responsibility"], "spec": spec, "state": state,
                "at": format!("2026-11-06T10:0{n}:00Z"), "by": by, "action": action,
                "reference": format!("governance:record:{n}"),
            });
            json!({
                "uid": Uuid::new_v4().to_string(), "path": path, "subtype": if role { "role" } else { "policy" },
                "state": "active", "revision": 3,
                "revisions": [
                    revision(1, "proposed", "someone", "meron.propose"),
                    revision(2, "registered", "hiddenstack", "meron.transition"),
                    revision(3, "active", "hiddenstack", "meron.transition"),
                ],
            })
        })
        .collect();
    serde_json::from_value(json!({"moved_from": "mero", "written_at": "2026-11-21T00:00:00Z", "roles_and_rules": moving})).unwrap()
}

/// As this Mac stands when step 3's migration has run and the move has not: accounts and grants,
/// the last copy of Mero's roles and rules kept aside, and no roles and rules of Governance's own.
async fn verify_move(url: &str, login: &str) {
    let config = Config {
        origin: Url::parse("http://localhost:8788").unwrap(),
        pages: Url::parse("https://gov.no-origins.localhost:3000").unwrap(),
        domain: "no-origins.localhost".into(),
        mail: Mailer::None,
    };
    let owner = Governance::connect(url, config.clone()).await.unwrap();
    owner.migrate().await.unwrap();
    let mut sql = PgConnection::connect(url).await.unwrap();
    sql.execute(
        format!("CREATE ROLE {login} LOGIN PASSWORD 'test-only' IN ROLE noi_gov_runtime").as_str(),
    )
    .await
    .unwrap();
    let runtime: sqlx::postgres::PgConnectOptions = url.parse().unwrap();
    let runtime =
        sqlx::ConnectOptions::to_url_lossy(&runtime.username(login).password("test-only"))
            .to_string();
    let gov = Governance::connect(&runtime, config).await.unwrap();
    let you = Uuid::new_v4();
    sql.execute(
        format!(
            "INSERT INTO gov.accounts(id, handle, display_name, kind, state, email) VALUES('{you}', 'hiddenstack', 'Ada', 'person', 'active', 'ada@example.com');
             INSERT INTO gov.handles(handle, account) VALUES('hiddenstack', '{you}');
             INSERT INTO gov.grants(id, account, role, scope) VALUES ('{}', '{you}', 'noi.gov.roles.maintainer', 'noi'), ('{}', '{you}', 'noi.gov.roles.owner', 'noi');",
            Uuid::new_v4(),
            Uuid::new_v4()
        )
        .as_str(),
    )
    .await
    .unwrap();
    let files = first_files();
    // The last copy Governance decided with before the migration, kept aside by it (review 3).
    let copy: i64 = sqlx::query_scalar("INSERT INTO gov.copies(source, roles, rules, version) VALUES('test', 2, 2, 'test') RETURNING id")
        .fetch_one(&mut sql)
        .await
        .unwrap();
    for f in &files {
        let path = f["path"].as_str().unwrap();
        let kind = if path.starts_with("noi.gov.roles.") {
            "role"
        } else {
            "rule"
        };
        sqlx::query("INSERT INTO gov.last_copy(path, kind, system, cedar, state, revision, copy) VALUES($1,$2,$3,$4,'active',3,$5)")
            .bind(path)
            .bind(kind)
            .bind(f["system"].as_str())
            .bind(f["cedar"].as_str().unwrap())
            .bind(copy)
            .execute(&mut sql)
            .await
            .unwrap();
    }
    let me = Credential::Visitor;
    assert!(
        !gov.may(&me, "read", &[path("noi")], None)
            .await
            .unwrap()
            .allowed
    );

    // Review 2: the recovery command on an empty Governance refuses, and leaves the move possible.
    let refused = gov.recover("hiddenstack").await.unwrap_err().to_string();
    assert!(refused.contains("run setup or the move first"), "{refused}");
    let held: i64 = sqlx::query_scalar("SELECT count(*) FROM gov.versions")
        .fetch_one(&mut sql)
        .await
        .unwrap();
    assert_eq!(held, 0);

    // Review 3: the move must leave in force exactly what the last copy held: path, kind, Cedar,
    // state and revision. A rule missing, or a Cedar that differs, refuses it, and nothing is kept.
    let without_touch: Vec<Value> = files
        .iter()
        .filter(|f| f["path"] != "noi.gov.rules.fresh-touch")
        .cloned()
        .collect();
    let e = gov
        .move_in(&move_file(&without_touch))
        .await
        .unwrap_err()
        .to_string();
    assert!(
        e.contains("not what Governance last decided with")
            && e.contains("noi.gov.rules.fresh-touch"),
        "{e}"
    );
    let mut changed = files.clone();
    changed[2]["cedar"] = json!("forbid (principal, action == Action::\"review\", resource);");
    let e = gov
        .move_in(&move_file(&changed))
        .await
        .unwrap_err()
        .to_string();
    assert!(e.contains("noi.gov.rules.fresh-touch"), "{e}");
    let held: i64 = sqlx::query_scalar("SELECT count(*) FROM gov.versions")
        .fetch_one(&mut sql)
        .await
        .unwrap();
    assert_eq!(held, 0, "nothing kept");
    let file = move_file(&files);
    let moved = gov.move_in(&file).await.unwrap();
    assert_eq!(
        (
            moved["roles"].as_u64(),
            moved["rules"].as_u64(),
            moved["versions"].as_u64()
        ),
        (Some(2), Some(2), Some(12))
    );
    // Review 7: run again, it says it is done, whatever the database's sort order.
    assert_eq!(gov.move_in(&file).await.unwrap()["already"], true);
    // Review 7: revision 1 was proposed, not approved: no approver for it.
    let approvers: Vec<(i64, Option<Uuid>)> = sqlx::query_as(
        "SELECT revision, approved_by FROM gov.versions WHERE path = 'noi.gov.roles.owner' ORDER BY revision",
    )
    .fetch_all(&mut sql)
    .await
    .unwrap();
    assert_eq!(approvers, [(1, None), (2, Some(you)), (3, Some(you))]);

    // Review 4: Cedar that doesn't load stops every answer; recovery retires it, and says so.
    sql.execute(
        "INSERT INTO gov.versions(path, revision, kind, name, definition, responsibility, cedar, state, came, why)
         VALUES('noi.gov.rules.broken', 1, 'rule', 'Broken', 'd', 'r', 'forbid (principal, action, resource) unless {', 'active', 'recovery', 'a bad edit')",
    )
    .await
    .unwrap();
    let no = gov
        .may(&Credential::Visitor, "read", &[path("noi")], None)
        .await
        .unwrap();
    assert!(!no.allowed && no.reason.contains("do not load"), "{no:?}");
    let recovered = gov.recover("hiddenstack").await.unwrap();
    assert!(
        recovered["done"]
            .to_string()
            .contains("noi.gov.rules.broken"),
        "{recovered}"
    );
    // Second review, B: a starting rule that stops loading is written back as first agreed, never
    // retired, or approving would quietly stop needing a touch.
    sql.execute(
        "INSERT INTO gov.versions(path, revision, kind, name, definition, responsibility, cedar, state, came, why)
         VALUES('noi.gov.rules.fresh-touch', 4, 'rule', 'A fresh touch', 'd', 'r', 'forbid (', 'active', 'recovery', 'a bad edit')",
    )
    .await
    .unwrap();
    let recovered = gov.recover("hiddenstack").await.unwrap();
    assert!(
        recovered["done"]
            .to_string()
            .contains("noi.gov.rules.fresh-touch did not load: as first agreed, at revision 5"),
        "{recovered}"
    );
    let touch: (String, String) = sqlx::query_as(
        "SELECT state, cedar FROM gov.policies WHERE path = 'noi.gov.rules.fresh-touch'",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert_eq!(touch.0, "active");
    assert!(touch.1.contains("fresh_signature"));
    // A rule that loads but can't be evaluated is the same.
    sql.execute(
        "INSERT INTO gov.versions(path, revision, kind, name, definition, responsibility, cedar, state, came, why)
         VALUES('noi.gov.rules.erring', 1, 'rule', 'Erring', 'd', 'r', 'forbid (principal, action, resource) when { context.nothing };', 'active', 'recovery', 'a bad edit')",
    )
    .await
    .unwrap();
    let recovered = gov.recover("hiddenstack").await.unwrap();
    assert!(
        recovered["done"]
            .to_string()
            .contains("noi.gov.rules.erring"),
        "{recovered}"
    );
    let in_force: Vec<String> = sqlx::query_scalar("SELECT path FROM gov.policies ORDER BY path")
        .fetch_all(&mut sql)
        .await
        .unwrap();
    assert_eq!(in_force.len(), 4, "{in_force:?}");
    let recorded: i64 =
        sqlx::query_scalar("SELECT count(*) FROM gov.record WHERE kind = 'recover' AND allowed")
            .fetch_one(&mut sql)
            .await
            .unwrap();
    assert_eq!(recorded, 3);
    // The old copy is kept, read only, for a later migration to remove.
    let mut as_runtime = PgConnection::connect(&runtime).await.unwrap();
    assert!(as_runtime
        .execute("DELETE FROM gov.last_copy")
        .await
        .is_err());
}
