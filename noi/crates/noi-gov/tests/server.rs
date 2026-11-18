//! Governance's server on real PostgreSQL, with a software passkey standing in for Touch ID.
//! Creates a disposable database and drops it; never touches the shared one.
//! Explicit opt-in: NOI_TEST_ADMIN_URL=... cargo test -p noi-gov --features server --test server -- --ignored
#![cfg(feature = "server")]
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use noi_gov::server::{
    grant_about, http, invite_about, new_voucher_key, vouch, Change, Config, Credential,
    Governance, GrantSpec, Mailer, RecordFilter, Target, Vouch, EMAIL_SENT, SENT,
};
use serde_json::{json, Value};
use sha2::Digest;
use sqlx::{Connection, Executor, PgConnection};
use std::{
    fs,
    path::Path,
    sync::{Arc, Mutex},
};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use url::Url;
use uuid::Uuid;
use webauthn_authenticator_rs::{
    prelude::{PublicKeyCredential, RequestChallengeResponse, WebauthnAuthenticator},
    softpasskey::SoftPasskey,
};

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
    link.rsplit('#').next().unwrap().to_string()
}
fn origin() -> Url {
    Url::parse(ORIGIN).unwrap()
}
/// The base name, and Governance's pages on gov's own name, in the one app (agreed 8 Nov). Over
/// https here: the software passkey takes http only for plain localhost, while Safari and Chromium
/// also take http on *.localhost (checked 8 Nov). The name rules are the same either way.
const DOMAIN: &str = "no-origins.localhost";
fn pages() -> Url {
    Url::parse("https://gov.no-origins.localhost:3000").unwrap()
}
/// Where a passkey is used: signing in on gov, a touch on mero (any subdomain, any port).
fn gov_page() -> Url {
    Url::parse("https://gov.no-origins.localhost:3000").unwrap()
}
fn mero_page() -> Url {
    Url::parse("https://mero.no-origins.localhost:3000").unwrap()
}

/// A person with a software passkey.
struct Person {
    key: SoftPasskey,
    /// The IDs of the passkeys it made, for signing in with no typing.
    ids: Vec<Vec<u8>>,
}
impl Person {
    fn new() -> Self {
        Person {
            key: SoftPasskey::new(true),
            ids: vec![],
        }
    }
    async fn add_passkey(&mut self, gov: &Governance, link: &str) -> String {
        let s = gov.link_start(&token_of(link)).await.unwrap();
        let c = self.key.do_registration(gov_page(), s.options).unwrap();
        self.ids.push(c.raw_id.clone());
        gov.link_finish(s.ceremony, &c, "Soft passkey")
            .await
            .unwrap()
    }
    /// Signing in with no typing (9 Nov). A browser offers the passkey by itself and its answer
    /// names whose it is; the software passkey can't choose, so it is told which of its own to use,
    /// and the answer is given the name `whose`, as a browser's carries the account's.
    fn answer_any(
        &mut self,
        options: RequestChallengeResponse,
        whose: Uuid,
    ) -> PublicKeyCredential {
        let mut options = serde_json::to_value(options).unwrap();
        let allowed = &mut options["publicKey"]["allowCredentials"];
        assert!(
            allowed.as_array().is_none_or(|a| a.is_empty()),
            "the prompt names no passkey: {allowed}"
        );
        *allowed = self
            .ids
            .iter()
            .map(|id| json!({"type": "public-key", "id": URL_SAFE_NO_PAD.encode(id)}))
            .collect();
        let options = serde_json::from_value(options).unwrap();
        let mut c = self.key.do_authentication(gov_page(), options).unwrap();
        c.response.user_handle = Some(whose.as_bytes().to_vec());
        c
    }
    async fn sign_in_any(
        &mut self,
        gov: &Governance,
        whose: Uuid,
    ) -> Result<String, noi_gov::server::Error> {
        let s = gov.sign_in_any_start().await.unwrap();
        let c = self.answer_any(s.options, whose);
        gov.sign_in_finish(s.ceremony, &c).await
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
    ) -> Uuid {
        let s = gov.touch_start(session, action, targets).await.unwrap();
        let c = self.key.do_authentication(mero_page(), s.options).unwrap();
        gov.touch_finish(session, s.ceremony, &c).await.unwrap()
    }
    /// A touch naming what else it is for (9 Nov, step 7): the role and place, the invitee.
    async fn touch_for(
        &mut self,
        gov: &Governance,
        session: &str,
        action: &str,
        targets: &[Target],
        about: Value,
    ) -> Uuid {
        let s = gov
            .touch_start_about(session, action, targets, Some(&about))
            .await
            .unwrap();
        let c = self.key.do_authentication(mero_page(), s.options).unwrap();
        gov.touch_finish(session, s.ceremony, &c).await.unwrap()
    }
    /// A touch for one change to your own account (9 Nov), made with this person's passkey.
    async fn touch_own(&mut self, gov: &Governance, session: &str, change: Change) -> Uuid {
        let s = gov.own_touch_start(session, change).await.unwrap();
        let c = self.key.do_authentication(gov_page(), s.options).unwrap();
        gov.touch_finish(session, s.ceremony, &c).await.unwrap()
    }
}

/// How many hours until this session ends.
async fn hours_left(look: &mut PgConnection, hash: &[u8]) -> f64 {
    sqlx::query_scalar(
        "SELECT extract(epoch FROM expires_at - now())::float8 / 3600 FROM gov.sessions WHERE token_hash = $1",
    )
    .bind(hash)
    .fetch_one(look)
    .await
    .unwrap()
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
    // Governance runs as a login with only its own role's rights, as it does live (9 Nov: running as
    // the owner hid a right it lacked).
    let login = format!("noi_gov_test_login_{}", Uuid::new_v4().simple());
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
    let (catcher, mails) = mail_catcher().await;
    let config = Config {
        origin: origin(),
        pages: pages(),
        domain: DOMAIN.into(),
        mero: None,
        mail: Mailer::Smtp {
            server: catcher,
            from: "No Origins <no-reply@no-origins.localhost>".into(),
        },
    };
    // Migrations run as the owner, as the operator runs them.
    let owner = Governance::connect(url, config.clone()).await.unwrap();
    owner.migrate().await.unwrap();
    owner.migrate().await.unwrap();
    // Everything else runs as a login holding only noi_gov_runtime, as Governance does live: a right
    // it lacks fails here. Direct SQL below stays the owner's.
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
    // Governance's own login can read every table it has, and keep sign-ups (9 Nov: once it could
    // not, and every link failed).
    let unreadable: Vec<String> = sqlx::query_scalar(
        "SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'gov' AND c.relkind = 'r' AND NOT has_table_privilege('noi_gov_runtime', c.oid, 'SELECT')",
    )
    .fetch_all(&mut sql)
    .await
    .unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");
    for right in ["INSERT", "UPDATE", "DELETE"] {
        let ok: bool =
            sqlx::query_scalar("SELECT has_table_privilege('noi_gov_runtime', 'gov.sign_ups', $1)")
                .bind(right)
                .fetch_one(&mut sql)
                .await
                .unwrap();
        assert!(ok, "sign-ups need {right}");
    }

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
        .setup("hiddenstack", "Ada", "ada@example.com")
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
    let setup = gov
        .setup("hiddenstack", "Ada", "ada@example.com")
        .await
        .unwrap();
    assert!(setup
        .link
        .starts_with("https://gov.no-origins.localhost:3000/account/link#"));
    assert!(gov
        .setup("someone", "Someone", "someone@example.com")
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
    // Another passkey, such as one for a new name: only for an account that has one, from this
    // Mac's command line, recorded; it adds a second passkey and both sign in.
    assert!(gov
        .another_passkey_link("someone-without-an-account")
        .await
        .is_err());
    let another = gov.another_passkey_link("hiddenstack").await.unwrap();
    assert!(another.starts_with("https://gov.no-origins.localhost:3000/account/link#"));
    let mut second = Person::new();
    let from_link = second.add_passkey(&gov, &another).await;
    assert!(gov.link_start(&token_of(&another)).await.is_err());
    let with_second = second.sign_in(&gov, "hiddenstack").await;
    // An account that had a passkey gets a notice of the new one (agreed 9 Nov, Q).
    let notice = mails.lock().unwrap().last().cloned().unwrap_or_default();
    assert!(
        notice.contains("Subject: A passkey was added") && notice.contains("command line"),
        "{notice}"
    );
    // Those two sign-ins end here, so the devices checked below are the ones they were.
    gov.sign_out(&from_link).await.unwrap();
    gov.sign_out(&with_second).await.unwrap();
    let made: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM gov.record WHERE kind = 'another-passkey-link' AND allowed",
    )
    .fetch_one(&mut PgConnection::connect(url).await.unwrap())
    .await
    .unwrap();
    assert_eq!(made, 1);
    // A passkey used on a name outside the base name is refused.
    let s = gov.sign_in_start("hiddenstack").await.unwrap();
    let elsewhere = you.key.do_authentication(
        Url::parse("https://no-origins.localhost.example:3000").unwrap(),
        s.options,
    );
    assert!(
        elsewhere.is_err()
            || gov
                .sign_in_finish(s.ceremony, &elsewhere.unwrap())
                .await
                .is_err()
    );
    // A failed answer closes its prompt: even the right answer is refused after it (found 9 Nov).
    let s = gov.sign_in_start("hiddenstack").await.unwrap();
    let good = you.key.do_authentication(gov_page(), s.options).unwrap();
    let mut bad = good.clone();
    bad.response.signature = vec![0u8; 64];
    assert!(gov.sign_in_finish(s.ceremony, &bad).await.is_err());
    assert!(gov
        .sign_in_finish(s.ceremony, &good)
        .await
        .unwrap_err()
        .to_string()
        .contains("expired or was used"));

    let session = you.sign_in(&gov, "hiddenstack").await;
    let me = gov.me(&Credential::Session(session.clone())).await.unwrap();
    assert_eq!(
        (me["handle"].as_str(), me["display_name"].as_str()),
        (Some("hiddenstack"), Some("Ada"))
    );

    // Signing in with no typing (agreed 9 Nov): the prompt names nobody, and the passkey the
    // browser offers says whose it is.
    let mut look = PgConnection::connect(url).await.unwrap();
    let your_id: Uuid =
        sqlx::query_scalar("SELECT id FROM gov.accounts WHERE handle = 'hiddenstack'")
            .fetch_one(&mut look)
            .await
            .unwrap();
    let any = you.sign_in_any(&gov, your_id).await.unwrap();
    assert_eq!(
        gov.me(&Credential::Session(any.clone())).await.unwrap()["handle"],
        "hiddenstack"
    );
    gov.sign_out(&any).await.unwrap();
    // An answer naming nobody here, or the visitors, is refused; so is a bad signature.
    let visitors = Uuid::from_u128(0x00000000_0000_4000_8000_000000000001);
    for whose in [Uuid::new_v4(), visitors] {
        let e = you.sign_in_any(&gov, whose).await.unwrap_err().to_string();
        assert!(e.contains("no active person has that passkey"), "{e}");
    }
    let s = gov.sign_in_any_start().await.unwrap();
    let mut bad = you.answer_any(s.options, your_id);
    bad.response.signature = vec![0u8; 64];
    assert!(gov.sign_in_finish(s.ceremony, &bad).await.is_err());
    let refused: Vec<Option<Uuid>> = sqlx::query_scalar(
        "SELECT account FROM gov.record WHERE kind = 'sign-in' AND NOT allowed ORDER BY seq DESC LIMIT 3",
    )
    .fetch_all(&mut look)
    .await
    .unwrap();
    assert_eq!(
        refused,
        vec![Some(your_id), None, None],
        "each refusal is recorded, against the person when there is one"
    );

    // A session runs on while it is used (agreed 9 Nov): a use moves its end to 12 hours away,
    // never past 30 days after signing in.
    let hash = sha2::Sha256::digest(session.as_bytes()).to_vec();
    sqlx::query(
        "UPDATE gov.sessions SET expires_at = now() + interval '1 hour' WHERE token_hash = $1",
    )
    .bind(&hash)
    .execute(&mut look)
    .await
    .unwrap();
    gov.me(&Credential::Session(session.clone())).await.unwrap();
    let hours = hours_left(&mut look, &hash).await;
    assert!(
        (11.9..=12.0).contains(&hours),
        "moved to 12 hours away: {hours}"
    );
    let ends_at =
        "SELECT extract(epoch FROM expires_at)::float8 FROM gov.sessions WHERE token_hash = $1";
    let before: f64 = sqlx::query_scalar(ends_at)
        .bind(&hash)
        .fetch_one(&mut look)
        .await
        .unwrap();
    gov.me(&Credential::Session(session.clone())).await.unwrap();
    let after: f64 = sqlx::query_scalar(ends_at)
        .bind(&hash)
        .fetch_one(&mut look)
        .await
        .unwrap();
    assert_eq!(after, before, "not written again minutes later");
    sqlx::query("UPDATE gov.sessions SET started_at = now() - interval '29 days 23 hours', expires_at = now() + interval '10 minutes' WHERE token_hash = $1")
        .bind(&hash)
        .execute(&mut look)
        .await
        .unwrap();
    gov.me(&Credential::Session(session.clone())).await.unwrap();
    let hours = hours_left(&mut look, &hash).await;
    assert!(
        (0.9..=1.0).contains(&hours),
        "30 days after signing in at most: {hours}"
    );
    sqlx::query("UPDATE gov.sessions SET started_at = now(), expires_at = now() + interval '12 hours' WHERE token_hash = $1")
        .bind(&hash)
        .execute(&mut look)
        .await
        .unwrap();
    let you_c = Credential::Session(session.clone());

    // Proposing needs no touch; approving does, and the touch counts once, for exactly that.
    let proposing = gov
        .may(&you_c, "propose", &[path(MUTED)], None)
        .await
        .unwrap();
    assert!(proposing.allowed && proposing.record.is_some());
    // An allowed read is not recorded (agreed 9 Nov, finding I); a refused one is.
    let reads = |sql: &'static str| async move {
        let n: i64 = sqlx::query_scalar(sql)
            .fetch_one(&mut PgConnection::connect(url).await.unwrap())
            .await
            .unwrap();
        n
    };
    let allowed_reads =
        "SELECT count(*) FROM gov.record WHERE kind = 'decision' AND action = 'read' AND allowed";
    let before = reads(allowed_reads).await;
    let reading = gov.may(&you_c, "read", &[path(MUTED)], None).await.unwrap();
    assert!(reading.allowed && reading.record.is_none());
    assert_eq!(reads(allowed_reads).await, before);
    assert!(gov
        .may(&Credential::Visitor, "read", &[path(MUTED)], None)
        .await
        .unwrap()
        .record
        .is_none());
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
        .touch_for(
            &gov,
            &session,
            "grant",
            &[Target::Account(noi_gov::server::VISITORS)],
            grant_about(&reader),
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
    // Visitors may also be given a role that reads Review, as Observer does since step 6 (found 9
    // Nov when giving visitors Observer was refused); rule 5 still keeps Review from them.
    const OBSERVING: &str = r#"permit (principal == ?principal, action in [Action::"read", Action::"read-review"], resource in ?resource);"#;
    gov.copy_from_snapshot(
        &approved(&[
            (role("noi.gov.roles.reader", "mero", READER), "active"),
            (
                role("noi.gov.roles.eidos-proposer", "mero", EIDOS_PROPOSER),
                "active",
            ),
            (role("noi.gov.roles.observing", "mero", OBSERVING), "active"),
        ]),
        "test",
    )
    .await
    .unwrap();
    let t = you
        .touch_for(
            &gov,
            &session,
            "grant",
            &[Target::Account(noi_gov::server::VISITORS)],
            json!({"role": "noi.gov.roles.observing", "scope": "noi"}),
        )
        .await;
    gov.grant(
        &you_c,
        Some(t),
        "visitors",
        &GrantSpec {
            role: "noi.gov.roles.observing".into(),
            scope: "noi".into(),
        },
    )
    .await
    .unwrap();
    let review = gov
        .may(&Credential::Visitor, "read-review", &[path("noi")], None)
        .await
        .unwrap();
    assert!(
        !review.allowed && review.reason.contains("at most reading"),
        "{review:?}"
    );
    // A signed-out look that is refused leaves nothing in the record (10 Nov).
    assert!(review.record.is_none(), "{review:?}");
    // "What may they do here?" (9 Nov, step 6): as if confirmed with a touch, and not recorded.
    // Signed out, never reading Review, whatever is granted (rule 5).
    let before: i64 = sqlx::query_scalar("SELECT count(*) FROM gov.record")
        .fetch_one(&mut PgConnection::connect(url).await.unwrap())
        .await
        .unwrap();
    let ask = |a: &str, p: &str| (a.to_string(), vec![path(p)]);
    assert_eq!(
        gov.may_preview(
            &you_c,
            &[
                ask("review", MUTED),
                ask("propose", MUTED),
                ask("grant", "noi")
            ]
        )
        .await
        .unwrap(),
        vec![true, true, true],
        "an owner and maintainer, as if touched"
    );
    assert_eq!(
        gov.may_preview(
            &Credential::Visitor,
            &[
                ask("read", MUTED),
                ask("read-review", "noi"),
                ask("propose", MUTED)
            ]
        )
        .await
        .unwrap(),
        vec![true, false, false]
    );
    let after: i64 = sqlx::query_scalar("SELECT count(*) FROM gov.record")
        .fetch_one(&mut PgConnection::connect(url).await.unwrap())
        .await
        .unwrap();
    assert_eq!(after, before, "nothing recorded");
    assert!(gov
        .may_preview(&you_c, &vec![ask("read", "noi"); 51])
        .await
        .is_err());
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
        .touch_for(
            &gov,
            &session,
            "grant",
            &[Target::Account(noi_gov::server::VISITORS)],
            grant_about(&observer),
        )
        .await;
    assert!(gov
        .grant(&you_c, Some(t), "visitors", &observer)
        .await
        .unwrap_err()
        .to_string()
        .contains("deprecated"));

    // The last owner stays (10 Nov): ending the only Owner grant in all of noi is refused, the
    // grant lives on, and the touch is not spent.
    let (own_grant, own_account): (Uuid, Uuid) = sqlx::query_as(
        "SELECT id, account FROM gov.grants WHERE role = 'noi.gov.roles.owner' AND scope = 'noi' AND ended_at IS NULL",
    )
    .fetch_one(&mut PgConnection::connect(url).await.unwrap())
    .await
    .unwrap();
    let t = you
        .touch_for(
            &gov,
            &session,
            "end-grant",
            &[Target::Account(own_account)],
            json!({"grant": own_grant}),
        )
        .await;
    let last = gov
        .end_grant(&you_c, Some(t), own_grant)
        .await
        .unwrap_err()
        .to_string();
    assert!(last.contains("last owner"), "{last}");
    let live: bool = sqlx::query_scalar("SELECT ended_at IS NULL FROM gov.grants WHERE id = $1")
        .bind(own_grant)
        .fetch_one(&mut PgConnection::connect(url).await.unwrap())
        .await
        .unwrap();
    assert!(live, "the last owner's grant was ended");

    // An agent: a sponsor, a platform that vouches for it, a role only in Eidos.
    let (pem, public) = new_voucher_key();
    gov.add_voucher("hyperbase:this-mac", &public)
        .await
        .unwrap();
    let t = you
        .touch_for(
            &gov,
            &session,
            "add-agent",
            &[path("noi")],
            json!({"handle": "design-agent"}),
        )
        .await;
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
        .touch_for(
            &gov,
            &session,
            "grant",
            &[Target::Account(agent)],
            json!({"role": "noi.gov.roles.eidos-proposer", "scope": "noi.eio"}),
        )
        .await;
    let proposer = GrantSpec {
        role: "noi.gov.roles.eidos-proposer".into(),
        scope: "noi.eio".into(),
    };
    // A touch names the role and the place (9 Nov, step 7): one made for another role, or another
    // place, gives nothing.
    let elsewhere = GrantSpec {
        role: "noi.gov.roles.eidos-proposer".into(),
        scope: "noi".into(),
    };
    assert!(gov
        .grant(&you_c, Some(t), "design-agent", &elsewhere)
        .await
        .unwrap_err()
        .to_string()
        .contains("for something else"));
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
    // A vouch buys one run token, and must start now (found 9 Nov).
    assert!(gov
        .run_token(&v)
        .await
        .unwrap_err()
        .to_string()
        .contains("used already"));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let year = 365 * 24 * 3600;
    let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::EdDSA);
    header.kid = Some("hyperbase:this-mac".into());
    let later = jsonwebtoken::encode(
        &header,
        &Vouch {
            iss: "hyperbase:this-mac".into(),
            sub: "design-agent".into(),
            aud: "noi-gov".into(),
            run: "run-later".into(),
            started_by: None,
            iat: now + year,
            exp: now + year + 60,
        },
        &jsonwebtoken::EncodingKey::from_ed_pem(pem.as_bytes()).unwrap(),
    )
    .unwrap();
    assert!(gov
        .run_token(&later)
        .await
        .unwrap_err()
        .to_string()
        .contains("future"));
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
    let t = you
        .touch_for(
            &gov,
            &session,
            "invite",
            &[path("noi")],
            invite_about("steward", std::slice::from_ref(&maint)),
        )
        .await;
    let link = gov
        .invite(
            &you_c,
            Some(t),
            "steward",
            "Steward",
            "steward@example.com",
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
    // An invite asks "grant" for each role it gives, in its place, with the same touch
    // (architecture review, 9 Nov): one who may invite but not grant gives no role.
    let mut sql = PgConnection::connect(url).await.unwrap();
    let granted: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM gov.record WHERE kind = 'decision' AND action = 'grant' AND allowed AND resources = '[\"noi\"]'",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert!(granted >= 1, "the steward's invite asked grant in noi");
    const INVITER: &str =
        r#"permit (principal == ?principal, action == Action::"invite", resource in ?resource);"#;
    // The roles made above stay; the inviter joins them.
    gov.copy_from_snapshot(
        &approved(&[
            (role("noi.gov.roles.reader", "mero", READER), "active"),
            (
                role("noi.gov.roles.eidos-proposer", "mero", EIDOS_PROPOSER),
                "active",
            ),
            (
                role("noi.gov.roles.inviter", "governance", INVITER),
                "active",
            ),
        ]),
        "test",
    )
    .await
    .unwrap();
    let steward_id: Uuid =
        serde_json::from_value(gov.me(&sc).await.unwrap()["account"].clone()).unwrap();
    let t = you
        .touch_for(
            &gov,
            &session,
            "grant",
            &[Target::Account(steward_id)],
            json!({"role": "noi.gov.roles.inviter", "scope": "noi"}),
        )
        .await;
    gov.grant(
        &you_c,
        Some(t),
        "steward",
        &GrantSpec {
            role: "noi.gov.roles.inviter".into(),
            scope: "noi".into(),
        },
    )
    .await
    .unwrap();
    let would = [GrantSpec {
        role: OWNER_ROLE.into(),
        scope: "noi".into(),
    }];
    let t = steward
        .touch_for(
            &gov,
            &s,
            "invite",
            &[path("noi")],
            invite_about("would-be-owner", &would),
        )
        .await;
    let refused = gov
        .invite(
            &sc,
            Some(t),
            "would-be-owner",
            "Would-be",
            "would@example.com",
            &would,
        )
        .await
        .unwrap_err()
        .to_string();
    assert!(refused.contains("no grant allows grant"), "{refused}");
    assert!(
        gov.public_profile("would-be-owner").await.is_err(),
        "no account was made"
    );
    let t = steward
        .touch_for(
            &gov,
            &s,
            "invite",
            &[path("noi")],
            invite_about("plain-invitee", &[]),
        )
        .await;
    assert!(
        gov.invite(
            &sc,
            Some(t),
            "plain-invitee",
            "Plain",
            "plain@example.com",
            &[]
        )
        .await
        .is_ok(),
        "inviting with no role needs only invite"
    );
    // Handles are never reused.
    let t = you
        .touch_for(
            &gov,
            &session,
            "invite",
            &[path("noi")],
            invite_about("steward", &[]),
        )
        .await;
    assert!(gov
        .invite(
            &you_c,
            Some(t),
            "steward",
            "Again",
            "again@example.com",
            &[]
        )
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
    // The first passkey, and the other one added from the command line's link above.
    assert_eq!(profile["passkeys"].as_array().unwrap().len(), 2);
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
    // Each with the roles held and where, by name, and when they last signed in (agreed 9 Nov).
    let you_row = accounts["accounts"]
        .as_array()
        .unwrap()
        .iter()
        .find(|a| a["handle"] == "hiddenstack")
        .unwrap();
    assert!(you_row["held"]
        .as_array()
        .unwrap()
        .iter()
        .any(|g| g["role"] == "owner" && g["scope"] == "noi"));
    assert_eq!(you_row["roles"], you_row["held"].as_array().unwrap().len());
    assert!(you_row["last_signed_in"].is_string());
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
        .all(|e| e["who"] == "steward" || e["whom"] == "steward"));
    assert!(
        mine["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["kind"] == "invite" && e["who"] == "hiddenstack"),
        "one person's part has what was done to them: {mine}"
    );
    // The record page's views (9 Nov): changes, sign-ins, refused, everything; never an allowed read.
    let view = |show: &str| RecordFilter {
        show: Some(show.into()),
        limit: Some(200),
        ..Default::default()
    };
    let entries = |page: Value| page["entries"].as_array().unwrap().clone();
    let everything = entries(gov.record_page(&you_c, &view("everything")).await.unwrap());
    assert!(!everything
        .iter()
        .any(|e| e["kind"] == "decision" && e["action"] == "read" && e["allowed"] == true));
    let changes = entries(gov.record_page(&you_c, &view("changes")).await.unwrap());
    assert!(changes.iter().all(|e| e["allowed"] == true
        && ![
            "sign-in",
            "sign-out",
            "touch",
            "run-token",
            "notice",
            "limit"
        ]
        .contains(&e["kind"].as_str().unwrap())
        && e["action"] != "view"));
    assert!(changes
        .iter()
        .any(|e| e["kind"] == "grant" && e["whom"].is_string() && e["role"].is_string()));
    assert!(changes
        .iter()
        .filter(|e| e["kind"] == "copy")
        .all(|e| !e["changed"].as_array().unwrap().is_empty()));
    let sign_ins = entries(gov.record_page(&you_c, &view("sign-ins")).await.unwrap());
    assert!(
        !sign_ins.is_empty()
            && sign_ins
                .iter()
                .all(|e| ["sign-in", "sign-out", "touch", "run-token"]
                    .contains(&e["kind"].as_str().unwrap()))
    );
    let refused = entries(gov.record_page(&you_c, &view("refused")).await.unwrap());
    assert!(!refused.is_empty() && refused.iter().all(|e| e["allowed"] == false));
    assert!(gov.record_page(&you_c, &view("reads")).await.is_err());
    // Governance's home (9 Nov): signed out, nothing is asked; a maintainer sees themselves and
    // their roles; an owner also sees who holds what, the latest changes and what needs attention.
    assert_eq!(
        gov.dashboard(&Credential::Visitor).await.unwrap(),
        json!({"you": null})
    );
    let theirs = gov.dashboard(&sc).await.unwrap();
    assert_eq!(theirs["you"]["handle"], "steward");
    assert!(theirs["you"]["roles"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["role"] == "maintainer"));
    assert_eq!(theirs["view"], false);
    assert!(theirs.get("changes").is_none() && theirs.get("held").is_none());
    let home = gov.dashboard(&you_c).await.unwrap();
    assert_eq!(home["you"]["handle"], "hiddenstack");
    assert_eq!(home["view"], true);
    assert!(home["held"]["noi.gov.roles.owner"].as_i64().unwrap() >= 1);
    let changes = home["changes"].as_array().unwrap();
    assert!(!changes.is_empty() && changes.len() <= 8, "{changes:?}");
    let kinds = [
        "setup",
        "grant",
        "end-grant",
        "add-agent",
        "voucher-add",
        "invite",
        "sign-up",
        "copy",
    ];
    assert!(
        changes
            .iter()
            .all(|c| kinds.contains(&c["kind"].as_str().unwrap())),
        "{changes:?}"
    );
    assert!(
        changes
            .windows(2)
            .all(|w| w[0]["seq"].as_i64() > w[1]["seq"].as_i64()),
        "newest first"
    );
    assert!(
        changes
            .iter()
            .any(|c| c["kind"] == "invite" && c["by"] == "hiddenstack" && c["whom"] == "steward"),
        "{changes:?}"
    );
    assert!(
        changes
            .iter()
            .filter(|c| c["kind"] == "copy")
            .all(|c| !c["changed"].as_array().unwrap().is_empty()),
        "a copy that moved nothing is no change"
    );
    assert!(home["attention"]["waiting"].is_array());
    assert!(home["attention"]["problems_today"].is_i64());
    // A public profile: active people and agents only, by handle, with nothing private.
    let public = gov.public_profile("steward").await.unwrap();
    assert_eq!(public["display_name"], "Steward");
    assert_eq!(public["kind"], "person");
    assert!(!public.to_string().contains("example.com"));
    assert!(public.get("sponsor").is_none(), "a person's is theirs");
    // An agent's sponsor and purpose are public (agreed 9 Nov): who answers for it, what it is for.
    let agent = gov.public_profile("design-agent").await.unwrap();
    assert_eq!(agent["sponsor"], "hiddenstack");
    assert!(agent["purpose"].is_string());
    for nobody in ["visitors", "nobody"] {
        assert!(gov
            .public_profile(nobody)
            .await
            .unwrap_err()
            .to_string()
            .contains("no one here is called"));
    }
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
    // Ending another of your sign-ins, by its ID, with a touch (9 Nov): your own only, and once.
    let other: Uuid =
        serde_json::from_value(sessions.iter().find(|x| x["this"] == false).unwrap()["id"].clone())
            .unwrap();
    let end_other = Change::EndSignIn { session: other };
    assert!(
        gov.own_touch_start(&s, end_other.clone()).await.is_err(),
        "nobody ends your sign-ins but you"
    );
    let t = you.touch_own(&gov, &session, end_other.clone()).await;
    assert_eq!(gov.end_sign_ins(&session, t, Some(other)).await.unwrap(), 1);
    assert!(
        gov.own_touch_start(&session, end_other.clone())
            .await
            .is_err(),
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
    // The agent's Eidos proposer, and the steward's inviter from the invite check above.
    assert_eq!(copied.ended_grants, 2);
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

    // What has expired is cleared, with Governance's own login (9 Nov, step 7; finding C).
    sql.execute("UPDATE gov.touches SET expires_at = now() - interval '2 days'")
        .await
        .unwrap();
    assert!(gov.tidy().await.unwrap() > 0);
    let left: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM gov.touches WHERE expires_at < now() - interval '1 day'",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert_eq!(left, 0);
    // Never a stale copy (9 Nov, step 7): with Mero's version the same as the last copy's, it
    // answers; different, it copies first, and here, with no Mero to copy from, says no.
    let current: String =
        sqlx::query_scalar("SELECT version FROM gov.copies ORDER BY id DESC LIMIT 1")
            .fetch_one(&mut sql)
            .await
            .unwrap();
    assert!(current.contains("noi.gov.roles.owner@"), "{current}");
    gov.keep_up(&current).await.unwrap();
    assert!(gov
        .keep_up("noi.gov.roles.owner@99:active")
        .await
        .unwrap_err()
        .to_string()
        .contains("behind Mero's"));
    // When Governance itself fails (here it may not read its copy of the rules), it answers with an
    // error, not a refusal, and the record keeps only that it said no (architecture review, 9 Nov).
    sql.execute("REVOKE SELECT ON gov.policies FROM noi_gov_runtime")
        .await
        .unwrap();
    let broken = gov.may(&you_c, "propose", &[path(MUTED)], None).await;
    sql.execute("GRANT SELECT ON gov.policies TO noi_gov_runtime")
        .await
        .unwrap();
    let error = broken.unwrap_err().to_string();
    assert!(error.starts_with("database"), "{error}");
    let kept: String =
        sqlx::query_scalar("SELECT reason FROM gov.record ORDER BY seq DESC LIMIT 1")
            .fetch_one(&mut sql)
            .await
            .unwrap();
    assert_eq!(kept, "Governance could not decide, so no");
    assert!(
        gov.may(&you_c, "propose", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed,
        "and answers again once it can"
    );

    verify_http(url, &runtime, &gov, &mut you, &session).await;
    verify_sign_up(url, &gov, &mails).await;
    verify_your_account(url, &gov, &mails).await;
}

type Kept = Arc<Mutex<Vec<String>>>;

/// A mail server standing in for Mailpit: it keeps every message it is given.
async fn mail_catcher() -> (String, Kept) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap().to_string();
    let kept: Kept = Arc::default();
    let keep = kept.clone();
    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let keep = keep.clone();
            tokio::spawn(async move {
                let (read, mut write) = stream.into_split();
                let mut read = BufReader::new(read);
                write.write_all(b"220 catcher\r\n").await.unwrap();
                let (mut data, mut message) = (false, String::new());
                loop {
                    let mut line = String::new();
                    if read.read_line(&mut line).await.unwrap_or(0) == 0 {
                        break;
                    }
                    if data {
                        if line == ".\r\n" {
                            data = false;
                            keep.lock().unwrap().push(std::mem::take(&mut message));
                            write.write_all(b"250 kept\r\n").await.unwrap();
                        } else {
                            message.push_str(&line);
                        }
                        continue;
                    }
                    let reply: &[u8] = match line.get(..4).unwrap_or("") {
                        "EHLO" => b"250-catcher\r\n250 8BITMIME\r\n",
                        "MAIL" | "RCPT" => b"250 ok\r\n",
                        "DATA" => {
                            data = true;
                            b"354 go on\r\n"
                        }
                        "QUIT" => {
                            let _ = write.write_all(b"221 bye\r\n").await;
                            break;
                        }
                        _ => b"500 what\r\n",
                    };
                    write.write_all(reply).await.unwrap();
                }
            });
        }
    });
    (address, kept)
}

/// Signing up and a lost passkey (agreed 8 Nov): Observer only, no account until the email is
/// confirmed, the same answer whether or not an email has an account, and no address in the record.
async fn verify_sign_up(url: &str, gov: &Governance, mails: &Kept) {
    let link_in = |mail: &str| {
        mail.split_whitespace()
            .find(|w| w.contains("/account/link#"))
            .unwrap()
            .to_string()
    };
    let last = || mails.lock().unwrap().last().cloned().unwrap_or_default();
    let count = || mails.lock().unwrap().len();
    // Closed while Observer is set aside.
    assert!(gov
        .sign_up_start("new@example.com", "newcomer-two", "New", None)
        .await
        .unwrap_err()
        .to_string()
        .contains("Observer"));
    let mut back = approved(&[]);
    for m in back["merons"].as_array_mut().unwrap() {
        if m["identity"]["path"] == "noi.gov.roles.observer" {
            m["lifecycle"]["state"] = json!("active");
        }
    }
    gov.copy_from_snapshot(&back, "test").await.unwrap();
    // A bad email or a taken handle is said, and nothing is sent.
    let n = count();
    assert!(gov
        .sign_up_start("not-an-email", "newcomer-two", "New", None)
        .await
        .is_err());
    assert!(gov
        .sign_up_start("new@example.com", "hiddenstack", "New", None)
        .await
        .unwrap_err()
        .to_string()
        .contains("taken"));
    assert_eq!(count(), n);

    // The link arrives; there is no account until it is opened.
    let said = gov
        .sign_up_start(
            "New@Example.com",
            "newcomer-two",
            "New",
            Some("203.0.113.9"),
        )
        .await
        .unwrap();
    assert_eq!(said, SENT);
    let mail = last();
    assert!(mail.contains("Subject: Confirm your email") && mail.contains("To: <new@example.com>"));
    let link = link_in(&mail);
    assert!(link.starts_with("https://gov.no-origins.localhost:3000/account/link#"));
    let mut sql = PgConnection::connect(url).await.unwrap();
    let made: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM gov.accounts WHERE handle = 'newcomer-two')",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert!(!made);
    // Opening it and pressing "Add a passkey" makes nothing yet (9 Nov, step 7, finding B).
    gov.link_start(&token_of(&link)).await.unwrap();
    let made: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM gov.accounts WHERE handle = 'newcomer-two')",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert!(!made, "no account until its passkey is made");
    // Making the passkey makes the account, an Observer in noi: reading, nothing more.
    let mut newcomer = Person::new();
    let session = newcomer.add_passkey(gov, &link).await;
    let me = Credential::Session(session.clone());
    assert_eq!(gov.me(&me).await.unwrap()["handle"], "newcomer-two");
    assert!(
        gov.may(&me, "read", &[path("noi")], None)
            .await
            .unwrap()
            .allowed
    );
    assert!(
        !gov.may(&me, "propose", &[path(MUTED)], None)
            .await
            .unwrap()
            .allowed
    );
    assert!(gov.link_start(&token_of(&link)).await.is_err(), "once");
    // Not with the email (agreed 9 Nov, finding 3): a sign-in never says whether an email has an
    // account. The handle is the way in when the browser can't offer the passkey by itself.
    assert!(gov.sign_in_start("NEW@example.com").await.is_err());
    assert!(gov.sign_in_start("new@example.com").await.is_err());
    newcomer.sign_in(gov, "newcomer-two").await;

    // The same email again: the same answer, an email saying it has an account, no link.
    let said = gov
        .sign_up_start("new@example.com", "newcomer-three", "Again", None)
        .await
        .unwrap();
    assert_eq!(said, SENT);
    assert!(last().contains("already has an account") && !last().contains("/link#"));
    assert!(last().contains("https://gov.no-origins.localhost:3000/account/sign-in"));
    // A few sign-ups an hour to one email, then wait.
    gov.sign_up_start("new@example.com", "newcomer-four", "Again", None)
        .await
        .unwrap();
    assert!(gov
        .sign_up_start("new@example.com", "newcomer-five", "Again", None)
        .await
        .unwrap_err()
        .to_string()
        .contains("too many"));

    // A lost passkey: the same answer for an unknown email, and no email sent.
    let n = count();
    assert_eq!(
        gov.lost_passkey_start("nobody@example.com").await.unwrap(),
        SENT
    );
    assert_eq!(count(), n);
    assert_eq!(
        gov.lost_passkey_start("NEW@example.com").await.unwrap(),
        SENT
    );
    // The email goes after the answer (9 Nov), so wait for it.
    for _ in 0..50 {
        if count() > n {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert_eq!(count(), n + 1, "the link arrives");
    let lost = last();
    assert!(lost.contains("Subject: Add a passkey"));
    let mut new_device = Person::new();
    new_device.add_passkey(gov, &link_in(&lost)).await;
    new_device.sign_in(gov, "newcomer-two").await;
    // The account had a passkey, so its email is told of the new one (agreed 9 Nov, Q).
    let notice = last();
    assert!(notice.contains("To: <new@example.com>") && notice.contains("for a lost passkey"));
    assert!(notice.contains("https://gov.no-origins.localhost:3000/account"));

    // An email address is never in the record.
    let everything: String =
        sqlx::query_scalar("SELECT string_agg(reason || ' ' || detail::text, ' ') FROM gov.record")
            .fetch_one(&mut sql)
            .await
            .unwrap();
    assert!(!everything.contains("example.com"));
}

/// Your account (agreed 9 Nov, step 4): add a passkey, remove one, end other sign-ins and change
/// your email, each only with a touch for exactly that; a notice when a passkey is added, and to
/// the old email when it changes.
async fn verify_your_account(url: &str, gov: &Governance, mails: &Kept) {
    let last = || mails.lock().unwrap().last().cloned().unwrap_or_default();
    let count = || mails.lock().unwrap().len();
    let link_in = |mail: &str, page: &str| {
        mail.split_whitespace()
            .find(|w| w.contains(page))
            .unwrap()
            .to_string()
    };
    let ids = |profile: &Value, list: &str| -> Vec<Uuid> {
        profile[list]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| serde_json::from_value(p["id"].clone()).unwrap())
            .collect()
    };
    let mut sql = PgConnection::connect(url).await.unwrap();

    // A new account: its first passkey sends no notice, as it makes the account.
    gov.sign_up_start("yours@example.com", "your-account", "Yours", None)
        .await
        .unwrap();
    let mut laptop = Person::new();
    let n = count();
    let here = laptop
        .add_passkey(gov, &link_in(&last(), "/account/link#"))
        .await;
    assert_eq!(count(), n, "no notice for the first passkey");
    let profile = gov.profile(&here).await.unwrap();
    assert_eq!(profile["email"], "yours@example.com");
    assert_eq!(profile["sessions"][0]["passkey_name"], "Soft passkey");
    let first_key = ids(&profile, "passkeys")[0];

    // Without a touch, nothing changes, and the refusal is recorded.
    assert!(gov.end_sign_ins(&here, Uuid::new_v4(), None).await.is_err());
    let refused: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM gov.record WHERE kind = 'account-change' AND NOT allowed",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert!(refused >= 1);
    // Your only passkey can't be removed.
    assert!(gov
        .own_touch_start(&here, Change::RemovePasskey { passkey: first_key })
        .await
        .unwrap_err()
        .to_string()
        .contains("only passkey"));

    // Adding a passkey: a touch with one you have, then the new one; it is kept once, and the
    // email is told.
    let t = laptop.touch_own(gov, &here, Change::AddPasskey).await;
    let started = gov.passkey_add_start(&here, t).await.unwrap();
    assert!(
        gov.passkey_add_start(&here, t).await.is_err(),
        "the touch counts once"
    );
    let mut key = Person::new();
    let made = key
        .key
        .do_registration(gov_page(), started.options)
        .unwrap();
    key.ids.push(made.raw_id.clone());
    let second_key = gov
        .passkey_add_finish(
            &here,
            started.ceremony,
            &made,
            "Security key",
            Some("Safari on a Mac"),
        )
        .await
        .unwrap();
    let notice = last();
    assert!(notice.contains("To: <yours@example.com>"), "{notice}");
    assert!(notice.contains("Subject: A passkey was added"));
    assert!(notice.contains("\"Security key\"") && notice.contains("on Your account"));
    assert!(notice.contains("in Safari on a Mac"));
    assert!(notice.contains("https://gov.no-origins.localhost:3000/account"));
    let with_key = key.sign_in(gov, "your-account").await;
    let with_laptop = laptop.sign_in(gov, "your-account").await;

    // Removing a passkey: never the one you confirm with; the sign-ins it made end, but not this one.
    let remove_first = Change::RemovePasskey { passkey: first_key };
    let t = laptop.touch_own(gov, &here, remove_first.clone()).await;
    assert!(gov
        .remove_passkey(&here, t, first_key)
        .await
        .unwrap_err()
        .to_string()
        .contains("confirmed with the passkey you are removing"));
    // A refusal after a good touch is recorded too (9 Nov, step 7).
    let kept: String = sqlx::query_scalar(
        "SELECT reason FROM gov.record WHERE kind = 'account-change' AND NOT allowed ORDER BY seq DESC LIMIT 1",
    )
    .fetch_one(&mut sql)
    .await
    .unwrap();
    assert!(
        kept.contains("confirmed with the passkey you are removing"),
        "{kept}"
    );
    let t = key.touch_own(gov, &here, remove_first.clone()).await;
    assert!(
        gov.remove_passkey(&here, t, second_key).await.is_err(),
        "a touch to remove one passkey removes no other"
    );
    let t = key.touch_own(gov, &here, remove_first.clone()).await;
    assert_eq!(gov.remove_passkey(&here, t, first_key).await.unwrap(), 1);
    assert!(
        gov.profile(&with_laptop).await.is_err(),
        "its sign-in ended"
    );
    assert!(
        gov.profile(&with_key).await.is_ok(),
        "another passkey's goes on"
    );
    let profile = gov.profile(&here).await.unwrap();
    assert_eq!(ids(&profile, "passkeys"), vec![second_key]);
    let account: Uuid = serde_json::from_value(profile["account"].clone()).unwrap();
    assert!(
        laptop.sign_in_any(gov, account).await.is_err(),
        "a removed passkey signs no one in"
    );
    let s = gov.sign_in_start("your-account").await.unwrap();
    let refused = match laptop.key.do_authentication(gov_page(), s.options) {
        Err(_) => true,
        Ok(c) => gov.sign_in_finish(s.ceremony, &c).await.is_err(),
    };
    assert!(refused, "nor with the handle");

    // Ending sign-ins: never this one by its ID; all the others at once.
    let this = profile["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["this"] == true)
        .unwrap()["id"]
        .clone();
    assert!(gov
        .own_touch_start(
            &here,
            Change::EndSignIn {
                session: serde_json::from_value(this).unwrap()
            }
        )
        .await
        .unwrap_err()
        .to_string()
        .contains("sign out instead"));
    let another = key.sign_in(gov, "your-account").await;
    let t = key.touch_own(gov, &here, Change::EndOtherSignIns).await;
    assert_eq!(gov.end_sign_ins(&here, t, None).await.unwrap(), 2);
    assert!(gov.profile(&with_key).await.is_err() && gov.profile(&another).await.is_err());
    assert!(gov.profile(&here).await.is_ok());

    // A new email: a link to it, which makes it yours once opened; the old one is told.
    let t = key
        .touch_own(
            gov,
            &here,
            Change::ChangeEmail {
                email: "Moved@Example.com".into(),
            },
        )
        .await;
    assert_eq!(
        gov.email_change_start(&here, t, "Moved@Example.com")
            .await
            .unwrap(),
        EMAIL_SENT
    );
    let mail = last();
    assert!(mail.contains("To: <moved@example.com>") && mail.contains("@your-account"));
    let link = link_in(&mail, "/account/email#");
    assert!(link.starts_with("https://gov.no-origins.localhost:3000/account/email#"));
    assert_eq!(
        gov.profile(&here).await.unwrap()["email"],
        "yours@example.com",
        "not until the link is opened"
    );
    gov.email_change_finish(&token_of(&link)).await.unwrap();
    assert_eq!(
        gov.profile(&here).await.unwrap()["email"],
        "moved@example.com"
    );
    let told = last();
    assert!(
        told.contains("To: <yours@example.com>")
            && told.contains("Subject: Your email for No Origins changed")
    );
    assert!(
        !told.contains("moved@"),
        "the old email isn't told the new one"
    );
    assert!(
        gov.email_change_finish(&token_of(&link)).await.is_err(),
        "once"
    );
    // The same email again is said; one with an account gets the same answer, and that address is
    // told instead, with no link.
    let t = key
        .touch_own(
            gov,
            &here,
            Change::ChangeEmail {
                email: "moved@example.com".into(),
            },
        )
        .await;
    assert!(gov
        .email_change_start(&here, t, "moved@example.com")
        .await
        .unwrap_err()
        .to_string()
        .contains("already"));
    let t = key
        .touch_own(
            gov,
            &here,
            Change::ChangeEmail {
                email: "new@example.com".into(),
            },
        )
        .await;
    assert_eq!(
        gov.email_change_start(&here, t, "new@example.com")
            .await
            .unwrap(),
        EMAIL_SENT
    );
    assert!(last().contains("To: <new@example.com>") && last().contains("already belongs"));
    assert!(!last().contains("#"));
    // Three new emails an hour, then wait.
    let t = key
        .touch_own(
            gov,
            &here,
            Change::ChangeEmail {
                email: "third@example.com".into(),
            },
        )
        .await;
    gov.email_change_start(&here, t, "third@example.com")
        .await
        .unwrap();
    let t = key
        .touch_own(
            gov,
            &here,
            Change::ChangeEmail {
                email: "fourth@example.com".into(),
            },
        )
        .await;
    assert!(gov
        .email_change_start(&here, t, "fourth@example.com")
        .await
        .unwrap_err()
        .to_string()
        .contains("too many"));

    // Still: an email address is never in the record.
    let everything: String =
        sqlx::query_scalar("SELECT string_agg(reason || ' ' || detail::text, ' ') FROM gov.record")
            .fetch_one(&mut sql)
            .await
            .unwrap();
    assert!(!everything.contains("example.com"));
}

/// Over HTTP: only this machine and its own sites, and the session as an HttpOnly, SameSite=Strict
/// cookie that the response body never contains.
async fn verify_http(url: &str, runtime: &str, lib: &Governance, you: &mut Person, session: &str) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let origin = Url::parse(&format!("http://localhost:{port}")).unwrap();
    let gov = Governance::connect(
        runtime,
        Config {
            origin: origin.clone(),
            pages: pages(),
            domain: DOMAIN.into(),
            mero: None,
            mail: Mailer::None,
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
    // Governance's home and public profiles answer anyone (9 Nov).
    let get = |p: &str| {
        client
            .get(at(p))
            .header("host", format!("localhost:{port}"))
            .send()
    };
    let home: Value = get("/api/dashboard").await.unwrap().json().await.unwrap();
    assert_eq!(home, json!({"you": null}));
    let steward = get("/api/people/steward").await.unwrap();
    assert_eq!(steward.status(), 200);
    assert_eq!(steward.json::<Value>().await.unwrap()["handle"], "steward");
    assert_eq!(get("/api/people/nobody").await.unwrap().status(), 404);
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
    let t = you
        .touch_for(
            lib,
            session,
            "invite",
            &[path("noi")],
            invite_about("newcomer", &[]),
        )
        .await;
    let invite = lib
        .invite(
            &Credential::Session(session.into()),
            Some(t),
            "newcomer",
            "Newcomer",
            "newcomer@example.com",
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
    let c = key.do_registration(gov_page(), options).unwrap();
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
    // Your account over HTTP (9 Nov): a touch for a change needs a sign-in; a change the API doesn't
    // know is refused; a link to a new email needs none, and a made-up one is refused.
    let account_touch = |cookie: Option<String>, body: Value| {
        let mut r = client
            .post(at("/api/account/touch/start"))
            .header("host", format!("localhost:{port}"))
            .json(&body);
        if let Some(c) = cookie {
            r = r.header("cookie", c);
        }
        r.send()
    };
    let signed_out = account_touch(None, json!({"change": "add-passkey"}))
        .await
        .unwrap();
    assert_eq!(signed_out.status(), 403);
    let cookie = Some(format!("noi_session={token}"));
    let started: Value = account_touch(cookie.clone(), json!({"change": "add-passkey"}))
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        started["options"]["publicKey"]["challenge"].is_string(),
        "{started}"
    );
    let unknown = account_touch(cookie, json!({"change": "make-me-an-owner"}))
        .await
        .unwrap();
    assert!(unknown.status().is_client_error());
    let made_up = client
        .post(at("/api/account/email/finish"))
        .header("host", format!("localhost:{port}"))
        // Its own visitor, so the starts counted below stay the two made above.
        .header("x-noi-visitor", "198.51.100.40")
        .json(&json!({"token": "made-up"}))
        .send()
        .await
        .unwrap();
    assert_eq!(made_up.status(), 403);

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

    // Signing in with no typing over HTTP (9 Nov): no handle, and the prompt names no passkey.
    let host = format!("localhost:{port}");
    let any: Value = client
        .post(at("/api/sign-in/start"))
        .header("host", &host)
        .header("x-noi-visitor", "203.0.113.8")
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        any["options"]["publicKey"]["challenge"].is_string(),
        "{any}"
    );
    assert!(
        any["options"]["publicKey"]["allowCredentials"]
            .as_array()
            .is_none_or(|a| a.is_empty()),
        "{any}"
    );

    // Failed sign-ins slow down whoever is trying, not the person they aim at (agreed 9 Nov,
    // finding 1): five from one address, and that address waits; others, and the person, don't.
    let junk = json!({"id": "AAAA", "rawId": "AAAA", "type": "public-key", "extensions": {},
        "response": {"authenticatorData": "AAAA", "clientDataJSON": "AAAA", "signature": "AAAA", "userHandle": null}});
    for i in 0..5 {
        let s: Value = client
            .post(at("/api/sign-in/start"))
            .header("host", &host)
            .header("x-noi-visitor", "203.0.113.7")
            .json(&json!({"handle": "steward"}))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let r = client
            .post(at("/api/sign-in/finish"))
            .header("host", &host)
            .header("x-noi-visitor", "203.0.113.7")
            .json(&json!({"ceremony": s["ceremony"], "credential": junk}))
            .send()
            .await
            .unwrap();
        assert!(!r.status().is_success(), "junk {i}");
    }
    let r = client
        .post(at("/api/sign-in/start"))
        .header("host", &host)
        .header("x-noi-visitor", "203.0.113.7")
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 429);
    let why: Value = r.json().await.unwrap();
    assert!(
        why["error"]
            .as_str()
            .unwrap()
            .starts_with("5 sign-ins failed from here in 15 minutes: wait 15 minutes"),
        "{why}"
    );
    let other = client
        .post(at("/api/sign-in/start"))
        .header("host", &host)
        .header("x-noi-visitor", "203.0.113.8")
        .json(&json!({"handle": "steward"}))
        .send()
        .await
        .unwrap();
    assert_eq!(other.status(), 200, "another address is not slowed");
    assert!(
        lib.sign_in_start("steward").await.is_ok(),
        "the person aimed at is not locked out"
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
        let for_a = key.do_authentication(gov_page(), a.options).unwrap();
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
        lib.sign_in_start("newcomer").await.is_ok(),
        "failed touches never lock signing in: only that person can fail a touch (9 Nov)"
    );
    let waited: i64 =
        sqlx::query_scalar("SELECT count(*) FROM gov.record WHERE kind = 'limit' AND account = $1")
            .bind(newcomer)
            .fetch_one(&mut sql)
            .await
            .unwrap();
    assert_eq!(waited, 1);
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
