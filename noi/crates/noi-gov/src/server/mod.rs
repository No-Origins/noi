//! Governance's own server: who (accounts, passkeys), proof (sessions, touches, run tokens), access
//! (grants and its own copy of the approved roles and rules) and the record of every answer.
//! It alone uses schema `gov`. Every refusal is recorded; anything it cannot decide is refused.
mod accounts;
mod copy;
mod decide;
pub mod http;
mod passkeys;
mod runs;
mod views;

pub use accounts::{GrantSpec, Setup};
pub use copy::Copied;
pub use crate::{Credential, Target};
pub use decide::Answer;
pub use runs::{new_voucher_key, vouch, Vouch};
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
pub(crate) const SESSION_HOURS: i64 = 12;
pub(crate) const RUN_TOKEN_MINUTES: i64 = 15;
pub(crate) const TOUCH_SECONDS: i64 = 60;
pub(crate) const CEREMONY_MINUTES: i64 = 5;
pub(crate) const FIRST_PASSKEY_MINUTES: i64 = 10;
pub(crate) const INVITATION_HOURS: i64 = 24;
/// After this many failed sign-ins and touches in `WAIT_MINUTES`, a person waits that long (agreed 8 Nov).
pub const FAILED_TOUCHES: i64 = 5;
pub const WAIT_MINUTES: i32 = 15;
/// Role paths the first owner holds.
pub const MAINTAINER: &str = "noi.gov.roles.maintainer";
pub const OWNER: &str = "noi.gov.roles.owner";

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
    #[error("Mero: {0}")]
    Mero(String),
    /// Too many tries (agreed 8 Nov): the reason says how long to wait.
    #[error("{0}")]
    TooMany(String),
}
pub type Result<T> = std::result::Result<T, Error>;
impl From<webauthn_rs::prelude::WebauthnError> for Error {
    fn from(e: webauthn_rs::prelude::WebauthnError) -> Self {
        Error::Passkey(e.to_string())
    }
}

/// Where Governance is reached, which origins may use passkeys, and where Mero is.
#[derive(Clone, Debug)]
pub struct Config {
    /// Governance's own address, such as http://localhost:8788. Passkeys need a name, not an IP.
    pub origin: Url,
    /// Mero's read API, for copying the approved roles and rules.
    pub mero: Option<Url>,
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
             FROM gov.record WHERE account = $1 AND kind IN ('sign-in','touch') AND NOT allowed
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
    pub async fn record_problem(&self, request_id: &str, method: &str, path: &str, status: i32, what: &str) -> Result<()> {
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
            Ok(mut conn) => record(&mut conn, "limit", account, None, &[], false, why, detail).await.is_ok(),
            Err(_) => false,
        };
        if !written {
            tracing::warn!("limit: {why} (not recorded)");
        }
    }

    /// Whether the database answers, and whether a copy of the roles and rules is there to decide with.
    pub async fn readiness(&self) -> (bool, bool) {
        match sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM gov.policies)").fetch_one(&self.pool).await {
            Ok(copy) => (true, copy),
            Err(_) => (false, false),
        }
    }

    pub async fn connect(url: &str, config: Config) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(5))
            .connect(url)
            .await?;
        let rp_id = config
            .origin
            .host_str()
            .ok_or_else(|| Error::Invalid("Governance's origin needs a host name".into()))?
            .to_string();
        // Every port on the same name: Governance's own pages and the Explorer share passkeys.
        let webauthn = WebauthnBuilder::new(&rp_id, &config.origin)?
            .rp_name("No Origins")
            .allow_any_port(true)
            .build()?;
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
