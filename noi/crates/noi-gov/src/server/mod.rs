//! Governance's own server: who (accounts, passkeys), proof (sessions, touches, run tokens), access
//! (grants, and the roles and rules it keeps, every version) and the record of every answer.
//! It alone uses schema `gov`. Every refusal is recorded; anything it cannot decide is refused.
mod accounts;
mod decide;
pub mod http;
mod mail;
mod own;
mod passkeys;
mod roles;
mod runs;
mod sign_up;
mod views;

pub use crate::{Credential, Target};
pub use accounts::{grant_about, invite_about, GrantSpec, Setup};
pub use decide::Answer;
pub use mail::{Mail, Mailer};
pub use own::{Change, EMAIL_SENT};
pub use roles::{decide_about, first, Decide, Draft, First, Operation, Proposal, Version};
pub use runs::{new_voucher_key, vouch, Vouch};
pub use sign_up::SENT;
pub use views::{device_label, RecordFilter};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPoolOptions, Connection, PgConnection, PgPool, Postgres, Transaction};
use std::{sync::Arc, time::Duration};
use url::Url;
use uuid::Uuid;
use webauthn_rs::{Webauthn, WebauthnBuilder};

/// Everyone signed out acts as this account. An owner may grant it reading, and nothing more.
pub const VISITORS: Uuid = Uuid::from_u128(0x00000000_0000_4000_8000_000000000001);
/// The cookie a signed-in browser carries. Pages never see it: it is HttpOnly and SameSite strict.
pub const SESSION_COOKIE: &str = "noi_session";
/// A session ends after this many hours unused; each use moves the end, up to `SESSION_DAYS` after
/// signing in (agreed 9 Nov). The cookie lasts that longest time; Governance decides when it ends.
pub(crate) const SESSION_HOURS: i64 = 12;
pub(crate) const SESSION_DAYS: i64 = 30;
pub(crate) const RUN_TOKEN_MINUTES: i64 = 15;
pub(crate) const TOUCH_SECONDS: i64 = 60;
pub(crate) const CEREMONY_MINUTES: i64 = 5;
pub(crate) const FIRST_PASSKEY_MINUTES: i64 = 10;
pub(crate) const INVITATION_HOURS: i64 = 24;
/// A link sent by email, to confirm a sign-up or add a passkey when one is lost (agreed 8 Nov).
pub(crate) const EMAIL_LINK_MINUTES: i64 = 30;
/// At most this many sign-ups an hour to one email, and from one address (agreed 8 Nov).
pub const SIGN_UPS_PER_HOUR_TO_AN_EMAIL: i64 = 3;
pub const SIGN_UPS_PER_HOUR_FROM_AN_ADDRESS: i64 = 5;
/// At most this many lost-passkey emails an hour to one account.
pub const LOST_LINKS_PER_HOUR: i64 = 3;
/// At most this many new emails an hour for one account, each a link sent to it (9 Nov).
pub const EMAIL_CHANGES_PER_HOUR: i64 = 3;
/// After this many failed touches in `WAIT_MINUTES`, that person waits that long (agreed 8 Nov). Only
/// a signed-in person can fail a touch. Failed sign-ins slow down whoever is trying instead, at the
/// door, so nobody can lock someone else out (agreed 9 Nov, finding 1); see `http`.
pub const FAILED_TOUCHES: i64 = 5;
pub const FAILED_SIGN_INS: usize = 5;
pub const WAIT_MINUTES: i32 = 15;
/// Role paths the first owner holds.
pub const MAINTAINER: &str = "noi.gov.roles.maintainer";
pub const OWNER: &str = "noi.gov.roles.owner";
/// What everyone who signs up holds, in all of noi: reading, and nothing more (agreed 8 Nov).
pub const OBSERVER: &str = "noi.gov.roles.observer";

#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// Governance answered no. The reason is safe to show.
    #[error("refused: {0}")]
    Refused(String),
    #[error("{0}")]
    Invalid(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("passkey: {0}")]
    Passkey(String),
    #[error("database: {0}")]
    Database(#[from] sqlx::Error),
    #[error("migration: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    /// Too many tries (agreed 8 Nov): the reason says how long to wait.
    #[error("{0}")]
    TooMany(String),
    /// Email could not be sent. Never names an address.
    #[error("mail: {0}")]
    Mail(String),
}
pub type Result<T> = std::result::Result<T, Error>;
impl From<webauthn_rs::prelude::WebauthnError> for Error {
    fn from(e: webauthn_rs::prelude::WebauthnError) -> Self {
        Error::Passkey(e.to_string())
    }
}

/// Where Governance is reached, where its pages are, and where its email goes.
#[derive(Clone, Debug)]
pub struct Config {
    /// Governance's own address, such as http://localhost:8788. It answers only its API there.
    pub origin: Url,
    /// Where Governance's pages are: in the one app, on gov's own name, such as
    /// http://gov.no-origins.localhost:3000/ (agreed 8 Nov). One-time links open there.
    pub pages: Url,
    /// The base name every system's pages are under: no-origins.localhost on this Mac,
    /// no-origins.com hosted (agreed 8 Nov). Passkeys belong to it, so one passkey works on every
    /// subdomain: signing in on gov, a touch on mero.
    pub domain: String,
    /// Where email goes: links to confirm a sign-up and to add a lost passkey.
    pub mail: Mailer,
}

#[derive(Clone)]
pub struct Governance {
    pool: PgPool,
    webauthn: Arc<Webauthn>,
    config: Config,
}

impl Governance {
    /// Refuses a sign-in or touch while a person has failed too often (counted from the record, so it
    /// holds across restarts). A touch that was cancelled never finished, so it does not count.
    pub(crate) async fn not_locked(&self, conn: &mut PgConnection, account: Uuid) -> Result<()> {
        let (failed, wait): (i64, Option<f64>) = sqlx::query_as(
            "SELECT count(*), ceil(extract(epoch FROM max(at) + make_interval(mins => $2) - now()) / 60)::float8
             FROM gov.record WHERE account = $1 AND kind = 'touch' AND NOT allowed
             AND at > now() - make_interval(mins => $2)",
        )
        .bind(account)
        .bind(WAIT_MINUTES)
        .fetch_one(conn)
        .await?;
        if failed < FAILED_TOUCHES {
            return Ok(());
        }
        let minutes = wait.unwrap_or(WAIT_MINUTES as f64).max(1.0) as i64;
        let why = format!("{failed} touches failed in {WAIT_MINUTES} minutes: wait {minutes} minute{}, then try again", if minutes == 1 { "" } else { "s" });
        self.note_limit(Some(account), &why, json!({})).await;
        Err(Error::TooMany(why))
    }

    /// Keeps one problem for the Problems page (agreed 8 Nov): a failed answer and its inner reason,
    /// never a secret.
    pub async fn record_problem(
        &self,
        request_id: &str,
        method: &str,
        path: &str,
        status: i32,
        what: &str,
    ) -> Result<()> {
        sqlx::query("INSERT INTO gov.problems(request_id, method, path, status, what) VALUES($1,$2,$3,$4,$5)")
            .bind(request_id)
            .bind(method)
            .bind(path)
            .bind(status)
            .bind(what)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Records a limit's refusal. If the record can't be written, the log still says it.
    pub(crate) async fn note_limit(&self, account: Option<Uuid>, why: &str, detail: Value) {
        let written = match self.pool.acquire().await {
            Ok(mut conn) => record(&mut conn, "limit", account, None, &[], false, why, detail)
                .await
                .is_ok(),
            Err(_) => false,
        };
        if !written {
            tracing::warn!("limit: {why} (not recorded)");
        }
    }

    /// Clears what has expired (agreed 9 Nov, step 7; finding C): unfinished sign-ups and new emails
    /// after a day, prompts and touches a day after they ended, links a week after, sign-ins a month
    /// after they ended. Runs every hour, so a quiet site is cleared too. The record keeps what
    /// happened. Returns how many rows went.
    pub async fn tidy(&self) -> Result<u64> {
        let mut tx = self.pool.begin().await?;
        let mut gone = 0;
        for clear in [
            "DELETE FROM gov.sign_ups WHERE made_at < now() - interval '1 day'",
            "DELETE FROM gov.email_changes WHERE made_at < now() - interval '1 day'",
            "DELETE FROM gov.ceremonies WHERE expires_at < now() - interval '1 day'",
            "DELETE FROM gov.touches WHERE expires_at < now() - interval '1 day'",
            "DELETE FROM gov.links l WHERE expires_at < now() - interval '7 days'
               AND NOT EXISTS (SELECT 1 FROM gov.ceremonies c WHERE c.link = l.token_hash)",
            "DELETE FROM gov.sessions s WHERE least(coalesce(ended_at, expires_at), expires_at) < now() - interval '30 days'
               AND NOT EXISTS (SELECT 1 FROM gov.touches t WHERE t.session = s.token_hash)",
        ] {
            gone += sqlx::query(clear).execute(tx.as_mut()).await?.rows_affected();
        }
        tx.commit().await?;
        Ok(gone)
    }

    /// Whether the database answers, and whether it holds roles and rules to decide with.
    pub async fn readiness(&self) -> (bool, bool) {
        match sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM gov.policies)")
            .fetch_one(&self.pool)
            .await
        {
            Ok(held) => (true, held),
            Err(_) => (false, false),
        }
    }

    pub async fn connect(url: &str, mut config: Config) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect(url)
            .await?;
        // A folder, so a link is made inside it: …/ + link → …/link.
        if !config.pages.path().ends_with('/') {
            let folder = format!("{}/", config.pages.path());
            config.pages.set_path(&folder);
        }
        let host = config
            .pages
            .host_str()
            .ok_or_else(|| Error::Invalid("Governance's pages need a host name".into()))?;
        let domain = config.domain.trim_matches('.').to_ascii_lowercase();
        if domain.is_empty() || !(host == domain || host.ends_with(&format!(".{domain}"))) {
            return Err(Error::Invalid(format!(
                "Governance's pages ({host}) are not under the base name ({domain})"
            )));
        }
        // The base name itself, in the pages' scheme: every name under it, on any port, may use a
        // passkey (gov to sign in, mero to touch); a name outside it may not.
        let rp_origin = Url::parse(&format!("{}://{domain}", config.pages.scheme()))
            .map_err(|e| Error::Invalid(format!("the base name: {e}")))?;
        // Passkeys belong to the base name: every subdomain under it, on any port, shares them.
        let webauthn = WebauthnBuilder::new(&domain, &rp_origin)?
            .rp_name("No Origins")
            .allow_subdomains(true)
            .allow_any_port(true)
            .build()?;
        config.domain = domain;
        Ok(Self {
            pool,
            webauthn: Arc::new(webauthn),
            config,
        })
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    /// Administrative: applies Governance's migrations, tracked in their own schema.
    pub async fn migrate(&self) -> Result<()> {
        let migrator = sqlx::migrate!("./migrations");
        let mut conn = PgConnection::connect_with(&self.pool.connect_options()).await?;
        let mut tx = conn.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(726245911)")
            .execute(tx.as_mut())
            .await?;
        sqlx::query("CREATE SCHEMA IF NOT EXISTS gov_migrations")
            .execute(tx.as_mut())
            .await?;
        sqlx::query("REVOKE ALL ON SCHEMA gov_migrations FROM PUBLIC")
            .execute(tx.as_mut())
            .await?;
        tx.commit().await?;
        sqlx::query("SET search_path TO gov_migrations, pg_catalog")
            .execute(&mut conn)
            .await?;
        migrator.run_direct(&mut conn).await?;
        Ok(())
    }

    /// One writer at a time, so checks and the changes they guard cannot interleave.
    pub(crate) async fn write(&self) -> Result<Transaction<'_, Postgres>> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(726245912)")
            .execute(tx.as_mut())
            .await?;
        Ok(tx)
    }

    /// The record, newest first: what Governance answered and every sign-in.
    pub async fn record_since(&self, after: i64) -> Result<Vec<Value>> {
        let rows: Vec<(i64, Value)> = sqlx::query_as(
            "SELECT seq, jsonb_build_object('seq',seq,'at',at,'kind',kind,'account',account,'action',action,'resources',resources,'allowed',allowed,'reason',reason,'detail',detail) FROM gov.record WHERE seq > $1 ORDER BY seq",
        )
        .bind(after)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|(_, v)| v).collect())
    }
}

/// A new one-time secret and the only thing Governance keeps of it: its SHA-256.
pub(crate) fn secret() -> (String, Vec<u8>) {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let token = URL_SAFE_NO_PAD.encode(bytes);
    let hash = digest(&token);
    (token, hash)
}
pub(crate) fn digest(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Appends to the record. Called inside the transaction that does what it records, or on its own
/// for a refusal, so a refusal is recorded even though nothing else happens.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn record(
    conn: &mut PgConnection,
    kind: &str,
    account: Option<Uuid>,
    action: Option<&str>,
    resources: &[String],
    allowed: bool,
    reason: &str,
    detail: Value,
) -> Result<i64> {
    Ok(sqlx::query_scalar(
        "INSERT INTO gov.record(kind,account,action,resources,allowed,reason,detail) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING seq",
    )
    .bind(kind)
    .bind(account)
    .bind(action)
    .bind(json!(resources))
    .bind(allowed)
    .bind(reason)
    .bind(detail)
    .fetch_one(conn)
    .await?)
}

/// An email, as Governance keeps it: trimmed and in lowercase, one @, a dot in its domain, and
/// nothing that could break a line. The reason never repeats the address.
pub(crate) fn check_email(email: &str) -> Result<String> {
    let email = email.trim().to_lowercase();
    let ok = (3..=254).contains(&email.len())
        && email.matches('@').count() == 1
        && !email
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || "<>(),;:\\\"[]".contains(c))
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
                && !domain.contains("..")
        });
    if ok {
        Ok(email)
    } else {
        Err(Error::Invalid(
            "that is not an email address Governance can use".into(),
        ))
    }
}

/// A handle: lowercase letters, digits and single hyphens, 3 to 40 characters.
pub(crate) fn check_handle(handle: &str) -> Result<()> {
    let ok = (3..=40).contains(&handle.len())
        && handle.starts_with(|c: char| c.is_ascii_lowercase())
        && !handle.ends_with('-')
        && !handle.contains("--")
        && handle
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok {
        Ok(())
    } else {
        Err(Error::Invalid(format!(
            "{handle} is not a handle: 3 to 40 lowercase letters, digits and single hyphens"
        )))
    }
}
/// A place in NOI: `noi` or a path under it.
pub(crate) fn check_scope(scope: &str) -> Result<()> {
    let ok = scope == "noi"
        || (scope.starts_with("noi.")
            && scope.split('.').all(|p| {
                !p.is_empty()
                    && p.len() <= 63
                    && p.starts_with(|c: char| c.is_ascii_lowercase())
                    && p.chars()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            }));
    if ok {
        Ok(())
    } else {
        Err(Error::Invalid(format!("{scope} is not a place in NOI")))
    }
}
