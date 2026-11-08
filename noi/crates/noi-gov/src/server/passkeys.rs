//! Passkeys: the first one from a one-time link, signing in with a handle and a touch, and a fresh
//! touch over exactly what someone is about to approve. Ceremony state stays in Governance.
use super::{
    decide::intent,
    Target,
    digest, record, secret, Credential, Error, Governance, Result, CEREMONY_MINUTES,
    SESSION_HOURS, TOUCH_SECONDS,
};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::PgConnection;
use uuid::Uuid;
use webauthn_rs::prelude::{
    CreationChallengeResponse, Passkey, PasskeyAuthentication, PasskeyRegistration,
    PublicKeyCredential, RegisterPublicKeyCredential, RequestChallengeResponse,
};

/// A ceremony to finish in the browser: its id and the options for navigator.credentials.
#[derive(Debug, Serialize)]
pub struct Started<T> {
    pub ceremony: Uuid,
    pub options: T,
}

/// A new session for a person. Only its hash is kept; the token goes to the browser as an HttpOnly
/// cookie and nowhere else.
async fn new_session(conn: &mut PgConnection, account: Uuid, device: Option<&str>) -> Result<String> {
    let (token, hash) = secret();
    sqlx::query("INSERT INTO gov.sessions(token_hash, account, expires_at, device) VALUES($1,$2, now() + make_interval(hours => $3), $4)")
        .bind(hash)
        .bind(account)
        .bind(SESSION_HOURS as i32)
        .bind(device)
        .execute(conn)
        .await?;
    Ok(token)
}

async fn passkeys_of(conn: &mut PgConnection, account: Uuid) -> Result<Vec<(Uuid, Passkey)>> {
    let rows: Vec<(Uuid, Value)> = sqlx::query_as("SELECT id, passkey FROM gov.passkeys WHERE account = $1 AND removed_at IS NULL")
        .bind(account)
        .fetch_all(conn)
        .await?;
    rows.into_iter()
        .map(|(id, v)| Ok((id, serde_json::from_value(v).map_err(|e| Error::Passkey(e.to_string()))?)))
        .collect()
}

/// A ceremony that is still open, of this kind. It is closed as it is taken.
async fn take_ceremony(conn: &mut PgConnection, id: Uuid, kind: &str) -> Result<(Uuid, Value, Option<Vec<u8>>, Option<Vec<u8>>, Option<Value>)> {
    sqlx::query_as(
        "UPDATE gov.ceremonies SET finished_at = now() WHERE id = $1 AND kind = $2 AND finished_at IS NULL AND expires_at > now()
         RETURNING account, state, link, session, intent",
    )
    .bind(id)
    .bind(kind)
    .fetch_optional(conn)
    .await?
    .ok_or_else(|| Error::Refused("this passkey prompt has expired or was used: start again".into()))
}

impl Governance {
    /// Opens a one-time link: the account it is for, and passkey creation options.
    pub async fn link_start(&self, token: &str) -> Result<Started<CreationChallengeResponse>> {
        let mut tx = self.write().await?;
        let row: Option<(Uuid, String, String, String)> = sqlx::query_as(
            "SELECT a.id, a.handle, a.display_name, a.state FROM gov.links l JOIN gov.accounts a ON a.id = l.account
             WHERE l.token_hash = $1 AND l.used_at IS NULL AND l.expires_at > now()",
        )
        .bind(digest(token))
        .fetch_optional(tx.as_mut())
        .await?;
        let (account, handle, name, state) =
            row.ok_or_else(|| Error::Refused("this link has expired or was used".into()))?;
        if !(state == "invited" || state == "active") {
            return Err(Error::Refused(format!("{handle} cannot add a passkey")));
        }
        let existing: Vec<_> = passkeys_of(tx.as_mut(), account).await?.into_iter().map(|(_, p)| p.cred_id().clone()).collect();
        let (options, state) = self.webauthn.start_passkey_registration(account, &handle, &name, Some(existing))?;
        let ceremony = Uuid::new_v4();
        sqlx::query("INSERT INTO gov.ceremonies(id,kind,account,state,link,expires_at) VALUES($1,'register',$2,$3,$4, now() + make_interval(mins => $5))")
            .bind(ceremony)
            .bind(account)
            .bind(serde_json::to_value(&state).map_err(|e| Error::Passkey(e.to_string()))?)
            .bind(digest(token))
            .bind(CEREMONY_MINUTES as i32)
            .execute(tx.as_mut())
            .await?;
        tx.commit().await?;
        Ok(Started { ceremony, options })
    }

    /// Finishes a link: the passkey is kept (its public half), the link is used up, the account is
    /// active, and the person is signed in.
    pub async fn link_finish(&self, ceremony: Uuid, credential: &RegisterPublicKeyCredential, name: &str) -> Result<String> {
        self.link_finish_on(ceremony, credential, name, None).await
    }
    /// As `link_finish`, naming the device the new session is on, such as "Safari on a Mac".
    pub async fn link_finish_on(&self, ceremony: Uuid, credential: &RegisterPublicKeyCredential, name: &str, device: Option<&str>) -> Result<String> {
        let mut tx = self.write().await?;
        let (account, state, link, _, _) = take_ceremony(tx.as_mut(), ceremony, "register").await?;
        let link = link.ok_or_else(|| Error::Refused("this prompt was not opened from a link".into()))?;
        let used = sqlx::query("UPDATE gov.links SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()")
            .bind(&link)
            .execute(tx.as_mut())
            .await?
            .rows_affected();
        if used != 1 {
            return Err(Error::Refused("this link has expired or was used".into()));
        }
        let state: PasskeyRegistration = serde_json::from_value(state).map_err(|e| Error::Passkey(e.to_string()))?;
        let passkey = match self.webauthn.finish_passkey_registration(credential, &state) {
            Ok(p) => p,
            Err(e) => {
                tx.rollback().await?;
                let mut conn = self.pool.acquire().await?;
                record(&mut conn, "passkey-add", Some(account), None, &[], false, &format!("the passkey did not check out: {e}"), json!({})).await?;
                return Err(e.into());
            }
        };
        let name = if name.trim().is_empty() { "Passkey" } else { name.trim() };
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO gov.passkeys(id,account,name,credential_id,passkey) VALUES($1,$2,$3,$4,$5)")
            .bind(id)
            .bind(account)
            .bind(name.chars().take(80).collect::<String>())
            .bind(AsRef::<[u8]>::as_ref(passkey.cred_id()))
            .bind(serde_json::to_value(&passkey).map_err(|e| Error::Passkey(e.to_string()))?)
            .execute(tx.as_mut())
            .await?;
        sqlx::query("UPDATE gov.accounts SET state = 'active' WHERE id = $1 AND state = 'invited'")
            .bind(account)
            .execute(tx.as_mut())
            .await?;
        let session = new_session(tx.as_mut(), account, device).await?;
        record(tx.as_mut(), "passkey-add", Some(account), None, &[], true, "passkey added from a link", json!({"passkey": id, "name": name})).await?;
        record(tx.as_mut(), "sign-in", Some(account), None, &[], true, "signed in", json!({"passkey": id})).await?;
        tx.commit().await?;
        Ok(session)
    }

    /// Signing in starts with a handle: the options name that person's passkeys.
    pub async fn sign_in_start(&self, handle: &str) -> Result<Started<RequestChallengeResponse>> {
        let mut tx = self.write().await?;
        let row: Option<(Uuid, String, String)> = sqlx::query_as("SELECT id, kind, state FROM gov.accounts WHERE handle = $1")
            .bind(handle)
            .fetch_optional(tx.as_mut())
            .await?;
        let refused = || Error::Refused("no active person with a passkey has that handle".into());
        let Some((account, kind, state)) = row else { return Err(refused()) };
        self.not_locked(tx.as_mut(), account).await?;
        let passkeys: Vec<Passkey> = passkeys_of(tx.as_mut(), account).await?.into_iter().map(|(_, p)| p).collect();
        if kind != "person" || state != "active" || passkeys.is_empty() {
            return Err(refused());
        }
        let (options, state) = self.webauthn.start_passkey_authentication(&passkeys)?;
        let ceremony = Uuid::new_v4();
        sqlx::query("INSERT INTO gov.ceremonies(id,kind,account,state,expires_at) VALUES($1,'sign-in',$2,$3, now() + make_interval(mins => $4))")
            .bind(ceremony)
            .bind(account)
            .bind(serde_json::to_value(&state).map_err(|e| Error::Passkey(e.to_string()))?)
            .bind(CEREMONY_MINUTES as i32)
            .execute(tx.as_mut())
            .await?;
        tx.commit().await?;
        Ok(Started { ceremony, options })
    }

    /// Checks the signature and keeps the passkey's counter moving forward. Returns the passkey used.
    async fn verify(&self, conn: &mut PgConnection, account: Uuid, state: Value, credential: &PublicKeyCredential) -> Result<Uuid> {
        let state: PasskeyAuthentication = serde_json::from_value(state).map_err(|e| Error::Passkey(e.to_string()))?;
        let result = self.webauthn.finish_passkey_authentication(credential, &state)?;
        for (id, mut passkey) in passkeys_of(conn, account).await? {
            if passkey.cred_id() == result.cred_id() {
                passkey.update_credential(&result);
                sqlx::query("UPDATE gov.passkeys SET passkey = $2, last_used_at = now() WHERE id = $1")
                    .bind(id)
                    .bind(serde_json::to_value(&passkey).map_err(|e| Error::Passkey(e.to_string()))?)
                    .execute(&mut *conn)
                    .await?;
                return Ok(id);
            }
        }
        Err(Error::Refused("that passkey is not one of this person's".into()))
    }

    /// Finishes signing in: a new 12-hour session. Every try is recorded, failed ones too.
    pub async fn sign_in_finish(&self, ceremony: Uuid, credential: &PublicKeyCredential) -> Result<String> {
        self.sign_in_finish_on(ceremony, credential, None).await
    }
    /// As `sign_in_finish`, naming the device the new session is on.
    pub async fn sign_in_finish_on(&self, ceremony: Uuid, credential: &PublicKeyCredential, device: Option<&str>) -> Result<String> {
        let mut tx = self.write().await?;
        let (account, state, _, _, _) = take_ceremony(tx.as_mut(), ceremony, "sign-in").await?;
        match self.verify(tx.as_mut(), account, state, credential).await {
            Ok(passkey) => {
                let session = new_session(tx.as_mut(), account, device).await?;
                record(tx.as_mut(), "sign-in", Some(account), None, &[], true, "signed in", json!({"passkey": passkey})).await?;
                tx.commit().await?;
                Ok(session)
            }
            Err(e) => {
                tx.rollback().await?;
                let mut conn = self.pool.acquire().await?;
                record(&mut conn, "sign-in", Some(account), None, &[], false, &e.to_string(), json!({})).await?;
                Err(e)
            }
        }
    }

    /// Ends a session now.
    pub async fn sign_out(&self, session: &str) -> Result<()> {
        let mut tx = self.write().await?;
        let account: Option<Uuid> = sqlx::query_scalar("UPDATE gov.sessions SET ended_at = now(), ended_by = account WHERE token_hash = $1 AND ended_at IS NULL RETURNING account")
            .bind(digest(session))
            .fetch_optional(tx.as_mut())
            .await?;
        if let Some(account) = account {
            record(tx.as_mut(), "sign-out", Some(account), None, &[], true, "signed out", json!({})).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// A touch prompt for exactly one action on exactly these resources, for a signed-in person.
    pub async fn touch_start(&self, session: &str, action: &str, targets: &[Target]) -> Result<Started<RequestChallengeResponse>> {
        let mut tx = self.write().await?;
        let asker = self.asker(tx.as_mut(), &Credential::Session(session.into())).await?;
        if asker.kind != "person" {
            return Err(Error::Refused("only a person can touch".into()));
        }
        self.not_locked(tx.as_mut(), asker.account).await?;
        let passkeys: Vec<Passkey> = passkeys_of(tx.as_mut(), asker.account).await?.into_iter().map(|(_, p)| p).collect();
        let (options, state) = self.webauthn.start_passkey_authentication(&passkeys)?;
        let ceremony = Uuid::new_v4();
        sqlx::query("INSERT INTO gov.ceremonies(id,kind,account,state,session,intent,expires_at) VALUES($1,'touch',$2,$3,$4,$5, now() + make_interval(mins => $6))")
            .bind(ceremony)
            .bind(asker.account)
            .bind(serde_json::to_value(&state).map_err(|e| Error::Passkey(e.to_string()))?)
            .bind(asker.session)
            .bind(intent(action, targets))
            .bind(CEREMONY_MINUTES as i32)
            .execute(tx.as_mut())
            .await?;
        tx.commit().await?;
        Ok(Started { ceremony, options })
    }

    /// Finishes a touch: usable once, within a minute, by this session, for what it was started for.
    pub async fn touch_finish(&self, session: &str, ceremony: Uuid, credential: &PublicKeyCredential) -> Result<Uuid> {
        let mut tx = self.write().await?;
        let asker = self.asker(tx.as_mut(), &Credential::Session(session.into())).await?;
        let (account, state, _, opened_by, intent) = take_ceremony(tx.as_mut(), ceremony, "touch").await?;
        if account != asker.account || opened_by != asker.session {
            return Err(Error::Refused("this touch was started by another session".into()));
        }
        // A failed touch is recorded, like a failed sign-in: five in 15 minutes and that person waits.
        let passkey = match self.verify(tx.as_mut(), account, state, credential).await {
            Ok(passkey) => passkey,
            Err(e) => {
                tx.rollback().await?;
                let mut conn = self.pool.acquire().await?;
                record(&mut conn, "touch", Some(account), None, &[], false, &e.to_string(), json!({})).await?;
                return Err(e);
            }
        };
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO gov.touches(id,session,account,intent,expires_at) VALUES($1,$2,$3,$4, now() + make_interval(secs => $5))")
            .bind(id)
            .bind(asker.session)
            .bind(account)
            .bind(&intent)
            .bind(TOUCH_SECONDS as f64)
            .execute(tx.as_mut())
            .await?;
        record(tx.as_mut(), "touch", Some(account), None, &[], true, "touched", json!({"passkey": passkey, "intent": intent})).await?;
        tx.commit().await?;
        Ok(id)
    }
}
