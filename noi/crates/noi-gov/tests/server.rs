//! Governance's server on real PostgreSQL, with a software passkey standing in for Touch ID.
//! Creates a disposable database and drops it; never touches the shared one.
//! Explicit opt-in: NOI_TEST_ADMIN_URL=... cargo test -p noi-gov --features server --test server -- --ignored
#![cfg(feature = "server")]
use noi_gov::server::{
    http, new_voucher_key, vouch, Config, Credential, Governance, GrantSpec, RecordFilter, Target,
};
use serde_json::{json, Value};
use sqlx::{Connection, Executor, PgConnection};
use std::{fs, path::Path};
use url::Url;
use uuid::Uuid;
use webauthn_authenticator_rs::{prelude::WebauthnAuthenticator, softpasskey::SoftPasskey};

const ORIGIN: &str = "http://localhost:8788";

fn data(file: &str) -> Value {
    let p = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/gov")
        .join(file);
    serde_json::from_str(&fs::read_to_string(p).unwrap()).unwrap()
}
/// A Mero snapshot holding the given rule merons, as Mero's read API returns them.
fn snapshot(merons: &[(Value, &str)]) -> Value {
    let merons: Vec<Value> = merons
        .iter()
        .map(|(m, state)| {
            json!({"identity": {"path": m["path"]}, "classification": m["classification"],
            "lifecycle": {"state": state}, "revision": 3, "spec": m["spec"]})
        })
        .collect();
    json!({"merons": merons})
}
fn role(path: &str, system: &str, cedar: &str) -> Value {
    json!({"path": path, "classification": {"type": "rule", "subtype": "role"}, "spec": {"system": system, "cedar": cedar}})
}
const EIDOS_PROPOSER: &str = r#"permit (principal == ?principal, action in [Action::"read", Action::"propose"], resource in ?resource);"#;
const READER: &str =
    r#"permit (principal == ?principal, action == Action::"read", resource in ?resource);"#;
/// What Mero holds after 6 Nov: two active roles, two deprecated, two rules; plus roles an owner
/// made later in the UI.
fn approved(extra: &[(Value, &str)]) -> Value {
    let mut merons = vec![
        (data("roles/maintainer.json"), "active"),
        (data("roles/owner.json"), "active"),
        (role("noi.gov.roles.observer", "mero", READER), "deprecated"),
        (data("rules/fresh-touch.json"), "active"),
        (data("rules/owners-approve-gov.json"), "active"),
        (
            json!({"path": "noi.eio.color.text.muted", "classification": {"type": "token", "subtype": "color-role"}, "spec": {}}),
            "active",
        ),
    ];
    merons.extend(extra.iter().cloned());
    snapshot(&merons)
}

fn token_of(link: &str) -> String {
    link.rsplit('/').next().unwrap().to_string()
}
fn origin() -> Url {
    Url::parse(ORIGIN).unwrap()
}

/// A person with a software passkey.
struct Person {
    key: SoftPasskey,
}
impl Person {
    fn new() -> Self {
        Person {
            key: SoftPasskey::new(true),
        }
    }
    async fn add_passkey(&mut self, gov: &Governance, link: &str) -> String {
        let s = gov.link_start(&token_of(link)).await.unwrap();
        let c = self.key.do_registration(origin(), s.options).unwrap();
        gov.link_finish(s.ceremony, &c, "Soft passkey")
            .await
            .unwrap()
    }
    async fn sign_in(&mut self, gov: &Governance, handle: &str) -> String {
        let s = gov.sign_in_start(handle).await.unwrap();
        let c = self.key.do_authentication(origin(), s.options).unwrap();
        gov.sign_in_finish(s.ceremony, &c).await.unwrap()
    }
    async fn touch(
        &mut self,
        gov: &Governance,
        session: &str,
        action: &str,
        targets: &[Target],
    ) -> Uuid {
        let s = gov.touch_start(session, action, targets).await.unwrap();
        let c = self.key.do_authentication(origin(), s.options).unwrap();
        gov.touch_finish(session, s.ceremony, &c).await.unwrap()
    }
}

fn path(p: &str) -> Target {
    Target::Path(p.into())
}
const MUTED: &str = "noi.eio.color.text.muted";
const OWNER_ROLE: &str = "noi.gov.roles.owner";

#[tokio::test]
#[ignore = "requires a reachable PostgreSQL admin URL and CREATE DATABASE; see noi/docs/verification.md"]
async fn governance_on_real_postgres() {
    let admin = std::env::var("NOI_TEST_ADMIN_URL").expect("set NOI_TEST_ADMIN_URL explicitly");
    let name = format!("noi_gov_test_{}", Uuid::new_v4().simple());
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

async fn verify(url: &str) {
    let gov = Governance::connect(
        url,
        Config {
            origin: origin(),
            mero: None,
        },
    )
    .await
    .unwrap();
    gov.migrate().await.unwrap();
    gov.migrate().await.unwrap();

    // No copy yet: nothing is allowed, and setup cannot grant roles Governance does not hold.
    let answer = gov
        .may(&Credential::Visitor, "read", &[path(MUTED)], None)
        .await
        .unwrap();
    assert!(
        !answer.allowed && answer.reason.contains("no copy"),
        "{answer:?}"
    );
    assert!(gov
        .setup("hiddenstack", "Ada")
        .await
        .unwrap_err()
        .to_string()
        .contains("copy the roles and rules"));

    // The copy: retired and draft roles and anything outside noi.gov are left out.
    let copied = gov
        .copy_from_snapshot(&approved(&[]), "test")
        .await
        .unwrap();
    assert_eq!((copied.roles, copied.rules), (3, 2));

    // The first owner, once.
    let setup = gov.setup("hiddenstack", "Ada").await.unwrap();
    assert!(setup.link.starts_with("http://localhost:8788/link/"));
    assert!(gov
        .setup("someone", "Someone")
        .await
        .unwrap_err()
        .to_string()
        .contains("an owner exists"));
    let mut you = Person::new();
    let first = you.add_passkey(&gov, &setup.link).await;
    // The link works once; and a first-passkey link is refused once a passkey exists.
    assert!(gov.link_start(&token_of(&setup.link)).await.is_err());
    assert!(gov
        .first_passkey_link("hiddenstack")
        .await
        .unwrap_err()
        .to_string()
        .contains("has a passkey"));

    let session = you.sign_in(&gov, "hiddenstack").await;
    let me = gov.me(&Credential::Session(session.clone())).await.unwrap();
    assert_eq!(
        (me["handle"].as_str(), me["display_name"].as_str()),
        (Some("hiddenstack"), Some("Ada"))
    );
    let you_c = Credential::Session(session.clone());

    // Proposing needs no touch; approving does, and the touch counts once, for exactly that.
    assert!(
        gov.may(&you_c, "propose", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed
    );
    let no_touch = gov
        .may(&you_c, "review", &[path(MUTED)], None)
        .await
        .unwrap();
    assert!(
        !no_touch.allowed && no_touch.reason.contains("noi.gov.rules.fresh-touch"),
        "{no_touch:?}"
    );
    let touch = you.touch(&gov, &session, "review", &[path(MUTED)]).await;
    assert!(
        !gov.may(
            &you_c,
            "review",
            &[path("noi.eio.color.text.primary")],
            Some(touch)
        )
        .await
        .unwrap()
        .allowed
    );
    let touch = you.touch(&gov, &session, "review", &[path(MUTED)]).await;
    assert!(
        gov.may(&you_c, "review", &[path(MUTED)], Some(touch))
            .await
            .unwrap()
            .allowed
    );
    assert!(
        !gov.may(&you_c, "review", &[path(MUTED)], Some(touch))
            .await
            .unwrap()
            .allowed,
        "a touch counts once"
    );
    // Another session cannot use your touch, even your own other session.
    let touch = you.touch(&gov, &first, "review", &[path(MUTED)]).await;
    assert!(
        !gov.may(&you_c, "review", &[path(MUTED)], Some(touch))
            .await
            .unwrap()
            .allowed
    );

    // Signed out: nothing until an owner grants visitors reading, and never more than reading.
    assert!(
        !gov.may(&Credential::Visitor, "read", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed
    );
    let gate = gov
        .may(&Credential::Visitor, "propose", &[path(MUTED)], None)
        .await
        .unwrap();
    assert!(gate.reason.contains("at most reading"));
    // An owner makes roles in the UI; here they arrive with the next copy.
    gov.copy_from_snapshot(
        &approved(&[
            (role("noi.gov.roles.reader", "mero", READER), "active"),
            (
                role("noi.gov.roles.eidos-proposer", "mero", EIDOS_PROPOSER),
                "active",
            ),
        ]),
        "test",
    )
    .await
    .unwrap();
    let reader = GrantSpec {
        role: "noi.gov.roles.reader".into(),
        scope: "noi".into(),
    };
    let t = you
        .touch(
            &gov,
            &session,
            "grant",
            &[Target::Account(noi_gov::server::VISITORS)],
        )
        .await;
    gov.grant(&you_c, Some(t), "visitors", &reader)
        .await
        .unwrap();
    assert!(
        gov.may(&Credential::Visitor, "read", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed
    );
    let maint = GrantSpec {
        role: "noi.gov.roles.maintainer".into(),
        scope: "noi".into(),
    };
    assert!(gov
        .grant(&you_c, None, "visitors", &maint)
        .await
        .unwrap_err()
        .to_string()
        .contains("reading"));
    // Deprecated roles get no new grants; an owner action without a touch is refused.
    let observer = GrantSpec {
        role: "noi.gov.roles.observer".into(),
        scope: "noi".into(),
    };
    let t = you
        .touch(
            &gov,
            &session,
            "grant",
            &[Target::Account(noi_gov::server::VISITORS)],
        )
        .await;
    assert!(gov
        .grant(&you_c, Some(t), "visitors", &observer)
        .await
        .unwrap_err()
        .to_string()
        .contains("deprecated"));

    // An agent: a sponsor, a platform that vouches for it, a role only in Eidos.
    let (pem, public) = new_voucher_key();
    gov.add_voucher("hyperbase:this-mac", &public)
        .await
        .unwrap();
    let t = you.touch(&gov, &session, "add-agent", &[path("noi")]).await;
    assert!(gov
        .add_agent(
            &you_c,
            None,
            "design-agent",
            "Design agent",
            "Proposes Eidos changes",
            "hiddenstack",
            "hyperbase:this-mac"
        )
        .await
        .is_err());
    let agent = gov
        .add_agent(
            &you_c,
            Some(t),
            "design-agent",
            "Design agent",
            "Proposes Eidos changes",
            "hiddenstack",
            "hyperbase:this-mac",
        )
        .await
        .unwrap();
    let t = you
        .touch(&gov, &session, "grant", &[Target::Account(agent)])
        .await;
    let proposer = GrantSpec {
        role: "noi.gov.roles.eidos-proposer".into(),
        scope: "noi.eio".into(),
    };
    let grant = gov
        .grant(&you_c, Some(t), "design-agent", &proposer)
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
    let agent_c = Credential::RunToken(run.clone());
    assert!(
        gov.may(&agent_c, "propose", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed
    );
    assert!(
        !gov.may(&agent_c, "propose", &[path(OWNER_ROLE)], None)
            .await
            .unwrap()
            .allowed,
        "only in Eidos"
    );
    assert!(
        !gov.may(&agent_c, "review", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed,
        "agents hold no review"
    );
    assert!(
        !gov.may(&agent_c, "grant", &[Target::Account(agent)], None)
            .await
            .unwrap()
            .allowed
    );
    // Vouches from another key, for another agent, or for a person are refused.
    let (other_pem, _) = new_voucher_key();
    assert!(gov
        .run_token(
            &vouch(
                &other_pem,
                "hyperbase:this-mac",
                "design-agent",
                "run-2",
                None
            )
            .unwrap()
        )
        .await
        .is_err());
    assert!(gov
        .run_token(&vouch(&pem, "hyperbase:this-mac", "nobody", "run-3", None).unwrap())
        .await
        .is_err());
    assert!(gov
        .run_token(&vouch(&pem, "hyperbase:this-mac", "hiddenstack", "run-4", None).unwrap())
        .await
        .is_err());
    // Decision 12: a suspended sponsor stops the agent.
    let mut sql = PgConnection::connect(url).await.unwrap();
    sql.execute("UPDATE gov.accounts SET state='suspended' WHERE handle='hiddenstack'")
        .await
        .unwrap();
    assert!(
        !gov.may(&agent_c, "propose", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed
    );
    assert!(gov
        .run_token(&vouch(&pem, "hyperbase:this-mac", "design-agent", "run-5", None).unwrap())
        .await
        .is_err());
    sql.execute("UPDATE gov.accounts SET state='active' WHERE handle='hiddenstack'")
        .await
        .unwrap();
    assert!(
        gov.may(&agent_c, "propose", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed
    );
    // An owner ends its sessions: the run token stops at once.
    let t = you
        .touch(&gov, &session, "end-session", &[Target::Account(agent)])
        .await;
    assert_eq!(
        gov.end_sessions(&you_c, Some(t), "design-agent")
            .await
            .unwrap(),
        1
    );
    assert!(
        !gov.may(&agent_c, "propose", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed
    );

    // Only owners approve roles and rules: a maintainer who is not an owner cannot.
    let t = you.touch(&gov, &session, "invite", &[path("noi")]).await;
    let link = gov
        .invite(
            &you_c,
            Some(t),
            "steward",
            "Steward",
            None,
            std::slice::from_ref(&maint),
        )
        .await
        .unwrap();
    let mut steward = Person::new();
    steward.add_passkey(&gov, &link).await;
    let s = steward.sign_in(&gov, "steward").await;
    let sc = Credential::Session(s.clone());
    let t = steward.touch(&gov, &s, "review", &[path(MUTED)]).await;
    assert!(
        gov.may(&sc, "review", &[path(MUTED)], Some(t))
            .await
            .unwrap()
            .allowed
    );
    let t = steward.touch(&gov, &s, "review", &[path(OWNER_ROLE)]).await;
    let refused = gov
        .may(&sc, "review", &[path(OWNER_ROLE)], Some(t))
        .await
        .unwrap();
    assert!(
        !refused.allowed && refused.reason.contains("owners-approve-gov"),
        "{refused:?}"
    );
    let t = you
        .touch(&gov, &session, "review", &[path(OWNER_ROLE)])
        .await;
    assert!(
        gov.may(&you_c, "review", &[path(OWNER_ROLE)], Some(t))
            .await
            .unwrap()
            .allowed
    );
    // Handles are never reused.
    let t = you.touch(&gov, &session, "invite", &[path("noi")]).await;
    assert!(gov
        .invite(&you_c, Some(t), "steward", "Again", None, &[])
        .await
        .unwrap_err()
        .to_string()
        .contains("never reused"));

    // What Governance shows (7 Nov). Your own Profile needs no verb, and shows nothing secret.
    let profile = gov.profile(&session).await.unwrap();
    assert_eq!(profile["handle"], "hiddenstack");
    let held: Vec<&str> = profile["roles"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["role"].as_str().unwrap())
        .collect();
    assert!(
        held.contains(&"maintainer") && held.contains(&"owner"),
        "{held:?}"
    );
    assert_eq!(profile["passkeys"].as_array().unwrap().len(), 1);
    let sessions = profile["sessions"].as_array().unwrap().clone();
    assert!(sessions.iter().any(|x| x["this"] == true), "{sessions:?}");
    let text = profile.to_string();
    assert!(
        !text.contains(&session)
            && !text.contains(&first)
            && !text.contains("token")
            && !text.contains("credential"),
        "{text}"
    );
    // An owner sees accounts, roles and the record, with no touch: viewing changes nothing.
    let accounts = gov.accounts(&you_c).await.unwrap();
    let handles: Vec<&str> = accounts["accounts"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["handle"].as_str().unwrap())
        .collect();
    for h in ["hiddenstack", "visitors", "design-agent", "steward"] {
        assert!(handles.contains(&h), "{h} in {handles:?}");
    }
    let agent_page = gov.account(&you_c, "design-agent").await.unwrap();
    assert_eq!(agent_page["sponsor"], "hiddenstack");
    assert!(
        !agent_page["runs"].as_array().unwrap().is_empty(),
        "{agent_page}"
    );
    assert!(
        !agent_page.to_string().contains(&run),
        "a run token never shows"
    );
    assert!(gov
        .account(&you_c, "nobody")
        .await
        .unwrap_err()
        .to_string()
        .contains("nobody"));
    let roles = gov.roles(&you_c).await.unwrap();
    let owner = roles["roles"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["name"] == "owner")
        .unwrap();
    assert_eq!(owner["verbs"], json!(["governance"]));
    assert!(owner["holders"]
        .as_array()
        .unwrap()
        .iter()
        .any(|h| h["handle"] == "hiddenstack"));
    assert!(roles["rules"].as_array().unwrap().iter().any(|r| r["cedar"]
        .as_str()
        .unwrap()
        .contains(r#"action == Action::"view""#)));
    let page = gov
        .record_page(
            &you_c,
            &RecordFilter {
                limit: Some(5),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let entries = page["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 5);
    assert!(
        entries
            .windows(2)
            .all(|w| w[0]["seq"].as_i64() > w[1]["seq"].as_i64()),
        "newest first"
    );
    let older = gov
        .record_page(
            &you_c,
            &RecordFilter {
                before: page["next"].as_i64(),
                limit: Some(5),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert!(older["entries"][0]["seq"].as_i64() < entries[4]["seq"].as_i64());
    let refused = gov
        .record_page(
            &you_c,
            &RecordFilter {
                refused: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let refused = refused["entries"].as_array().unwrap();
    assert!(!refused.is_empty() && refused.iter().all(|e| e["allowed"] == false));
    let mine = gov
        .record_page(
            &you_c,
            &RecordFilter {
                who: Some("steward".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert!(mine["entries"]
        .as_array()
        .unwrap()
        .iter()
        .all(|e| e["who"] == "steward"));
    // A maintainer who is not an owner may not view; signed out, nobody may.
    assert!(gov
        .accounts(&sc)
        .await
        .unwrap_err()
        .to_string()
        .contains("no grant allows view"));
    assert!(gov
        .record_page(&Credential::Visitor, &RecordFilter::default())
        .await
        .unwrap_err()
        .to_string()
        .contains("at most reading"));
    // Signing out one device, by its ID: your own only, and once.
    let other: Uuid =
        serde_json::from_value(sessions.iter().find(|x| x["this"] == false).unwrap()["id"].clone())
            .unwrap();
    assert!(
        gov.sign_out_session(&s, other).await.is_err(),
        "nobody signs out your devices but you"
    );
    gov.sign_out_session(&session, other).await.unwrap();
    assert!(
        gov.sign_out_session(&session, other).await.is_err(),
        "it has ended"
    );
    assert!(
        !gov.may(
            &Credential::Session(first.clone()),
            "propose",
            &[path(MUTED)],
            None
        )
        .await
        .unwrap()
        .allowed
    );
    assert!(
        gov.may(&you_c, "propose", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed,
        "this one goes on"
    );
    // Signing out everywhere ends every sign-in of yours: the steward's link opened one, signing in another.
    assert_eq!(gov.sign_out_everywhere(&s).await.unwrap(), 2);
    assert!(gov.profile(&s).await.is_err());

    // Retiring a role ends its grants; a copy that fails a check, or holds no roles, is refused.
    let copied = gov
        .copy_from_snapshot(
            &approved(&[(role("noi.gov.roles.reader", "mero", READER), "active")]),
            "test",
        )
        .await
        .unwrap();
    assert_eq!(copied.ended_grants, 1);
    let reason: Option<String> =
        sqlx::query_scalar("SELECT end_reason FROM gov.grants WHERE id=$1")
            .bind(grant)
            .fetch_one(&mut sql)
            .await
            .unwrap();
    assert_eq!(reason.as_deref(), Some("role retired"));
    let bad = approved(&[(
        role(
            "noi.gov.roles.bad",
            "mero",
            r#"permit (principal == ?principal, action == Action::"grant", resource in ?resource);"#,
        ),
        "active",
    )]);
    assert!(gov.copy_from_snapshot(&bad, "test").await.is_err());
    assert!(gov
        .copy_from_snapshot(&json!({"merons": []}), "test")
        .await
        .is_err());
    assert!(
        gov.may(&Credential::Visitor, "read", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed,
        "the last copy stays"
    );

    // Signing out ends the session at once.
    gov.sign_out(&first).await.unwrap();
    assert!(
        !gov.may(
            &Credential::Session(first.clone()),
            "propose",
            &[path(MUTED)],
            None
        )
        .await
        .unwrap()
        .allowed
    );

    // Nothing stored can sign anyone in: sessions and run tokens are kept only as hashes.
    let dump: Vec<String> = sqlx::query_scalar("SELECT encode(token_hash,'base64') FROM gov.sessions UNION ALL SELECT encode(token_hash,'base64') FROM gov.run_tokens")
        .fetch_all(&mut sql).await.unwrap();
    assert!(dump
        .iter()
        .all(|h| !h.contains(&session) && !h.contains(&run)));
    let everything: String = sqlx::query_scalar("SELECT string_agg(t::text, ' ') FROM (SELECT row_to_json(s) t FROM gov.sessions s UNION ALL SELECT row_to_json(r) FROM gov.run_tokens r UNION ALL SELECT row_to_json(l) FROM gov.links l) x")
        .fetch_one(&mut sql).await.unwrap();
    assert!(
        !everything.contains(&session)
            && !everything.contains(&run)
            && !everything.contains(&token_of(&link))
    );

    // The record holds every sign-in and every answer, and cannot be changed.
    let kinds: Vec<(String, bool)> =
        sqlx::query_as("SELECT kind, allowed FROM gov.record ORDER BY seq")
            .fetch_all(&mut sql)
            .await
            .unwrap();
    for k in [
        "setup",
        "copy",
        "passkey-add",
        "sign-in",
        "touch",
        "decision",
        "run-token",
        "grant",
        "add-agent",
        "invite",
        "end-session",
        "sign-out",
    ] {
        assert!(kinds.iter().any(|(x, _)| x == k), "{k} is recorded");
    }
    assert!(
        kinds.iter().any(|(k, ok)| k == "decision" && !ok),
        "refusals are recorded"
    );
    assert!(sql
        .execute("UPDATE gov.record SET allowed = true")
        .await
        .is_err());
    assert!(sql.execute("DELETE FROM gov.record").await.is_err());
    assert!(sql.execute("TRUNCATE gov.record").await.is_err());

    verify_http(url, &gov, &mut you, &session).await;
}

/// Over HTTP: only this machine and its own sites, and the session as an HttpOnly, SameSite=Strict
/// cookie that the response body never contains.
async fn verify_http(url: &str, lib: &Governance, you: &mut Person, session: &str) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let origin = Url::parse(&format!("http://localhost:{port}")).unwrap();
    let gov = Governance::connect(
        url,
        Config {
            origin: origin.clone(),
            mero: None,
        },
    )
    .await
    .unwrap();
    let app = http::router(gov.clone());
    tokio::spawn(async move { axum::serve(listener, app).await });
    let client = reqwest::Client::new();
    let base = format!("http://127.0.0.1:{port}");
    let at = |p: &str| format!("{base}{p}");

    let signed_out: Value = client
        .get(at("/api/me"))
        .header("host", format!("localhost:{port}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(signed_out, Value::Null);
    let evil_host = client
        .get(at("/api/me"))
        .header("host", "evil.example")
        .send()
        .await
        .unwrap();
    assert_eq!(evil_host.status(), 403);
    let evil_origin = client
        .post(at("/api/sign-in/start"))
        .header("host", format!("localhost:{port}"))
        .header("origin", "http://evil.example")
        .json(&json!({"handle": "hiddenstack"}))
        .send()
        .await
        .unwrap();
    assert_eq!(evil_origin.status(), 403);

    let mut key = SoftPasskey::new(true);
    let started: Value = client
        .post(at("/api/sign-in/start"))
        .header("host", format!("localhost:{port}"))
        .header("origin", origin.as_str().trim_end_matches('/'))
        .json(&json!({"handle": "steward"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        started["options"]["publicKey"]["challenge"].is_string(),
        "{started}"
    );
    // A newcomer's invitation, opened through the link page's API, signs them in.
    let t = you.touch(lib, session, "invite", &[path("noi")]).await;
    let invite = lib
        .invite(
            &Credential::Session(session.into()),
            Some(t),
            "newcomer",
            "Newcomer",
            None,
            &[],
        )
        .await
        .unwrap();
    let s: Value = client
        .post(at("/api/link/start"))
        .header("host", format!("localhost:{port}"))
        .json(&json!({"token": token_of(&invite)}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let options = serde_json::from_value(s["options"].clone()).unwrap();
    let c = key.do_registration(origin.clone(), options).unwrap();
    let finished = client.post(at("/api/link/finish")).header("host", format!("localhost:{port}"))
        .header("user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15")
        .json(&json!({"ceremony": s["ceremony"], "credential": c, "name": "Soft"})).send().await.unwrap();
    assert_eq!(finished.status(), 200);
    let cookie = finished
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(
        cookie.starts_with("noi_session=")
            && cookie.contains("HttpOnly")
            && cookie.contains("SameSite=Strict"),
        "{cookie}"
    );
    let body: Value = finished.json().await.unwrap();
    assert_eq!(
        body,
        json!({"ok": true}),
        "the session never appears in a body"
    );
    let token = cookie
        .trim_start_matches("noi_session=")
        .split(';')
        .next()
        .unwrap();
    let me: Value = client
        .get(at("/api/me"))
        .header("host", format!("localhost:{port}"))
        .header("cookie", format!("noi_session={token}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(me["handle"], "newcomer");
    let may: Value = client.post(at("/api/may")).header("host", format!("localhost:{port}"))
        .json(&json!({"credential": {"session": token}, "action": "review", "targets": [{"path": MUTED}]})).send().await.unwrap().json().await.unwrap();
    assert_eq!(may["allowed"], false);

    // Profile over HTTP names the device the sign-in was made on; Accounts needs view.
    let profile: Value = client
        .get(at("/api/profile"))
        .header("host", format!("localhost:{port}"))
        .header("cookie", format!("noi_session={token}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(profile["handle"], "newcomer");
    assert_eq!(
        profile["sessions"][0]["device"], "Safari on a Mac",
        "{profile}"
    );
    let denied = client
        .get(at("/api/accounts"))
        .header("host", format!("localhost:{port}"))
        .header("cookie", format!("noi_session={token}"))
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), 403);
    let signed_out = client
        .get(at("/api/profile"))
        .header("host", format!("localhost:{port}"))
        .send()
        .await
        .unwrap();
    assert_eq!(signed_out.status(), 403);

    // Health (8 Nov): alive, and ready with a database and a copy of the roles and rules; no sign-in.
    let alive = client
        .get(at("/health/alive"))
        .header("host", format!("localhost:{port}"))
        .send()
        .await
        .unwrap();
    assert_eq!(alive.status(), 200);
    let ready: Value = client
        .get(at("/health/ready"))
        .header("host", format!("localhost:{port}"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        ready,
        json!({"ok": true, "checks": {"database": "ok", "roles and rules": "ok"}})
    );

    // Limits (8 Nov): ten sign-in or link starts a minute from one address (two were made above),
    // then a refusal that says how long to wait, written in the record once.
    for i in 0..8 {
        let r = client
            .post(at("/api/sign-in/start"))
            .header("host", format!("localhost:{port}"))
            .json(&json!({"handle": "steward"}))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 200, "start {i}");
    }
    for _ in 0..2 {
        let r = client
            .post(at("/api/sign-in/start"))
            .header("host", format!("localhost:{port}"))
            .json(&json!({"handle": "steward"}))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 429);
        let why: Value = r.json().await.unwrap();
        assert!(
            why["error"]
                .as_str()
                .unwrap()
                .starts_with("too many tries: wait"),
            "{why}"
        );
    }
    let mut sql = PgConnection::connect(url).await.unwrap();
    let limits: Vec<(Option<Uuid>, String)> =
        sqlx::query_as("SELECT account, reason FROM gov.record WHERE kind = 'limit' ORDER BY seq")
            .fetch_all(&mut sql)
            .await
            .unwrap();
    assert_eq!(
        limits,
        vec![(
            None,
            "more than 10 starts a minute from one address".to_string()
        )]
    );

    // Five failed touches in 15 minutes and that person waits; others are untouched.
    let newcomer: Uuid =
        sqlx::query_scalar("SELECT id FROM gov.accounts WHERE handle = 'newcomer'")
            .fetch_one(&mut sql)
            .await
            .unwrap();
    for _ in 0..5 {
        let a = lib
            .touch_start(token, "view", &[path("noi")])
            .await
            .unwrap();
        let b = lib
            .touch_start(token, "view", &[path("noi")])
            .await
            .unwrap();
        let for_a = key.do_authentication(origin.clone(), a.options).unwrap();
        assert!(
            lib.touch_finish(token, b.ceremony, &for_a).await.is_err(),
            "a touch for another prompt fails"
        );
    }
    let failed: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM gov.record WHERE kind = 'touch' AND NOT allowed AND account = $1",
    )
    .bind(newcomer)
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert_eq!(failed, 5, "failed touches are recorded");
    match lib.touch_start(token, "view", &[path("noi")]).await {
        Err(noi_gov::server::Error::TooMany(why)) => assert!(
            why.starts_with("5 touches failed in 15 minutes: wait 15 minutes"),
            "{why}"
        ),
        other => panic!("a sixth touch should wait: {:?}", other.map(|s| s.ceremony)),
    }
    assert!(
        matches!(
            lib.sign_in_start("newcomer").await,
            Err(noi_gov::server::Error::TooMany(_))
        ),
        "signing in waits too"
    );
    let waited: i64 =
        sqlx::query_scalar("SELECT count(*) FROM gov.record WHERE kind = 'limit' AND account = $1")
            .bind(newcomer)
            .fetch_one(&mut sql)
            .await
            .unwrap();
    assert_eq!(waited, 2);
    you.touch(lib, session, "view", &[path("noi")]).await;

    // Problems (8 Nov): kept with the request they were, read by owners only.
    lib.record_problem(
        "req-9",
        "GET",
        "/api/accounts",
        500,
        "database: pool timed out",
    )
    .await
    .unwrap();
    let seen = lib
        .problems(&Credential::Session(session.into()), None, None)
        .await
        .unwrap();
    assert_eq!(seen["problems"][0]["what"], "database: pool timed out");
    assert_eq!(seen["problems"][0]["request_id"], "req-9");
    assert!(
        matches!(
            lib.problems(&Credential::Session(token.into()), None, None)
                .await,
            Err(noi_gov::server::Error::Refused(_))
        ),
        "a newcomer is not an owner"
    );
    assert!(matches!(
        lib.problems(&Credential::Visitor, None, None).await,
        Err(noi_gov::server::Error::Refused(_))
    ));
}
