//! Your account (agreed 9 Nov, step 4): your passkeys, where you're signed in, and your email. It is
//! yours alone, so no role is asked for, as with signing out; but every change needs a fresh touch
//! for exactly that change, so a stolen sign-in can't add a passkey, remove one, end your other
//! sign-ins or move your email. Whenever a passkey is added to an account that had one, its email
//! gets a notice, and a changed email tells the old one (agreed 9 Nov, Q). No email address goes
//! into the record or a log.
use super::{
    check_email,
    decide::Asker,
    digest,
    passkeys::{close_ceremony, keep_passkey, passkey_name, passkeys_of, take_ceremony, Started},
    record, secret,
    sign_up::SIGNATURE,
    Credential, Error, Governance, Mail, Result, CEREMONY_MINUTES, EMAIL_CHANGES_PER_HOUR,
    EMAIL_LINK_MINUTES,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{PgConnection, Postgres, Transaction};
use uuid::Uuid;
use webauthn_rs::prelude::{
    CreationChallengeResponse, PasskeyRegistration, RegisterPublicKeyCredential,
    RequestChallengeResponse,
};

/// Your account's page in the one app, under Governance's pages.
pub(crate) const ACCOUNT_PAGE: &str = "account";
/// Where a link to confirm a new email opens: the token after `#`, which no server's log sees.
const EMAIL_PAGE: &str = "account/email";

/// What changing your email answers, whatever happened: it never says whether an email has an
/// account.
pub const EMAIL_SENT: &str =
    "A link is on its way to that email. Open it within 30 minutes to make it your email.";

/// A change to your own account, as a touch names it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "change", rename_all = "kebab-case")]
pub enum Change {
    AddPasskey,
    RemovePasskey {
        passkey: Uuid,
    },
    EndSignIn {
        session: Uuid,
    },
    EndOtherSignIns,
    /// The new address goes with the touch (9 Nov, step 7), so a touch for one address can't be
    /// used for another. Only its SHA-256 is kept, in the touch and the record.
    ChangeEmail {
        email: String,
    },
}

impl Change {
    /// What the touch approves: this change, on your account and the one thing it is about. The
    /// names differ from the owners' actions (remove-passkey, end-session), so a touch for one can
    /// never stand for the other.
    pub(crate) fn intent(&self, account: Uuid) -> Value {
        let mut resources = vec![format!("account:{account}")];
        let action = match self {
            Change::AddPasskey => "add-my-passkey",
            Change::RemovePasskey { passkey } => {
                resources.push(format!("passkey:{passkey}"));
                "remove-my-passkey"
            }
            Change::EndSignIn { session } => {
                resources.push(format!("session:{session}"));
                "end-my-sign-in"
            }
            Change::EndOtherSignIns => "end-my-other-sign-ins",
            Change::ChangeEmail { email } => {
                // The address as Governance keeps it, so the touch and its use agree.
                let kept = email.trim().to_lowercase();
                let print: String = Sha256::digest(kept.as_bytes())
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect();
                resources.push(format!("email:{print}"));
                "change-my-email"
            }
        };
        resources.sort();
        json!({"action": action, "resources": resources})
    }
}

impl Governance {
    /// The person a session belongs to, for a change to their own account.
    async fn yourself(&self, conn: &mut PgConnection, session: &str) -> Result<Asker> {
        let you = self
            .asker(conn, &Credential::Session(session.into()))
            .await?;
        if you.kind != "person" {
            return Err(Error::Refused(
                "only a person has an account to change".into(),
            ));
        }
        Ok(you)
    }

    /// Whether a change can be made at all: said before the touch, and checked again with it.
    async fn check_change(
        &self,
        conn: &mut PgConnection,
        you: &Asker,
        change: &Change,
    ) -> Result<()> {
        match change {
            Change::RemovePasskey { passkey } => {
                let live: Vec<Uuid> = sqlx::query_scalar(
                    "SELECT id FROM gov.passkeys WHERE account = $1 AND removed_at IS NULL",
                )
                .bind(you.account)
                .fetch_all(conn)
                .await?;
                if !live.contains(passkey) {
                    return Err(Error::NotFound(
                        "no such passkey of yours, or it is removed".into(),
                    ));
                }
                if live.len() < 2 {
                    return Err(Error::Refused(
                        "that is your only passkey: add another before removing it".into(),
                    ));
                }
            }
            Change::EndSignIn { session } => {
                let this: Option<bool> = sqlx::query_scalar(
                    "SELECT token_hash = $3 FROM gov.sessions
                     WHERE id = $1 AND account = $2 AND ended_at IS NULL AND expires_at > now()",
                )
                .bind(session)
                .bind(you.account)
                .bind(&you.session)
                .fetch_optional(conn)
                .await?;
                match this {
                    None => {
                        return Err(Error::NotFound(
                            "no such sign-in of yours, or it has ended".into(),
                        ))
                    }
                    Some(true) => {
                        return Err(Error::Invalid(
                            "that is this sign-in: sign out instead".into(),
                        ))
                    }
                    Some(false) => {}
                }
            }
            Change::ChangeEmail { email } => {
                self.mail_ready()?;
                check_email(email)?;
            }
            Change::AddPasskey | Change::EndOtherSignIns => {}
        }
        Ok(())
    }

    /// A touch prompt for one change to your own account. What it is about must be yours.
    pub async fn own_touch_start(
        &self,
        session: &str,
        change: Change,
    ) -> Result<Started<RequestChallengeResponse>> {
        let mut tx = self.write().await?;
        let you = self.yourself(tx.as_mut(), session).await?;
        self.check_change(tx.as_mut(), &you, &change).await?;
        let started = self
            .open_touch(tx.as_mut(), &you, change.intent(you.account))
            .await?;
        tx.commit().await?;
        Ok(started)
    }

    /// Uses the touch made for this change, and says which passkey made it. A refusal undoes the
    /// change's transaction and is recorded, as a refused decision is.
    async fn touched<'t>(
        &'t self,
        mut tx: Transaction<'t, Postgres>,
        you: &Asker,
        touch: Uuid,
        change: &Change,
    ) -> Result<(Transaction<'t, Postgres>, Option<Uuid>)> {
        let intent = change.intent(you.account);
        match self.take_touch(tx.as_mut(), you, touch, &intent).await {
            Ok(passkey) => Ok((tx, passkey)),
            Err(e) => {
                tx.rollback().await?;
                let mut conn = self.pool.acquire().await?;
                record(
                    &mut conn,
                    "account-change",
                    Some(you.account),
                    None,
                    &[],
                    false,
                    &e.to_string(),
                    json!({"change": intent["action"]}),
                )
                .await?;
                Err(e)
            }
        }
    }

    /// A change refused after its touch was good (9 Nov, step 7): undone, so the touch is unused,
    /// and recorded, as a refused touch is, so the record says what was tried and why not.
    async fn no_after_touch(
        &self,
        tx: Transaction<'_, Postgres>,
        you: &Asker,
        change: &Change,
        e: Error,
    ) -> Error {
        if let Err(undone) = tx.rollback().await {
            return undone.into();
        }
        if let Ok(mut conn) = self.pool.acquire().await {
            let _ = record(
                &mut conn,
                "account-change",
                Some(you.account),
                None,
                &[],
                false,
                &e.to_string(),
                json!({"change": change.intent(you.account)["action"]}),
            )
            .await;
        }
        e
    }

    /// Starts adding a passkey while signed in, with the touch you made for it: options for the
    /// browser to make one, which none of your passkeys may already be.
    pub async fn passkey_add_start(
        &self,
        session: &str,
        touch: Uuid,
    ) -> Result<Started<CreationChallengeResponse>> {
        let mut tx = self.write().await?;
        let you = self.yourself(tx.as_mut(), session).await?;
        let (mut tx, _) = self.touched(tx, &you, touch, &Change::AddPasskey).await?;
        let (handle, name): (String, String) =
            sqlx::query_as("SELECT handle, display_name FROM gov.accounts WHERE id = $1")
                .bind(you.account)
                .fetch_one(tx.as_mut())
                .await?;
        let existing: Vec<_> = passkeys_of(tx.as_mut(), you.account)
            .await?
            .into_iter()
            .map(|(_, p)| p.cred_id().clone())
            .collect();
        let (options, state) = self.webauthn.start_passkey_registration(
            you.account,
            &handle,
            &name,
            Some(existing),
        )?;
        let ceremony = Uuid::new_v4();
        sqlx::query("INSERT INTO gov.ceremonies(id,kind,account,state,session,expires_at) VALUES($1,'add-passkey',$2,$3,$4, now() + make_interval(mins => $5))")
            .bind(ceremony)
            .bind(you.account)
            .bind(serde_json::to_value(&state).map_err(|e| Error::Passkey(e.to_string()))?)
            .bind(&you.session)
            .bind(CEREMONY_MINUTES as i32)
            .execute(tx.as_mut())
            .await?;
        tx.commit().await?;
        Ok(Started { ceremony, options })
    }

    /// Keeps the passkey your browser made, under the name you gave it, and sends a notice to your
    /// email. Returns its ID.
    pub async fn passkey_add_finish(
        &self,
        session: &str,
        ceremony: Uuid,
        credential: &RegisterPublicKeyCredential,
        name: &str,
        device: Option<&str>,
    ) -> Result<Uuid> {
        let mut tx = self.write().await?;
        let you = self.yourself(tx.as_mut(), session).await?;
        let (account, state, _, opened_by, _) =
            take_ceremony(tx.as_mut(), ceremony, "add-passkey").await?;
        if account != Some(you.account) || opened_by != you.session {
            return Err(Error::Refused(
                "this prompt was started by another sign-in".into(),
            ));
        }
        let state: PasskeyRegistration =
            serde_json::from_value(state).map_err(|e| Error::Passkey(e.to_string()))?;
        let passkey = match self
            .webauthn
            .finish_passkey_registration(credential, &state)
        {
            Ok(p) => p,
            Err(e) => {
                tx.rollback().await?;
                let mut conn = self.pool.acquire().await?;
                close_ceremony(&mut conn, ceremony).await?;
                record(
                    &mut conn,
                    "passkey-add",
                    Some(you.account),
                    None,
                    &[],
                    false,
                    &format!("the passkey did not check out: {e}"),
                    json!({}),
                )
                .await?;
                return Err(e.into());
            }
        };
        let name = passkey_name(name);
        let id = keep_passkey(tx.as_mut(), you.account, &name, &passkey).await?;
        record(
            tx.as_mut(),
            "passkey-add",
            Some(you.account),
            None,
            &[],
            true,
            "passkey added on Your account",
            json!({"passkey": id, "name": &name}),
        )
        .await?;
        tx.commit().await?;
        self.tell_passkey_added(you.account, &name, "on Your account", device)
            .await;
        Ok(id)
    }

    /// Removes one of your passkeys (agreed 9 Nov: "remove other passkeys"), never the one you
    /// confirmed with, so a passkey that works always stays. The sign-ins it made end too, all but
    /// this one. Returns how many ended.
    pub async fn remove_passkey(&self, session: &str, touch: Uuid, passkey: Uuid) -> Result<u64> {
        let mut tx = self.write().await?;
        let you = self.yourself(tx.as_mut(), session).await?;
        let change = Change::RemovePasskey { passkey };
        let (mut tx, confirmed_with) = self.touched(tx, &you, touch, &change).await?;
        if let Err(e) = self.check_change(tx.as_mut(), &you, &change).await {
            return Err(self.no_after_touch(tx, &you, &change, e).await);
        }
        let no = match confirmed_with {
            Some(p) if p == passkey => Some("you confirmed with the passkey you are removing: confirm with another one, so one that works stays"),
            None => Some("this touch doesn't say which passkey made it: touch again"),
            Some(_) => None,
        };
        if let Some(no) = no {
            return Err(self
                .no_after_touch(tx, &you, &change, Error::Refused(no.into()))
                .await);
        }
        let name: String = sqlx::query_scalar(
            "UPDATE gov.passkeys SET removed_at = now() WHERE id = $1 AND account = $2 AND removed_at IS NULL RETURNING name",
        )
        .bind(passkey)
        .bind(you.account)
        .fetch_one(tx.as_mut())
        .await?;
        let ended = sqlx::query(
            "UPDATE gov.sessions SET ended_at = now(), ended_by = $2
             WHERE passkey = $1 AND account = $2 AND ended_at IS NULL AND token_hash <> $3",
        )
        .bind(passkey)
        .bind(you.account)
        .bind(&you.session)
        .execute(tx.as_mut())
        .await?
        .rows_affected();
        record(
            tx.as_mut(),
            "passkey-remove",
            Some(you.account),
            None,
            &[],
            true,
            "passkey removed on Your account",
            json!({"passkey": passkey, "name": name, "sign_ins_ended": ended}),
        )
        .await?;
        tx.commit().await?;
        Ok(ended)
    }

    /// Ends one of your other sign-ins, by its ID, or every one but this. Returns how many ended.
    pub async fn end_sign_ins(
        &self,
        session: &str,
        touch: Uuid,
        which: Option<Uuid>,
    ) -> Result<u64> {
        let change = match which {
            Some(session) => Change::EndSignIn { session },
            None => Change::EndOtherSignIns,
        };
        let mut tx = self.write().await?;
        let you = self.yourself(tx.as_mut(), session).await?;
        let (mut tx, _) = self.touched(tx, &you, touch, &change).await?;
        if let Err(e) = self.check_change(tx.as_mut(), &you, &change).await {
            return Err(self.no_after_touch(tx, &you, &change, e).await);
        }
        let ended = sqlx::query(
            "UPDATE gov.sessions SET ended_at = now(), ended_by = $1
             WHERE account = $1 AND ended_at IS NULL AND token_hash <> $2 AND ($3::uuid IS NULL OR id = $3)",
        )
        .bind(you.account)
        .bind(&you.session)
        .bind(which)
        .execute(tx.as_mut())
        .await?
        .rows_affected();
        record(
            tx.as_mut(),
            "sign-out",
            Some(you.account),
            None,
            &[],
            true,
            if which.is_some() {
                "ended another sign-in, on Your account"
            } else {
                "ended every other sign-in, on Your account"
            },
            json!({"session": which, "ended": ended}),
        )
        .await?;
        tx.commit().await?;
        Ok(ended)
    }

    /// Starts changing your email, with the touch you made for it: a link to the new address,
    /// which makes it yours once opened. The answer is the same whether or not the address has an
    /// account; if it has, that address is told so instead.
    pub async fn email_change_start(
        &self,
        session: &str,
        touch: Uuid,
        email: &str,
    ) -> Result<&'static str> {
        self.mail_ready()?;
        let email = check_email(email)?;
        let mut tx = self.write().await?;
        let you = self.yourself(tx.as_mut(), session).await?;
        let change = Change::ChangeEmail {
            email: email.clone(),
        };
        let (mut tx, _) = self.touched(tx, &you, touch, &change).await?;
        let (handle, current): (String, Option<String>) =
            sqlx::query_as("SELECT handle, lower(email) FROM gov.accounts WHERE id = $1")
                .bind(you.account)
                .fetch_one(tx.as_mut())
                .await?;
        if current.as_deref() == Some(email.as_str()) {
            return Err(self
                .no_after_touch(
                    tx,
                    &you,
                    &change,
                    Error::Invalid("that is your email already".into()),
                )
                .await);
        }
        sqlx::query("DELETE FROM gov.email_changes WHERE made_at < now() - interval '1 day'")
            .execute(tx.as_mut())
            .await?;
        let recent: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM gov.email_changes WHERE account = $1 AND made_at > now() - interval '1 hour'",
        )
        .bind(you.account)
        .fetch_one(tx.as_mut())
        .await?;
        if recent >= EMAIL_CHANGES_PER_HOUR {
            return Err(self
                .no_after_touch(
                    tx,
                    &you,
                    &change,
                    Error::TooMany("too many new emails this hour: try again later".into()),
                )
                .await);
        }
        let taken: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM gov.accounts WHERE lower(email) = $1 AND id <> $2)",
        )
        .bind(&email)
        .bind(you.account)
        .fetch_one(tx.as_mut())
        .await?;
        let (token, hash) = secret();
        // Kept either way, so the hourly limit counts it; spent at once when the address has an account.
        sqlx::query(
            "INSERT INTO gov.email_changes(token_hash,account,email,expires_at,used_at)
             VALUES($1,$2,$3, now() + make_interval(mins => $4), CASE WHEN $5 THEN now() END)",
        )
        .bind(&hash)
        .bind(you.account)
        .bind(&email)
        .bind(EMAIL_LINK_MINUTES as i32)
        .bind(taken)
        .execute(tx.as_mut())
        .await?;
        let pages = &self.config.pages;
        let mail = if taken {
            record(
                tx.as_mut(),
                "email-change",
                Some(you.account),
                None,
                &[],
                false,
                "a new email that belongs to another account: that address told so",
                json!({}),
            )
            .await?;
            Mail {
                to: email,
                subject: "Your email and No Origins".into(),
                body: format!(
                    "Someone signed in to No Origins as @{handle} asked to make this their email. It already belongs to an account, so nothing changed.\n\nIf it wasn't you, ignore this email.{SIGNATURE}"
                ),
            }
        } else {
            record(
                tx.as_mut(),
                "email-change",
                Some(you.account),
                None,
                &[],
                true,
                "a link to confirm a new email, sent to it",
                json!({}),
            )
            .await?;
            let link = pages
                .join(&format!("{EMAIL_PAGE}#{token}"))
                .expect("an email link");
            Mail {
                to: email,
                subject: "Confirm your new email for No Origins".into(),
                body: format!(
                    "Open this link within {EMAIL_LINK_MINUTES} minutes to make this the email of your No Origins account, @{handle}.\n\n{link}\n\nIf you didn't ask for this, ignore this email: nothing changes.{SIGNATURE}"
                ),
            }
        };
        // Sent once kept, with Governance's write lock free (architecture review, 9 Nov).
        tx.commit().await?;
        self.config.mail.send(&mail).await?;
        Ok(EMAIL_SENT)
    }

    /// Opening the link sent to a new email: it becomes the account's email, and the old one is
    /// told. No sign-in is needed: the touch that asked for it proved the person, and opening the
    /// link proves the address.
    pub async fn email_change_finish(&self, token: &str) -> Result<()> {
        let mut tx = self.write().await?;
        let (account, email): (Uuid, String) = sqlx::query_as(
            "UPDATE gov.email_changes SET used_at = now()
             WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
             RETURNING account, email",
        )
        .bind(digest(token))
        .fetch_optional(tx.as_mut())
        .await?
        .ok_or_else(|| Error::Refused("this link has expired or was used".into()))?;
        let (handle, kind, state, old): (String, String, String, Option<String>) =
            sqlx::query_as("SELECT handle, kind, state, email FROM gov.accounts WHERE id = $1")
                .bind(account)
                .fetch_one(tx.as_mut())
                .await?;
        if kind != "person" || state != "active" {
            return Err(Error::Refused(format!("{handle} cannot change its email")));
        }
        let taken: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM gov.accounts WHERE lower(email) = $1 AND id <> $2)",
        )
        .bind(&email)
        .bind(account)
        .fetch_one(tx.as_mut())
        .await?;
        if taken {
            return Err(Error::Refused(
                "that email belongs to another account now".into(),
            ));
        }
        sqlx::query("UPDATE gov.accounts SET email = $2 WHERE id = $1")
            .bind(account)
            .bind(&email)
            .execute(tx.as_mut())
            .await?;
        record(
            tx.as_mut(),
            "email-set",
            Some(account),
            None,
            &[],
            true,
            "email changed, from a link sent to it",
            json!({}),
        )
        .await?;
        tx.commit().await?;
        if let Some(old) = old.filter(|o| o.to_lowercase() != email) {
            let page = self.config.pages.join(ACCOUNT_PAGE).expect("a page");
            self.tell(
                account,
                "email-change",
                Some(old),
                "Your email for No Origins changed",
                format!(
                    "The email of your No Origins account, @{handle}, changed on {}. Notices and lost-passkey links go to the new one now.\n\nIf it was you, there's nothing to do.\n\nIf it wasn't, sign in with your passkey and open Your account at {page}: change your email back, and end your other sign-ins.{SIGNATURE}",
                    now_words()
                ),
            )
            .await;
        }
        Ok(())
    }

    /// A notice to an account, after the change it is about is kept: a notice that can't be sent
    /// never undoes the change, and the record says whether it went (never to where).
    pub(crate) async fn tell(
        &self,
        account: Uuid,
        about: &str,
        to: Option<String>,
        subject: &str,
        body: String,
    ) {
        let (sent, reason) = match to {
            None => (false, "no email to send a notice to".to_string()),
            Some(to) => match self
                .config
                .mail
                .send(&Mail {
                    to,
                    subject: subject.into(),
                    body,
                })
                .await
            {
                Ok(()) => (true, "a notice sent to the account's email".to_string()),
                Err(e) => {
                    tracing::warn!("notice not sent: {e}");
                    (false, format!("the notice could not be sent: {e}"))
                }
            },
        };
        let written = match self.pool.acquire().await {
            Ok(mut conn) => record(
                &mut conn,
                "notice",
                Some(account),
                None,
                &[],
                sent,
                &reason,
                json!({"about": about}),
            )
            .await
            .is_ok(),
            Err(_) => false,
        };
        if !written {
            tracing::warn!("notice about {about}: {reason} (not recorded)");
        }
    }

    /// Tells an account's email that a passkey was added to it (agreed 9 Nov, Q): which, how,
    /// where and when, and what to do if it wasn't them.
    pub(crate) async fn tell_passkey_added(
        &self,
        account: Uuid,
        name: &str,
        how: &str,
        device: Option<&str>,
    ) {
        let row: Option<(String, Option<String>)> =
            match sqlx::query_as("SELECT handle, email FROM gov.accounts WHERE id = $1")
                .bind(account)
                .fetch_optional(&self.pool)
                .await
            {
                Ok(row) => row,
                Err(e) => {
                    tracing::warn!("notice of a new passkey: {e}");
                    return;
                }
            };
        let Some((handle, email)) = row else { return };
        let on = device.map(|d| format!(", in {d}")).unwrap_or_default();
        let page = self.config.pages.join(ACCOUNT_PAGE).expect("a page");
        self.tell(
            account,
            "passkey-add",
            email,
            "A passkey was added to your No Origins account",
            format!(
                "A passkey named \"{name}\" was added to your No Origins account, @{handle}, {how}{on}, on {}.\n\nIf it was you, there's nothing to do.\n\nIf it wasn't, sign in with one of your passkeys and open Your account at {page}: remove that passkey, and end your other sign-ins.{SIGNATURE}",
                now_words()
            ),
        )
        .await;
    }
}

/// Now, as a notice says it: "9 Nov 2026 at 14:05 UTC".
fn now_words() -> String {
    chrono::Utc::now()
        .format("%-d %b %Y at %H:%M UTC")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_touch_for_your_account_names_the_change_and_what_it_is_about() {
        let you = Uuid::from_u128(1);
        let key = Uuid::from_u128(2);
        assert_eq!(
            Change::RemovePasskey { passkey: key }.intent(you),
            json!({"action": "remove-my-passkey", "resources": [format!("account:{you}"), format!("passkey:{key}")]})
        );
        assert_ne!(
            Change::RemovePasskey { passkey: key }.intent(you),
            Change::RemovePasskey {
                passkey: Uuid::from_u128(3)
            }
            .intent(you),
            "a touch to remove one passkey can't remove another"
        );
        assert_eq!(
            Change::EndOtherSignIns.intent(you)["action"],
            "end-my-other-sign-ins"
        );
        let change: Change =
            serde_json::from_value(json!({"change": "end-sign-in", "session": key})).unwrap();
        assert_eq!(change, Change::EndSignIn { session: key });
        assert_eq!(
            serde_json::from_value::<Change>(json!({"change": "add-passkey"})).unwrap(),
            Change::AddPasskey
        );
        // None of these is an owner's action, so a touch for one never stands for another's.
        for c in [
            Change::AddPasskey,
            Change::RemovePasskey { passkey: key },
            Change::EndSignIn { session: key },
            Change::EndOtherSignIns,
            Change::ChangeEmail {
                email: "a@b.example".into(),
            },
        ] {
            let action = c.intent(you)["action"].as_str().unwrap().to_string();
            assert!(!crate::GOVERNANCE_ACTIONS.contains(&action.as_str()));
        }
    }
}
