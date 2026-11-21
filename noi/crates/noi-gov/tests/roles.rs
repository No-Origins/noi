//! Roles and rules kept by Governance (build order step 3, agreed 9 Nov 2026: "Where Roles and
//! Rules Live"), on real PostgreSQL, with a software passkey standing in for Touch ID: every version
//! kept, proposals approved by an owner with a touch, nobody locked out, the recovery command, and
//! the move refusing a Governance that holds roles and rules already. Creates a disposable database
//! and drops it; never touches the shared one.
//! Explicit opt-in: NOI_TEST_ADMIN_URL=... cargo test -p noi-gov --features server --test roles -- --ignored
#![cfg(feature = "server")]
use noi_gov::form::{write_role, Pick, RoleForm};
use noi_gov::moving::MoveFile;
use noi_gov::server::{
    decide_about, grant_about, http, new_voucher_key, vouch, Config, Credential, Decide, Draft,
    Governance, GrantSpec, Mailer, Target,
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

#[tokio::test]
#[ignore = "requires a reachable PostgreSQL admin URL and CREATE DATABASE; see noi/docs/verification.md"]
async fn roles_and_rules_on_real_postgres() {
    let admin = std::env::var("NOI_TEST_ADMIN_URL").expect("set NOI_TEST_ADMIN_URL explicitly");
    let name = format!("noi_roles_test_{}", Uuid::new_v4().simple());
    let mut admin_conn = PgConnection::connect(&admin).await.unwrap();
    admin_conn
        .execute(format!("CREATE DATABASE {name}").as_str())
        .await
        .unwrap();
    let mut opts: sqlx::postgres::PgConnectOptions = admin.parse().unwrap();
    opts = opts.database(&name);
    let url = sqlx::ConnectOptions::to_url_lossy(&opts).to_string();
    let login = format!("noi_roles_test_login_{}", Uuid::new_v4().simple());
    let task = tokio::spawn({
        let login = login.clone();
        async move { verify(&url, &login).await }
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
    assert_eq!(read["roles"].as_array().unwrap().len(), 2);
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
