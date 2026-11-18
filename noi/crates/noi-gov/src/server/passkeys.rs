//! Passkeys: the first one from a one-time link, signing in (with no typing, or with a handle), and
//! a fresh touch over exactly what someone is about to approve. Ceremony state stays in Governance.
use super::{
    decide::{intent, Asker},
    digest, record, secret, Credential, Error, Governance, Result, Target, CEREMONY_MINUTES,
    SESSION_HOURS, TOUCH_SECONDS,
};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::PgConnection;
use uuid::Uuid;
use webauthn_rs::prelude::{
    AuthenticationResult, CreationChallengeResponse, DiscoverableAuthentication, DiscoverableKey,
    Passkey, PasskeyAuthentication, PasskeyRegistration, PublicKeyCredential,
    RegisterPublicKeyCredential, RequestChallengeResponse,
};

/// A ceremony to finish in the browser: its id and the options for navigator.credentials.
#[derive(Debug, Serialize)]
pub struct Started<T> {
    pub ceremony: Uuid,
    pub options: T,
}

/// A new session for a person, made with this passkey. Only its hash is kept; the token goes to the
/// browser as an HttpOnly cookie and nowhere else.
pub(crate) async fn new_session(
    conn: &mut PgConnection,
    account: Uuid,
    device: Option<&str>,
    passkey: Uuid,
) -> Result<String> {
    let (token, hash) = secret();
    sqlx::query("INSERT INTO gov.sessions(token_hash, account, expires_at, device, passkey) VALUES($1,$2, now() + make_interval(hours => $3), $4, $5)")
        .bind(hash)
        .bind(account)
        .bind(SESSION_HOURS as i32)
        .bind(device)
        .bind(passkey)
        .execute(conn)
        .await?;
    Ok(token)
}

pub(crate) async fn passkeys_of(
    conn: &mut PgConnection,
    account: Uuid,
) -> Result<Vec<(Uuid, Passkey)>> {
    let rows: Vec<(Uuid, Value)> = sqlx::query_as(
        "SELECT id, passkey FROM gov.passkeys WHERE account = $1 AND removed_at IS NULL",
    )
    .bind(account)
    .fetch_all(conn)
    .await?;
    rows.into_iter()
        .map(|(id, v)| {
            Ok((
                id,
                serde_json::from_value(v).map_err(|e| Error::Passkey(e.to_string()))?,
            ))
        })
        .collect()
}

/// A ceremony that is still open, of this kind. It is closed as it is taken.
pub(crate) async fn take_ceremony(
    conn: &mut PgConnection,
    id: Uuid,
    kind: &str,
) -> Result<(
    Option<Uuid>,
    Value,
    Option<Vec<u8>>,
    Option<Vec<u8>>,
    Option<Value>,
)> {
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

/// What a new passkey is called: the name given, else "Passkey", at most 80 characters.
pub(crate) fn passkey_name(name: &str) -> String {
    let name: String = name.chars().filter(|c| !c.is_control()).collect();
    let name = name.trim();
    let name = if name.is_empty() { "Passkey" } else { name };
    name.chars().take(80).collect()
}

/// Keeps a new passkey's public half. Returns its ID.
pub(crate) async fn keep_passkey(
    conn: &mut PgConnection,
    account: Uuid,
    name: &str,
    passkey: &Passkey,
) -> Result<Uuid> {
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO gov.passkeys(id,account,name,credential_id,passkey) VALUES($1,$2,$3,$4,$5)",
    )
    .bind(id)
    .bind(account)
    .bind(name)
    .bind(AsRef::<[u8]>::as_ref(passkey.cred_id()))
    .bind(serde_json::to_value(passkey).map_err(|e| Error::Passkey(e.to_string()))?)
    .execute(conn)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(d) if d.is_unique_violation() => {
            Error::Invalid("Governance keeps that passkey already".into())
        }
        _ => e.into(),
    })?;
    Ok(id)
}

/// The person a prompt was made for. Only a sign-in with no typing is made for nobody (9 Nov).
fn named(account: Option<Uuid>) -> Result<Uuid> {
    account.ok_or_else(|| Error::Refused("this prompt names nobody".into()))
}

/// Opens a sign-in prompt for 5 minutes: for one person, or for nobody yet (signing in with no
/// typing).
async fn open_sign_in(
    conn: &mut PgConnection,
    account: Option<Uuid>,
    state: Value,
) -> Result<Uuid> {
    let ceremony = Uuid::new_v4();
    sqlx::query("INSERT INTO gov.ceremonies(id,kind,account,state,expires_at) VALUES($1,'sign-in',$2,$3, now() + make_interval(mins => $4))")
        .bind(ceremony)
        .bind(account)
        .bind(state)
        .bind(CEREMONY_MINUTES as i32)
        .execute(conn)
        .await?;
    Ok(ceremony)
}

/// Keeps a passkey's counter moving forward once its answer checked out.
async fn count_use(
    conn: &mut PgConnection,
    id: Uuid,
    mut passkey: Passkey,
    result: &AuthenticationResult,
) -> Result<()> {
    passkey.update_credential(result);
    sqlx::query("UPDATE gov.passkeys SET passkey = $2, last_used_at = now() WHERE id = $1")
        .bind(id)
        .bind(serde_json::to_value(&passkey).map_err(|e| Error::Passkey(e.to_string()))?)
        .execute(conn)
        .await?;
    Ok(())
}

/// Closes a prompt whose answer failed. Undoing the failed transaction also undid its closing, so
/// without this the same prompt could be answered again and again until it expired (found 9 Nov).
pub(crate) async fn close_ceremony(conn: &mut PgConnection, id: Uuid) -> Result<()> {
    sqlx::query(
        "UPDATE gov.ceremonies SET finished_at = now() WHERE id = $1 AND finished_at IS NULL",
    )
    .bind(id)
    .execute(conn)
    .await?;
    Ok(())
}

impl Governance {
    /// Opens a one-time link: the account it is for, and passkey creation options.
    pub async fn link_start(&self, token: &str) -> Result<Started<CreationChallengeResponse>> {
        let mut tx = self.write().await?;
        // A sign-up's link (9 Nov, step 7, finding B): nothing is made until its passkey is. The
        // prompt holds the account ID the passkey will carry; finishing makes the account.
        let hash = digest(token);
        if let Some((handle, name)) = self.sign_up_waiting(tx.as_mut(), &hash).await? {
            let taken: bool =
                sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM gov.handles WHERE handle = $1)")
                    .bind(&handle)
                    .fetch_one(tx.as_mut())
                    .await?;
            if taken {
                return Err(Error::Refused(
                    "that handle was taken meanwhile: sign up again".into(),
                ));
            }
            let account = Uuid::new_v4();
            let (options, state) = self
                .webauthn
                .start_passkey_registration(account, &handle, &name, None)?;
            let ceremony = Uuid::new_v4();
            let state = json!({
                "registration": serde_json::to_value(&state).map_err(|e| Error::Passkey(e.to_string()))?,
                "sign_up": hash,
                "account": account,
            });
            sqlx::query("INSERT INTO gov.ceremonies(id,kind,account,state,expires_at) VALUES($1,'sign-up',NULL,$2, now() + make_interval(mins => $3))")
                .bind(ceremony)
                .bind(state)
                .bind(CEREMONY_MINUTES as i32)
                .execute(tx.as_mut())
                .await?;
            tx.commit().await?;
            return Ok(Started { ceremony, options });
        }
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
        let existing: Vec<_> = passkeys_of(tx.as_mut(), account)
            .await?
            .into_iter()
            .map(|(_, p)| p.cred_id().clone())
            .collect();
        let (options, state) =
            self.webauthn
                .start_passkey_registration(account, &handle, &name, Some(existing))?;
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
    pub async fn link_finish(
        &self,
        ceremony: Uuid,
        credential: &RegisterPublicKeyCredential,
        name: &str,
    ) -> Result<String> {
        self.link_finish_on(ceremony, credential, name, None).await
    }
    /// As `link_finish`, naming the device the new session is on, such as "Safari on a Mac".
    pub async fn link_finish_on(
        &self,
        ceremony: Uuid,
        credential: &RegisterPublicKeyCredential,
        name: &str,
        device: Option<&str>,
    ) -> Result<String> {
        let kind: Option<String> =
            sqlx::query_scalar("SELECT kind FROM gov.ceremonies WHERE id = $1")
                .bind(ceremony)
                .fetch_optional(&self.pool)
                .await?;
        if kind.as_deref() == Some("sign-up") {
            return self
                .sign_up_passkey(ceremony, credential, name, device)
                .await;
        }
        let mut tx = self.write().await?;
        let (account, state, link, _, _) = take_ceremony(tx.as_mut(), ceremony, "register").await?;
        let account = named(account)?;
        let link =
            link.ok_or_else(|| Error::Refused("this prompt was not opened from a link".into()))?;
        let purpose: String = sqlx::query_scalar("UPDATE gov.links SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING purpose")
            .bind(&link)
            .fetch_optional(tx.as_mut())
            .await?
            .ok_or_else(|| Error::Refused("this link has expired or was used".into()))?;
        // An account that had a passkey gets a notice of this one (agreed 9 Nov, Q); a first one
        // needs none, as it makes the account.
        let had = !passkeys_of(tx.as_mut(), account).await?.is_empty();
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
                    Some(account),
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
        let id = keep_passkey(tx.as_mut(), account, &name, &passkey).await?;
        sqlx::query("UPDATE gov.accounts SET state = 'active' WHERE id = $1 AND state = 'invited'")
            .bind(account)
            .execute(tx.as_mut())
            .await?;
        let session = new_session(tx.as_mut(), account, device, id).await?;
        record(
            tx.as_mut(),
            "passkey-add",
            Some(account),
            None,
            &[],
            true,
            "passkey added from a link",
            json!({"passkey": id, "name": &name}),
        )
        .await?;
        record(
            tx.as_mut(),
            "sign-in",
            Some(account),
            None,
            &[],
            true,
            "signed in",
            json!({"passkey": id}),
        )
        .await?;
        tx.commit().await?;
        if had {
            let how = match purpose.as_str() {
                "lost-passkey" => "from a link sent to your email, for a lost passkey",
                "another-passkey" => "from a link made on this Mac's command line",
                _ => "from a one-time link",
            };
            self.tell_passkey_added(account, &name, how, device).await;
        }
        Ok(session)
    }

    /// A sign-up's first passkey (9 Nov, step 7, finding B): the account is made now, with the ID
    /// the passkey carries, and the person is signed in.
    async fn sign_up_passkey(
        &self,
        ceremony: Uuid,
        credential: &RegisterPublicKeyCredential,
        name: &str,
        device: Option<&str>,
    ) -> Result<String> {
        let mut tx = self.write().await?;
        let (_, state, _, _, _) = take_ceremony(tx.as_mut(), ceremony, "sign-up").await?;
        let unread = |e: serde_json::Error| Error::Passkey(e.to_string());
        let account: Uuid = serde_json::from_value(state["account"].clone()).map_err(unread)?;
        let hash: Vec<u8> = serde_json::from_value(state["sign_up"].clone()).map_err(unread)?;
        let registration: PasskeyRegistration =
            serde_json::from_value(state["registration"].clone()).map_err(unread)?;
        let passkey = match self
            .webauthn
            .finish_passkey_registration(credential, &registration)
        {
            Ok(p) => p,
            Err(e) => {
                tx.rollback().await?;
                let mut conn = self.pool.acquire().await?;
                close_ceremony(&mut conn, ceremony).await?;
                record(
                    &mut conn,
                    "passkey-add",
                    None,
                    None,
                    &[],
                    false,
                    &format!("a sign-up's passkey did not check out: {e}"),
                    json!({}),
                )
                .await?;
                return Err(e.into());
            }
        };
        self.make_signed_up(tx.as_mut(), &hash, account).await?;
        let name = passkey_name(name);
        let id = keep_passkey(tx.as_mut(), account, &name, &passkey).await?;
        let session = new_session(tx.as_mut(), account, device, id).await?;
        record(
            tx.as_mut(),
            "passkey-add",
            Some(account),
            None,
            &[],
            true,
            "first passkey, from a sign-up",
            json!({"passkey": id, "name": &name}),
        )
        .await?;
        record(
            tx.as_mut(),
            "sign-in",
            Some(account),
            None,
            &[],
            true,
            "signed in",
            json!({"passkey": id}),
        )
        .await?;
        tx.commit().await?;
        Ok(session)
    }

    /// Signing in with a handle (agreed 9 Nov: the way in when the browser can't offer your passkey
    /// by itself). The options name that person's passkeys. No email: a sign-in never says whether
    /// an email has an account (finding 3), and failed sign-ins slow down whoever is trying, at
    /// the door, not the person (finding 1).
    pub async fn sign_in_start(&self, handle: &str) -> Result<Started<RequestChallengeResponse>> {
        let mut tx = self.write().await?;
        let row: Option<(Uuid, String, String)> =
            sqlx::query_as("SELECT id, kind, state FROM gov.accounts WHERE handle = $1")
                .bind(handle.trim())
                .fetch_optional(tx.as_mut())
                .await?;
        let refused = || Error::Refused("no active person with a passkey has that handle".into());
        let Some((account, kind, state)) = row else {
            return Err(refused());
        };
        let passkeys: Vec<Passkey> = passkeys_of(tx.as_mut(), account)
            .await?
            .into_iter()
            .map(|(_, p)| p)
            .collect();
        if kind != "person" || state != "active" || passkeys.is_empty() {
            return Err(refused());
        }
        let (options, state) = self.webauthn.start_passkey_authentication(&passkeys)?;
        let state = serde_json::to_value(&state).map_err(|e| Error::Passkey(e.to_string()))?;
        let ceremony = open_sign_in(tx.as_mut(), Some(account), state).await?;
        tx.commit().await?;
        Ok(Started { ceremony, options })
    }

    /// Signing in with no typing (agreed 9 Nov): the browser offers this site's passkeys, and the
    /// one you pick says whose it is. The prompt names nobody, so it says nothing about anyone.
    pub async fn sign_in_any_start(&self) -> Result<Started<RequestChallengeResponse>> {
        let mut tx = self.write().await?;
        let (options, state) = self.webauthn.start_discoverable_authentication()?;
        let state = serde_json::to_value(&state).map_err(|e| Error::Passkey(e.to_string()))?;
        let ceremony = open_sign_in(tx.as_mut(), None, state).await?;
        tx.commit().await?;
        Ok(Started { ceremony, options })
    }

    /// Checks the signature of one of this person's passkeys. Returns the passkey used.
    async fn verify(
        &self,
        conn: &mut PgConnection,
        account: Uuid,
        state: Value,
        credential: &PublicKeyCredential,
    ) -> Result<Uuid> {
        let state: PasskeyAuthentication =
            serde_json::from_value(state).map_err(|e| Error::Passkey(e.to_string()))?;
        let result = self
            .webauthn
            .finish_passkey_authentication(credential, &state)?;
        for (id, passkey) in passkeys_of(conn, account).await? {
            if passkey.cred_id() == result.cred_id() {
                count_use(conn, id, passkey, &result).await?;
                return Ok(id);
            }
        }
        Err(Error::Refused(
            "that passkey is not one of this person's".into(),
        ))
    }

    /// Checks a passkey the browser offered by itself (9 Nov): its answer says whose it is, and it
    /// must be one of that active person's passkeys. Returns the person and the passkey, or, on a
    /// refusal, the person when there is one.
    async fn verify_any(
        &self,
        conn: &mut PgConnection,
        state: Value,
        credential: &PublicKeyCredential,
    ) -> std::result::Result<(Uuid, Uuid), (Option<Uuid>, Error)> {
        let state: DiscoverableAuthentication =
            serde_json::from_value(state).map_err(|e| (None, Error::Passkey(e.to_string())))?;
        let (claimed, credential_id) = self
            .webauthn
            .identify_discoverable_authentication(credential)
            .map_err(|e| (None, e.into()))?;
        let person: Option<Uuid> = sqlx::query_scalar(
            "SELECT id FROM gov.accounts WHERE id = $1 AND kind = 'person' AND state = 'active'",
        )
        .bind(claimed)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| (None, e.into()))?;
        let Some(account) = person else {
            return Err((
                None,
                Error::Refused("no active person has that passkey".into()),
            ));
        };
        let refused = |e: Error| (Some(account), e);
        let found = passkeys_of(conn, account)
            .await
            .map_err(refused)?
            .into_iter()
            .find(|(_, p)| AsRef::<[u8]>::as_ref(p.cred_id()) == credential_id);
        let Some((id, passkey)) = found else {
            return Err(refused(Error::Refused(
                "that passkey is not one of this person's".into(),
            )));
        };
        // The newer finish takes the library's inner credential type, which it shows only behind a
        // feature named "danger-credential-internals"; this one takes the passkey as it is.
        #[allow(deprecated)]
        let result = self
            .webauthn
            .finish_discoverable_authentication(
                credential,
                state,
                &[DiscoverableKey::from(&passkey)],
            )
            .map_err(|e| refused(e.into()))?;
        count_use(conn, id, passkey, &result)
            .await
            .map_err(refused)?;
        Ok((account, id))
    }

    /// Finishes signing in, either way: a new session. Every try is recorded, failed ones too.
    pub async fn sign_in_finish(
        &self,
        ceremony: Uuid,
        credential: &PublicKeyCredential,
    ) -> Result<String> {
        self.sign_in_finish_on(ceremony, credential, None).await
    }
    /// As `sign_in_finish`, naming the device the new session is on.
    pub async fn sign_in_finish_on(
        &self,
        ceremony: Uuid,
        credential: &PublicKeyCredential,
        device: Option<&str>,
    ) -> Result<String> {
        let mut tx = self.write().await?;
        let (named, state, _, _, _) = take_ceremony(tx.as_mut(), ceremony, "sign-in").await?;
        let checked = match named {
            Some(account) => self
                .verify(tx.as_mut(), account, state, credential)
                .await
                .map(|passkey| (account, passkey))
                .map_err(|e| (Some(account), e)),
            None => self.verify_any(tx.as_mut(), state, credential).await,
        };
        match checked {
            Ok((account, passkey)) => {
                let session = new_session(tx.as_mut(), account, device, passkey).await?;
                record(
                    tx.as_mut(),
                    "sign-in",
                    Some(account),
                    None,
                    &[],
                    true,
                    "signed in",
                    json!({"passkey": passkey}),
                )
                .await?;
                tx.commit().await?;
                Ok(session)
            }
            Err((account, e)) => {
                tx.rollback().await?;
                let mut conn = self.pool.acquire().await?;
                close_ceremony(&mut conn, ceremony).await?;
                record(
                    &mut conn,
                    "sign-in",
                    account,
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

    /// Ends a session now.
    pub async fn sign_out(&self, session: &str) -> Result<()> {
        let mut tx = self.write().await?;
        let account: Option<Uuid> = sqlx::query_scalar("UPDATE gov.sessions SET ended_at = now(), ended_by = account WHERE token_hash = $1 AND ended_at IS NULL RETURNING account")
            .bind(digest(session))
            .fetch_optional(tx.as_mut())
            .await?;
        if let Some(account) = account {
            record(
                tx.as_mut(),
                "sign-out",
                Some(account),
                None,
                &[],
                true,
                "signed out",
                json!({}),
            )
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// A touch prompt for exactly one action on exactly these resources, for a signed-in person.
    pub async fn touch_start(
        &self,
        session: &str,
        action: &str,
        targets: &[Target],
    ) -> Result<Started<RequestChallengeResponse>> {
        self.touch_start_about(session, action, targets, None).await
    }
    /// As `touch_start`, naming what else the touch is for (9 Nov, step 7): the decision and each
    /// proposal at its revision, the role and place, the invitee and their roles.
    pub async fn touch_start_about(
        &self,
        session: &str,
        action: &str,
        targets: &[Target],
        about: Option<&Value>,
    ) -> Result<Started<RequestChallengeResponse>> {
        let mut tx = self.write().await?;
        let asker = self
            .asker(tx.as_mut(), &Credential::Session(session.into()))
            .await?;
        let started = self
            .open_touch(tx.as_mut(), &asker, intent(action, targets, about))
            .await?;
        tx.commit().await?;
        Ok(started)
    }

    /// Opens a touch prompt for a signed-in person, over exactly this intent: one action on these
    /// resources.
    pub(crate) async fn open_touch(
        &self,
        conn: &mut PgConnection,
        asker: &Asker,
        intent: Value,
    ) -> Result<Started<RequestChallengeResponse>> {
        if asker.kind != "person" {
            return Err(Error::Refused("only a person can touch".into()));
        }
        self.not_locked(&mut *conn, asker.account).await?;
        let passkeys: Vec<Passkey> = passkeys_of(&mut *conn, asker.account)
            .await?
            .into_iter()
            .map(|(_, p)| p)
            .collect();
        let (options, state) = self.webauthn.start_passkey_authentication(&passkeys)?;
        let ceremony = Uuid::new_v4();
        sqlx::query("INSERT INTO gov.ceremonies(id,kind,account,state,session,intent,expires_at) VALUES($1,'touch',$2,$3,$4,$5, now() + make_interval(mins => $6))")
            .bind(ceremony)
            .bind(asker.account)
            .bind(serde_json::to_value(&state).map_err(|e| Error::Passkey(e.to_string()))?)
            .bind(&asker.session)
            .bind(intent)
            .bind(CEREMONY_MINUTES as i32)
            .execute(conn)
            .await?;
        Ok(Started { ceremony, options })
    }

    /// Finishes a touch: usable once, within a minute, by this session, for what it was started for.
    pub async fn touch_finish(
        &self,
        session: &str,
        ceremony: Uuid,
        credential: &PublicKeyCredential,
    ) -> Result<Uuid> {
        let mut tx = self.write().await?;
        let asker = self
            .asker(tx.as_mut(), &Credential::Session(session.into()))
            .await?;
        let (account, state, _, opened_by, intent) =
            take_ceremony(tx.as_mut(), ceremony, "touch").await?;
        if account != Some(asker.account) || opened_by != asker.session {
            return Err(Error::Refused(
                "this touch was started by another session".into(),
            ));
        }
        let account = asker.account;
        // A failed touch is recorded, like a failed sign-in: five in 15 minutes and that person waits.
        let passkey = match self.verify(tx.as_mut(), account, state, credential).await {
            Ok(passkey) => passkey,
            Err(e) => {
                tx.rollback().await?;
                let mut conn = self.pool.acquire().await?;
                close_ceremony(&mut conn, ceremony).await?;
                record(
                    &mut conn,
                    "touch",
                    Some(account),
                    None,
                    &[],
                    false,
                    &e.to_string(),
                    json!({}),
                )
                .await?;
                return Err(e);
            }
        };
        let id = Uuid::new_v4();
        sqlx::query("INSERT INTO gov.touches(id,session,account,intent,expires_at,passkey) VALUES($1,$2,$3,$4, now() + make_interval(secs => $5), $6)")
            .bind(id)
            .bind(asker.session)
            .bind(account)
            .bind(&intent)
            .bind(TOUCH_SECONDS as f64)
            .bind(passkey)
            .execute(tx.as_mut())
            .await?;
        record(
            tx.as_mut(),
            "touch",
            Some(account),
            None,
            &[],
            true,
            "touched",
            json!({"passkey": passkey, "intent": intent}),
        )
        .await?;
        tx.commit().await?;
        Ok(id)
    }
}
