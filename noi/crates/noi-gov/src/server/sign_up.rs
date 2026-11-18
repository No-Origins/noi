//! Signing up, and a lost passkey (agreed 8 Nov). Anyone may sign up, and gets Observer in all of
//! noi: reading, nothing more. No account exists until the emailed link is opened, which proves the
//! address. A lost passkey is replaced from a link sent to the account's email. Neither form ever
//! says whether an email has an account, and no email address goes into the record or a log.
use super::{
    accounts::{add_grant, link_url, new_account_as, new_link, GrantSpec, SIGN_IN_PAGE},
    check_email, check_handle, digest, record, secret, Error, Governance, Mail, Mailer, Result,
    EMAIL_LINK_MINUTES, LOST_LINKS_PER_HOUR, OBSERVER, SIGN_UPS_PER_HOUR_FROM_AN_ADDRESS,
    SIGN_UPS_PER_HOUR_TO_AN_EMAIL,
};

use serde_json::json;
use sqlx::PgConnection;
use uuid::Uuid;

/// What both forms answer, whatever happened.
pub const SENT: &str =
    "If that email can be used, a link is on its way. It works once, for 30 minutes.";

pub(crate) const SIGNATURE: &str = "\n\nNo Origins\n";

impl Governance {
    pub(crate) fn mail_ready(&self) -> Result<()> {
        match self.config.mail {
            Mailer::None => Err(Error::Mail("email is not set up on this Governance".into())),
            _ => Ok(()),
        }
    }

    /// Starts a sign-up: an email to confirm, the handle and name wanted. Sends the link, or, when
    /// the email has an account, says so to that email only. `address` is the visitor's, for the
    /// hourly limit; only its SHA-256 is kept.
    pub async fn sign_up_start(
        &self,
        email: &str,
        handle: &str,
        display_name: &str,
        address: Option<&str>,
    ) -> Result<&'static str> {
        self.mail_ready()?;
        let email = check_email(email)?;
        let handle = handle.trim();
        check_handle(handle)?;
        let name = display_name.trim();
        if name.is_empty() || name.chars().count() > 80 {
            return Err(Error::Invalid(
                "a display name has 1 to 80 characters".into(),
            ));
        }
        let mut tx = self.write().await?;
        let observer: Option<String> =
            sqlx::query_scalar("SELECT state FROM gov.policies WHERE path = $1 AND kind = 'role'")
                .bind(OBSERVER)
                .fetch_optional(tx.as_mut())
                .await?;
        if observer.as_deref() != Some("active") {
            return Err(Error::Refused(
                "signing up opens once the Observer role is active".into(),
            ));
        }
        // Unconfirmed sign-ups end after a day.
        sqlx::query("DELETE FROM gov.sign_ups WHERE made_at < now() - interval '1 day'")
            .execute(tx.as_mut())
            .await?;
        let address_hash = address.map(|a| digest(a.trim()));
        let (to_email, from_address): (i64, i64) = sqlx::query_as(
            "SELECT count(*) FILTER (WHERE lower(email) = $1), count(*) FILTER (WHERE address_hash = $2)
             FROM gov.sign_ups WHERE made_at > now() - interval '1 hour'",
        )
        .bind(&email)
        .bind(&address_hash)
        .fetch_one(tx.as_mut())
        .await?;
        if to_email >= SIGN_UPS_PER_HOUR_TO_AN_EMAIL
            || (address_hash.is_some() && from_address >= SIGN_UPS_PER_HOUR_FROM_AN_ADDRESS)
        {
            return Err(Error::TooMany(
                "too many sign-ups this hour: try again later".into(),
            ));
        }
        // Handles are public, so a taken one may be said.
        let taken: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM gov.handles WHERE handle = $1)
                 OR EXISTS(SELECT 1 FROM gov.sign_ups WHERE handle = $1 AND used_at IS NULL AND expires_at > now())",
        )
        .bind(handle)
        .fetch_one(tx.as_mut())
        .await?;
        if taken {
            return Err(Error::Invalid(format!(
                "{handle} is taken: choose another handle"
            )));
        }
        let existing: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM gov.accounts WHERE lower(email) = $1")
                .bind(&email)
                .fetch_optional(tx.as_mut())
                .await?;
        let (token, hash) = secret();
        // Kept either way, so the hourly limits count it; spent at once when the email has an account.
        sqlx::query(
            "INSERT INTO gov.sign_ups(token_hash,email,handle,display_name,address_hash,expires_at,used_at)
             VALUES($1,$2,$3,$4,$5, now() + make_interval(mins => $6), CASE WHEN $7 THEN now() END)",
        )
        .bind(&hash)
        .bind(&email)
        .bind(handle)
        .bind(name)
        .bind(&address_hash)
        .bind(EMAIL_LINK_MINUTES as i32)
        .bind(existing.is_some())
        .execute(tx.as_mut())
        .await?;
        let pages = &self.config.pages;
        let mail = match existing {
            Some(account) => {
                record(
                    tx.as_mut(),
                    "sign-up",
                    Some(account),
                    None,
                    &[],
                    false,
                    "a sign-up with the email of an account: told so by email",
                    json!({}),
                )
                .await?;
                Mail {
                    to: email,
                    subject: "Signing up to No Origins".into(),
                    body: format!(
                        "Someone, maybe you, tried to sign up to No Origins with this email. It already has an account.\n\nSign in at {pages}{SIGN_IN_PAGE}. If you lost your passkey, choose \"Lost your passkey?\" there.\n\nIf it wasn't you, ignore this email: nothing changes.{SIGNATURE}"
                    ),
                }
            }
            None => {
                record(
                    tx.as_mut(),
                    "sign-up",
                    None,
                    None,
                    &[],
                    true,
                    "a sign-up, waiting for its email to be confirmed",
                    json!({ "handle": handle }),
                )
                .await?;
                let link = link_url(pages, &token);
                Mail {
                    to: email,
                    subject: "Confirm your email for No Origins".into(),
                    body: format!(
                        "Open this link within {EMAIL_LINK_MINUTES} minutes to confirm your email and add your passkey. Your account, {handle}, is made then, able to look around No Origins.\n\n{link}\n\nIf you didn't sign up, ignore this email: no account is made.{SIGNATURE}"
                    ),
                }
            }
        };
        // Sent once the change is kept and Governance's one write lock is free: a slow mail server
        // must never hold up everyone else (architecture review, 9 Nov).
        tx.commit().await?;
        self.config.mail.send(&mail).await?;
        Ok(SENT)
    }

    /// A sign-up's link, opened: its handle and name, while it waits; nothing is made yet (9 Nov,
    /// step 7, finding B). The account is made when its passkey is.
    pub(crate) async fn sign_up_waiting(
        &self,
        conn: &mut PgConnection,
        token_hash: &[u8],
    ) -> Result<Option<(String, String)>> {
        Ok(sqlx::query_as(
            "SELECT handle, display_name FROM gov.sign_ups
             WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
        )
        .bind(token_hash)
        .fetch_optional(conn)
        .await?)
    }

    /// Makes a sign-up's account as its first passkey is kept (agreed 8 Nov; made then since 9 Nov,
    /// finding B): the link proved the email, the passkey is being made. An Observer in noi, with the
    /// ID its passkey carries. Returns its handle.
    pub(crate) async fn make_signed_up(
        &self,
        conn: &mut PgConnection,
        token_hash: &[u8],
        account: Uuid,
    ) -> Result<String> {
        let row: Option<(String, String, String)> = sqlx::query_as(
            "UPDATE gov.sign_ups SET used_at = now()
             WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
             RETURNING email, handle, display_name",
        )
        .bind(token_hash)
        .fetch_optional(&mut *conn)
        .await?;
        let (email, handle, name) =
            row.ok_or_else(|| Error::Refused("this link has expired or was used".into()))?;
        new_account_as(
            &mut *conn,
            account,
            &handle,
            &name,
            "person",
            "active",
            None,
            Some(&email),
            None,
        )
        .await
        .map_err(|e| match e {
            Error::Invalid(_) => {
                Error::Refused("that handle or email was taken meanwhile: sign up again".into())
            }
            other => other,
        })?;
        add_grant(
            &mut *conn,
            account,
            &GrantSpec {
                role: OBSERVER.into(),
                scope: "noi".into(),
            },
            None,
        )
        .await?;
        record(
            &mut *conn,
            "sign-up",
            Some(account),
            None,
            &[format!("account:{account}")],
            true,
            "an account from a sign-up: its email confirmed and its passkey made, Observer in noi",
            json!({ "handle": handle }),
        )
        .await?;
        Ok(handle)
    }

    /// A lost passkey: a link to add one, sent to the email of the person who has it, if anyone
    /// does. The answer is the same either way, and as quick: the email goes after the answer, so
    /// the wait never says whether an email has an account (architecture review, 9 Nov).
    pub async fn lost_passkey_start(&self, email: &str) -> Result<&'static str> {
        self.mail_ready()?;
        let email = check_email(email)?;
        let mut tx = self.write().await?;
        let row: Option<(Uuid, String)> = sqlx::query_as(
            "SELECT id, state FROM gov.accounts WHERE kind = 'person' AND lower(email) = $1",
        )
        .bind(&email)
        .fetch_optional(tx.as_mut())
        .await?;
        let Some((account, state)) = row else {
            return Ok(SENT);
        };
        if !(state == "active" || state == "invited") {
            return Ok(SENT);
        }
        let recent: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM gov.links WHERE account = $1 AND purpose = 'lost-passkey' AND made_at > now() - interval '1 hour'",
        )
        .bind(account)
        .fetch_one(tx.as_mut())
        .await?;
        if recent >= LOST_LINKS_PER_HOUR {
            record(
                tx.as_mut(),
                "lost-passkey-link",
                Some(account),
                None,
                &[],
                false,
                "too many lost-passkey links this hour: none sent",
                json!({}),
            )
            .await?;
            tx.commit().await?;
            return Ok(SENT);
        }
        let link = new_link(
            tx.as_mut(),
            &self.config.pages,
            "lost-passkey",
            account,
            None,
            EMAIL_LINK_MINUTES,
        )
        .await?;
        record(
            tx.as_mut(),
            "lost-passkey-link",
            Some(account),
            None,
            &[],
            true,
            "a link for a lost passkey, sent to the account's email",
            json!({}),
        )
        .await?;
        tx.commit().await?;
        self.send_later(
            account,
            "lost-passkey",
            Mail {
                to: email,
                subject: "Add a passkey to No Origins".into(),
                body: format!(
                    "Open this link within {EMAIL_LINK_MINUTES} minutes to add a passkey on the device you're using, and sign in.\n\n{link}\n\nIf you didn't ask for this, ignore this email: your account stays as it is.{SIGNATURE}"
                ),
            },
        );
        Ok(SENT)
    }

    /// Sends an email after answering. If it can't be sent, the record says so (never to where).
    fn send_later(&self, account: Uuid, about: &'static str, mail: Mail) {
        let gov = self.clone();
        tokio::spawn(async move {
            let Err(e) = gov.config.mail.send(&mail).await else {
                return;
            };
            tracing::warn!("an email about {about} was not sent: {e}");
            if let Ok(mut conn) = gov.pool.acquire().await {
                let _ = record(
                    &mut conn,
                    "mail",
                    Some(account),
                    None,
                    &[],
                    false,
                    &format!("an email could not be sent: {e}"),
                    json!({ "about": about }),
                )
                .await;
            }
        });
    }
}
