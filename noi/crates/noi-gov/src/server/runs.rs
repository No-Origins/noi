//! Run tokens for agents. The platform an agent runs on vouches for it with a short signed token
//! (a JWT); Governance checks it against that platform's public key and the agent's account, and
//! issues a 15-minute run token. The tool runner holds it; the model never does. On this Mac the
//! platform block is Hyperbase's own Ed25519 key, kept in an owner-only file.
use super::{
    accounts::account_by_handle, digest, record, secret, Error, Governance, Result,
    RUN_TOKEN_MINUTES,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{pkcs8::EncodePrivateKey, SigningKey};
use jsonwebtoken::{
    decode, decode_header, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

/// Who the vouch is for. It is short-lived: at most five minutes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vouch {
    /// The platform vouching, a voucher Governance knows.
    pub iss: String,
    /// The agent's handle.
    pub sub: String,
    /// Always "noi-gov".
    pub aud: String,
    /// The run this is for.
    pub run: String,
    /// The person who started the run, if one did.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_by: Option<String>,
    pub iat: i64,
    pub exp: i64,
}

const AUDIENCE: &str = "noi-gov";
const MAX_VOUCH_SECONDS: i64 = 300;

/// A new Ed25519 key for a platform: the private key as PKCS#8 PEM (for the platform only) and the
/// public key as base64url (for Governance).
pub fn new_voucher_key() -> (String, String) {
    let mut seed = [0u8; 32];
    rand::rng().fill_bytes(&mut seed);
    let key = SigningKey::from_bytes(&seed);
    let pem = key
        .to_pkcs8_pem(Default::default())
        .expect("an Ed25519 key encodes")
        .to_string();
    (pem, URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes()))
}

/// What a platform signs to vouch for one run of one agent. The tool runner sends it to Governance.
pub fn vouch(
    private_pem: &str,
    voucher: &str,
    agent: &str,
    run: &str,
    started_by: Option<&str>,
) -> Result<String> {
    let now = chrono::Utc::now().timestamp();
    let claims = Vouch {
        iss: voucher.into(),
        sub: agent.into(),
        aud: AUDIENCE.into(),
        run: run.into(),
        started_by: started_by.map(Into::into),
        iat: now,
        exp: now + 60,
    };
    let mut header = Header::new(Algorithm::EdDSA);
    header.kid = Some(voucher.into());
    let key = EncodingKey::from_ed_pem(private_pem.as_bytes())
        .map_err(|e| Error::Invalid(format!("voucher key: {e}")))?;
    encode(&header, &claims, &key).map_err(|e| Error::Invalid(format!("vouch: {e}")))
}

impl Governance {
    /// Trusts a platform to vouch for agents, by its public key.
    pub async fn add_voucher(&self, name: &str, public_key: &str) -> Result<()> {
        let mut tx = self.write().await?;
        sqlx::query("INSERT INTO gov.vouchers(name, algorithm, public_key) VALUES($1,'EdDSA',$2)")
            .bind(name)
            .bind(public_key)
            .execute(tx.as_mut())
            .await?;
        record(
            tx.as_mut(),
            "voucher-add",
            None,
            None,
            &[],
            true,
            "a platform may vouch for agents",
            json!({"name": name}),
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Checks a vouch and issues a run token. Refused unless the platform is trusted, the vouch is
    /// fresh, the agent is active and vouched for by that platform, and its sponsor is active.
    pub async fn run_token(&self, vouch_jwt: &str) -> Result<(String, Uuid)> {
        match self.issue(vouch_jwt).await {
            Ok(issued) => Ok(issued),
            Err((agent, e)) => {
                let mut conn = self.pool.acquire().await?;
                record(
                    &mut conn,
                    "run-token",
                    agent,
                    None,
                    &[],
                    false,
                    &e.to_string(),
                    json!({}),
                )
                .await?;
                Err(e)
            }
        }
    }

    async fn issue(
        &self,
        vouch_jwt: &str,
    ) -> std::result::Result<(String, Uuid), (Option<Uuid>, Error)> {
        let bad = |m: String| (None, Error::Refused(m));
        let header = decode_header(vouch_jwt).map_err(|e| bad(format!("not a vouch: {e}")))?;
        let name = header
            .kid
            .ok_or_else(|| bad("a vouch names its platform (kid)".into()))?;
        let key: Option<String> =
            sqlx::query_scalar("SELECT public_key FROM gov.vouchers WHERE name = $1")
                .bind(&name)
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| (None, e.into()))?;
        let key = key.ok_or_else(|| bad(format!("{name} is not a platform Governance trusts")))?;
        let decoding =
            DecodingKey::from_ed_components(&key).map_err(|e| bad(format!("{name}'s key: {e}")))?;
        let mut validation = Validation::new(Algorithm::EdDSA);
        validation.set_audience(&[AUDIENCE]);
        validation.set_issuer(&[&name]);
        validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
        validation.leeway = 5;
        let claims = decode::<Vouch>(vouch_jwt, &decoding, &validation)
            .map_err(|e| bad(format!("the vouch does not check out: {e}")))?
            .claims;
        if claims.exp - claims.iat > MAX_VOUCH_SECONDS {
            return Err(bad("a vouch lasts at most five minutes".into()));
        }
        // Signed for later, a vouch could last as long as its signer liked (found 9 Nov): it must
        // start now, give or take the leeway.
        if claims.iat > chrono::Utc::now().timestamp() + 5 {
            return Err(bad("a vouch cannot start in the future".into()));
        }
        let mut tx = self.write().await.map_err(|e| (None, e))?;
        let (agent, kind, state) = account_by_handle(tx.as_mut(), &claims.sub)
            .await
            .map_err(|e| (None, e))?;
        let who = Some(agent);
        let row: (Option<String>, Option<String>) = sqlx::query_as(
            "SELECT a.vouched_by, s.state FROM gov.accounts a LEFT JOIN gov.accounts s ON s.id = a.sponsor WHERE a.id = $1",
        )
        .bind(agent)
        .fetch_one(tx.as_mut())
        .await
        .map_err(|e| (who, e.into()))?;
        if kind != "agent" || state != "active" {
            return Err((
                who,
                Error::Refused(format!("{} is not an active agent", claims.sub)),
            ));
        }
        if row.0.as_deref() != Some(name.as_str()) {
            return Err((
                who,
                Error::Refused(format!("{name} does not vouch for {}", claims.sub)),
            ));
        }
        // Decision 12: an agent whose sponsor is suspended or closed cannot run.
        if row.1.as_deref() != Some("active") {
            return Err((
                who,
                Error::Refused(format!("{}'s sponsor is not active", claims.sub)),
            ));
        }
        let started_by = match &claims.started_by {
            Some(h) => {
                let (id, kind, state) = account_by_handle(tx.as_mut(), h)
                    .await
                    .map_err(|e| (who, e))?;
                if kind != "person" || state != "active" {
                    return Err((who, Error::Refused(format!("{h} cannot start runs"))));
                }
                Some(id)
            }
            None => None,
        };
        let (token, hash) = secret();
        // One run token for each vouch (found 9 Nov): the same vouch again is refused.
        sqlx::query("INSERT INTO gov.run_tokens(token_hash,agent,run,started_by,vouched_by,expires_at,vouch_hash) VALUES($1,$2,$3,$4,$5, now() + make_interval(mins => $6), $7)")
            .bind(hash)
            .bind(agent)
            .bind(&claims.run)
            .bind(started_by)
            .bind(&name)
            .bind(RUN_TOKEN_MINUTES as i32)
            .bind(digest(vouch_jwt))
            .execute(tx.as_mut())
            .await
            .map_err(|e| match e {
                sqlx::Error::Database(d) if d.is_unique_violation() => (
                    who,
                    Error::Refused("this vouch was used already: each buys one run token".into()),
                ),
                other => (who, other.into()),
            })?;
        record(
            tx.as_mut(),
            "run-token",
            who,
            None,
            &[],
            true,
            "run token issued",
            json!({"run": claims.run, "vouched_by": name, "started_by": started_by}),
        )
        .await
        .map_err(|e| (who, e))?;
        tx.commit().await.map_err(|e| (who, e.into()))?;
        Ok((token, agent))
    }
}
