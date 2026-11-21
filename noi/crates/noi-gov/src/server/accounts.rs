//! Accounts and grants. Setup makes the first owner, once, while no owner exists: the only grant not
//! made by an owner. Everything else an owner does is asked of Governance like any other action,
//! with a fresh touch.
use super::{
    check_email, check_handle, check_scope,
    decide::{together, Ask, Proof},
    record, secret, Credential, Error, Governance, Result, Target, FIRST_PASSKEY_MINUTES,
    INVITATION_HOURS, MAINTAINER, OWNER, VISITORS,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgConnection;
use uuid::Uuid;

/// What setup made: the first owner, and the link for their first passkey.
#[derive(Debug, Serialize)]
pub struct Setup {
    pub account: Uuid,
    pub link: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrantSpec {
    pub role: String,
    pub scope: String,
}

pub(crate) async fn account_by_handle(
    conn: &mut PgConnection,
    handle: &str,
) -> Result<(Uuid, String, String)> {
    sqlx::query_as("SELECT id, kind, state FROM gov.accounts WHERE handle = $1")
        .bind(handle)
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| Error::NotFound(format!("no account has the handle {handle}")))
}

/// A new account: its handle is reserved for good, even after the account closes. A person's
/// email is checked and kept in lowercase; one account per email.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn new_account(
    conn: &mut PgConnection,
    handle: &str,
    display_name: &str,
    kind: &str,
    state: &str,
    made_by: Option<Uuid>,
    email: Option<&str>,
    agent: Option<(Uuid, &str, &str)>,
) -> Result<Uuid> {
    new_account_as(
        conn,
        Uuid::new_v4(),
        handle,
        display_name,
        kind,
        state,
        made_by,
        email,
        agent,
    )
    .await
}

/// As `new_account`, with its ID chosen already: a sign-up's, which its passkey carries (9 Nov).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn new_account_as(
    conn: &mut PgConnection,
    id: Uuid,

    handle: &str,
    display_name: &str,
    kind: &str,
    state: &str,
    made_by: Option<Uuid>,
    email: Option<&str>,
    agent: Option<(Uuid, &str, &str)>,
) -> Result<Uuid> {
    check_handle(handle)?;
    let name = display_name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(Error::Invalid(
            "a display name has 1 to 80 characters".into(),
        ));
    }
    let taken: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM gov.handles WHERE handle = $1)")
            .bind(handle)
            .fetch_one(&mut *conn)
            .await?;
    if taken {
        return Err(Error::Invalid(format!(
            "{handle} is taken, now or before: handles are never reused"
        )));
    }
    let email = email.map(check_email).transpose()?;
    if kind == "person" && email.is_none() {
        return Err(Error::Invalid("a person's account needs an email".into()));
    }
    if let Some(email) = &email {
        let used: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM gov.accounts WHERE lower(email) = $1)")
                .bind(email)
                .fetch_one(&mut *conn)
                .await?;
        if used {
            return Err(Error::Invalid("that email has an account already".into()));
        }
    }
    let (sponsor, purpose, vouched_by) = match agent {
        Some((s, p, v)) => (Some(s), Some(p), Some(v)),
        None => (None, None, None),
    };
    sqlx::query(
        "INSERT INTO gov.accounts(id,handle,display_name,kind,state,made_by,email,sponsor,purpose,vouched_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind(id)
    .bind(handle)
    .bind(name)
    .bind(kind)
    .bind(state)
    .bind(made_by)
    .bind(email)
    .bind(sponsor)
    .bind(purpose)
    .bind(vouched_by)
    .execute(&mut *conn)
    .await?;
    sqlx::query("INSERT INTO gov.handles(handle, account) VALUES($1,$2)")
        .bind(handle)
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(id)
}

/// A grant of a role Governance holds as active; deprecated roles get no new grants.
pub(crate) async fn add_grant(
    conn: &mut PgConnection,
    account: Uuid,
    spec: &GrantSpec,
    by: Option<Uuid>,
) -> Result<Uuid> {
    check_scope(&spec.scope)?;
    let state: Option<String> =
        sqlx::query_scalar("SELECT state FROM gov.policies WHERE path = $1 AND kind = 'role'")
            .bind(&spec.role)
            .fetch_optional(&mut *conn)
            .await?;
    match state.as_deref() {
        Some("active") => {}
        Some(_) => {
            return Err(Error::Refused(format!(
                "{} is deprecated: it can no longer be granted",
                spec.role
            )))
        }
        None => {
            return Err(Error::Invalid(format!(
                "{} is not a role Governance holds",
                spec.role
            )))
        }
    }
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO gov.grants(id,account,role,scope,granted_by) VALUES($1,$2,$3,$4,$5)")
        .bind(id)
        .bind(account)
        .bind(&spec.role)
        .bind(&spec.scope)
        .bind(by)
        .execute(&mut *conn)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(d) if d.is_unique_violation() => Error::Invalid(format!(
                "{} already holds {} in {}",
                account, spec.role, spec.scope
            )),
            other => other.into(),
        })?;
    Ok(id)
}

/// The app's pages Governance's emails and links point at, under gov's own name (under /account
/// since 9 Nov).
pub(crate) const SIGN_IN_PAGE: &str = "account/sign-in";
const LINK_PAGE: &str = "account/link";

/// A one-time link's address: the app's Add your passkey page, with the token after `#`, which a
/// browser never sends, so no server's log sees it.
pub(crate) fn link_url(pages: &url::Url, token: &str) -> String {
    pages
        .join(&format!("{LINK_PAGE}#{token}"))
        .expect("a link path")
        .to_string()
}

/// A one-time link: what it is for, whose it is, how long it lasts.
pub(crate) async fn new_link(
    conn: &mut PgConnection,
    pages: &url::Url,
    purpose: &str,
    account: Uuid,
    by: Option<Uuid>,
    minutes: i64,
) -> Result<String> {
    let (token, hash) = secret();
    sqlx::query(
        "INSERT INTO gov.links(token_hash,purpose,account,made_by,expires_at) VALUES($1,$2,$3,$4, now() + make_interval(mins => $5))",
    )
    .bind(&hash)
    .bind(purpose)
    .bind(account)
    .bind(by)
    .bind(minutes as i32)
    .execute(&mut *conn)
    .await?;
    Ok(link_url(pages, &token))
}

impl Governance {
    /// The first owner: an account, Maintainer and Owner in all of NOI, and a link for the first
    /// passkey. Refused once anyone holds Owner. A Governance that holds no roles and rules yet is
    /// given the ones every Governance starts with first (step 3: they are no longer copied from
    /// Mero).
    pub async fn setup(&self, handle: &str, display_name: &str, email: &str) -> Result<Setup> {
        let mut tx = self.write().await?;
        let owners: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM gov.grants WHERE role = $1 AND ended_at IS NULL",
        )
        .bind(OWNER)
        .fetch_one(tx.as_mut())
        .await?;
        if owners > 0 {
            return Err(Error::Refused(
                "an owner exists: setup runs only once".into(),
            ));
        }
        let first = super::roles::write_first(tx.as_mut()).await?;
        let account = new_account(
            tx.as_mut(),
            handle,
            display_name,
            "person",
            "invited",
            None,
            Some(email),
            None,
        )
        .await?;
        for role in [MAINTAINER, OWNER] {
            add_grant(
                tx.as_mut(),
                account,
                &GrantSpec {
                    role: role.into(),
                    scope: "noi".into(),
                },
                None,
            )
            .await
            .map_err(|e| match e {
                Error::Invalid(_) => {
                    Error::Invalid(format!("{role} is not among the roles Governance holds"))
                }
                other => other,
            })?;
        }
        let link = new_link(
            tx.as_mut(),
            &self.config.pages,
            "first-passkey",
            account,
            None,
            FIRST_PASSKEY_MINUTES,
        )
        .await?;
        record(
            tx.as_mut(),
            "setup",
            Some(account),
            None,
            &["noi".into()],
            true,
            "the first owner",
            json!({"handle": handle, "grants": [MAINTAINER, OWNER], "first_roles_and_rules": first}),
        )
        .await?;
        tx.commit().await?;
        Ok(Setup { account, link })
    }

    /// A new link for an account's first passkey, only while it has none.
    pub async fn first_passkey_link(&self, handle: &str) -> Result<String> {
        let mut tx = self.write().await?;
        let (account, kind, state) = account_by_handle(tx.as_mut(), handle).await?;
        if kind != "person" || !(state == "invited" || state == "active") {
            return Err(Error::Refused(format!("{handle} cannot add a passkey")));
        }
        let has: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM gov.passkeys WHERE account = $1 AND removed_at IS NULL)",
        )
        .bind(account)
        .fetch_one(tx.as_mut())
        .await?;
        if has {
            return Err(Error::Refused(format!(
                "{handle} has a passkey: add more while signed in, with a touch"
            )));
        }
        let link = new_link(
            tx.as_mut(),
            &self.config.pages,
            "first-passkey",
            account,
            None,
            FIRST_PASSKEY_MINUTES,
        )
        .await?;
        record(
            tx.as_mut(),
            "first-passkey-link",
            Some(account),
            None,
            &[],
            true,
            "a link for the first passkey",
            json!({}),
        )
        .await?;
        tx.commit().await?;
        Ok(link)
    }

    /// A link for another passkey, for an account that has one already: such as a passkey for a
    /// new name, since a passkey belongs to one (agreed 8 Nov). Only this Mac's command line makes
    /// it, and the record keeps it.
    pub async fn another_passkey_link(&self, handle: &str) -> Result<String> {
        let mut tx = self.write().await?;
        let (account, kind, state) = account_by_handle(tx.as_mut(), handle).await?;
        if kind != "person" || state != "active" {
            return Err(Error::Refused(format!("{handle} cannot add a passkey")));
        }
        let has: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM gov.passkeys WHERE account = $1 AND removed_at IS NULL)",
        )
        .bind(account)
        .fetch_one(tx.as_mut())
        .await?;
        if !has {
            return Err(Error::Refused(format!(
                "{handle} has no passkey yet: make a link for the first one"
            )));
        }
        let link = new_link(
            tx.as_mut(),
            &self.config.pages,
            "another-passkey",
            account,
            None,
            FIRST_PASSKEY_MINUTES,
        )
        .await?;
        record(
            tx.as_mut(),
            "another-passkey-link",
            Some(account),
            None,
            &[],
            true,
            "a link for another passkey, from this Mac's command line",
            json!({ "domain": self.config.domain }),
        )
        .await?;
        tx.commit().await?;
        Ok(link)
    }

    /// A person's email, set from this Mac's command line: how the first owner gets theirs (agreed
    /// 8 Nov). The record keeps that it was set, never the address.
    pub async fn set_email(&self, handle: &str, email: &str) -> Result<()> {
        let email = check_email(email)?;
        let mut tx = self.write().await?;
        let (account, kind, _) = account_by_handle(tx.as_mut(), handle).await?;
        if kind != "person" {
            return Err(Error::Invalid(format!(
                "{handle} is not a person: only people have an email"
            )));
        }
        let used: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM gov.accounts WHERE lower(email) = $1 AND id <> $2)",
        )
        .bind(&email)
        .bind(account)
        .fetch_one(tx.as_mut())
        .await?;
        if used {
            return Err(Error::Invalid(
                "that email belongs to another account".into(),
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
            "email set from this Mac's command line",
            json!({}),
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Invites a person: a handle, a display name and first grants, each of which the inviter must
    /// be allowed to grant there. They make their own passkey from a link that works once, for 24
    /// hours.
    pub async fn invite(
        &self,
        credential: &Credential,
        touch: Option<Uuid>,
        handle: &str,
        display_name: &str,
        email: &str,
        grants: &[GrantSpec],
    ) -> Result<String> {
        // Each role it gives is asked for too, in its place, with the same touch: inviting alone
        // must not hand out roles one may not grant (architecture review, 9 Nov). The touch names
        // the invitee and the roles (step 7), and it is all decided where it is written.
        let then: Vec<(&str, Vec<Target>)> = grants
            .iter()
            .map(|g| ("grant", vec![Target::Path(g.scope.clone())]))
            .collect();
        let about = invite_about(handle, grants);
        let noi = [Target::Path("noi".into())];
        let asks = together(("invite", &noi), Some(&about), touch, &then);
        let tx = self.write().await?;
        let (mut tx, by) = self.decide_in(tx, credential, &asks).await?;
        let account = new_account(
            tx.as_mut(),
            handle,
            display_name,
            "person",
            "invited",
            Some(by),
            Some(email),
            None,
        )
        .await?;
        for g in grants {
            add_grant(tx.as_mut(), account, g, Some(by)).await?;
        }
        let link = new_link(
            tx.as_mut(),
            &self.config.pages,
            "invitation",
            account,
            Some(by),
            INVITATION_HOURS * 60,
        )
        .await?;
        record(
            tx.as_mut(),
            "invite",
            Some(by),
            Some("invite"),
            &[format!("account:{account}")],
            true,
            "invited",
            json!({"handle": handle, "grants": grants}),
        )
        .await?;
        tx.commit().await?;
        Ok(link)
    }

    /// Makes an agent: its sponsor answers for it, and only its platform may vouch for its runs.
    #[allow(clippy::too_many_arguments)]
    pub async fn add_agent(
        &self,
        credential: &Credential,
        touch: Option<Uuid>,
        handle: &str,
        display_name: &str,
        purpose: &str,
        sponsor: &str,
        vouched_by: &str,
    ) -> Result<Uuid> {
        let about = json!({ "handle": handle });
        let noi = [Target::Path("noi".into())];
        let tx = self.write().await?;
        let (mut tx, by) = self
            .decide_in(
                tx,
                credential,
                &[Ask::new(
                    "add-agent",
                    &noi,
                    Some(&about),
                    touch.map(Proof::Touch),
                )],
            )
            .await?;
        let (sponsor_id, kind, state) = account_by_handle(tx.as_mut(), sponsor).await?;
        if kind != "person" || state != "active" {
            return Err(Error::Invalid(format!(
                "{sponsor} cannot sponsor an agent: a sponsor is an active person"
            )));
        }
        let known: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM gov.vouchers WHERE name = $1)")
                .bind(vouched_by)
                .fetch_one(tx.as_mut())
                .await?;
        if !known {
            return Err(Error::Invalid(format!(
                "{vouched_by} is not a platform Governance trusts"
            )));
        }
        let id = new_account(
            tx.as_mut(),
            handle,
            display_name,
            "agent",
            "active",
            Some(by),
            None,
            Some((sponsor_id, purpose.trim(), vouched_by)),
        )
        .await?;
        record(
            tx.as_mut(),
            "add-agent",
            Some(by),
            Some("add-agent"),
            &[format!("account:{id}")],
            true,
            "agent made",
            json!({"handle": handle, "sponsor": sponsor, "vouched_by": vouched_by}),
        )
        .await?;
        tx.commit().await?;
        Ok(id)
    }

    /// Grants a role in a place.
    pub async fn grant(
        &self,
        credential: &Credential,
        touch: Option<Uuid>,
        handle: &str,
        spec: &GrantSpec,
    ) -> Result<Uuid> {
        let account = {
            let mut conn = self.pool.acquire().await?;
            account_by_handle(&mut conn, handle).await?.0
        };
        if account == VISITORS && !self.reading_only(&spec.role).await? {
            return Err(Error::Refused(
                "visitors may be granted reading, and nothing more".into(),
            ));
        }
        // The touch names the role and the place (step 7), decided where it is written.
        let about = grant_about(spec);
        let whom = [Target::Account(account)];
        let tx = self.write().await?;
        let (mut tx, by) = self
            .decide_in(
                tx,
                credential,
                &[Ask::new(
                    "grant",
                    &whom,
                    Some(&about),
                    touch.map(Proof::Touch),
                )],
            )
            .await?;
        let id = add_grant(tx.as_mut(), account, spec, Some(by)).await?;
        record(
            tx.as_mut(),
            "grant",
            Some(by),
            Some("grant"),
            &[format!("account:{account}")],
            true,
            "granted",
            json!({"grant": id, "role": spec.role, "scope": spec.scope}),
        )
        .await?;
        tx.commit().await?;
        Ok(id)
    }

    /// Ends a grant. The role stays; only this link goes.
    pub async fn end_grant(
        &self,
        credential: &Credential,
        touch: Option<Uuid>,
        grant: Uuid,
    ) -> Result<()> {
        let account: Uuid =
            sqlx::query_scalar("SELECT account FROM gov.grants WHERE id = $1 AND ended_at IS NULL")
                .bind(grant)
                .fetch_optional(&self.pool)
                .await?
                .ok_or_else(|| Error::NotFound(format!("no live grant {grant}")))?;
        let about = json!({ "grant": grant });
        let whom = [Target::Account(account)];
        let tx = self.write().await?;
        let (mut tx, by) = self
            .decide_in(
                tx,
                credential,
                &[Ask::new(
                    "end-grant",
                    &whom,
                    Some(&about),
                    touch.map(Proof::Touch),
                )],
            )
            .await?;
        // Someone must always be able to change access: the last Owner in all of noi stays (10 Nov).
        // Refused here, the decision above is undone with it, so the touch is not spent.
        let last_owner: bool = sqlx::query_scalar(
            "SELECT g.role = $2 AND g.scope = 'noi' AND NOT EXISTS (
                 SELECT 1 FROM gov.grants o JOIN gov.accounts a ON a.id = o.account
                 WHERE o.id <> g.id AND o.role = $2 AND o.scope = 'noi' AND o.ended_at IS NULL
                   AND a.kind = 'person' AND a.state = 'active')
             FROM gov.grants g WHERE g.id = $1",
        )
        .bind(grant)
        .bind(OWNER)
        .fetch_one(tx.as_mut())
        .await?;
        if last_owner {
            return Err(Error::Refused(
                "this is the last owner: give Owner to someone else first".into(),
            ));
        }
        // Nobody is locked out (agreed 9 Nov, "Where Roles and Rules Live", decision 4): ending a
        // grant must not leave no one able to change roles and rules, as ending the last
        // Maintainer of the only owner would.
        let rows = super::decide::in_force(tx.as_mut()).await?;
        if super::roles::someone_can_change(tx.as_mut(), &rows, None).await?
            && !super::roles::someone_can_change(tx.as_mut(), &rows, Some(grant)).await?
        {
            return Err(Error::Refused(
                "no one could change roles and rules after this: give this role to someone else first".into(),
            ));
        }
        sqlx::query("UPDATE gov.grants SET ended_at = now(), ended_by = $2, end_reason = 'ended by an owner' WHERE id = $1 AND ended_at IS NULL")
            .bind(grant)
            .bind(by)
            .execute(tx.as_mut())
            .await?;
        record(
            tx.as_mut(),
            "end-grant",
            Some(by),
            Some("end-grant"),
            &[format!("account:{account}")],
            true,
            "grant ended",
            json!({"grant": grant}),
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// Ends every session and run token of an account at once.
    pub async fn end_sessions(
        &self,
        credential: &Credential,
        touch: Option<Uuid>,
        handle: &str,
    ) -> Result<u64> {
        let account = {
            let mut conn = self.pool.acquire().await?;
            account_by_handle(&mut conn, handle).await?.0
        };
        let whom = [Target::Account(account)];
        let tx = self.write().await?;
        let (mut tx, by) = self
            .decide_in(
                tx,
                credential,
                &[Ask::new(
                    "end-session",
                    &whom,
                    None,
                    touch.map(Proof::Touch),
                )],
            )
            .await?;
        let sessions = sqlx::query("UPDATE gov.sessions SET ended_at = now(), ended_by = $2 WHERE account = $1 AND ended_at IS NULL")
            .bind(account)
            .bind(by)
            .execute(tx.as_mut())
            .await?
            .rows_affected();
        let runs = sqlx::query("UPDATE gov.run_tokens SET ended_at = now(), ended_by = $2 WHERE agent = $1 AND ended_at IS NULL")
            .bind(account)
            .bind(by)
            .execute(tx.as_mut())
            .await?
            .rows_affected();
        record(
            tx.as_mut(),
            "end-session",
            Some(by),
            Some("end-session"),
            &[format!("account:{account}")],
            true,
            "sessions ended",
            json!({"sessions": sessions, "run_tokens": runs}),
        )
        .await?;
        tx.commit().await?;
        Ok(sessions + runs)
    }

    /// Who a session belongs to, and what they hold. Never the session itself.
    pub async fn me(&self, credential: &Credential) -> Result<Value> {
        let mut conn = self.pool.acquire().await?;
        let asker = self.asker(&mut conn, credential).await?;
        let (handle, display_name, kind): (String, String, String) =
            sqlx::query_as("SELECT handle, display_name, kind FROM gov.accounts WHERE id = $1")
                .bind(asker.account)
                .fetch_one(&mut *conn)
                .await?;
        let grants: Vec<(Uuid, String, String)> = sqlx::query_as("SELECT id, role, scope FROM gov.grants WHERE account = $1 AND ended_at IS NULL ORDER BY granted_at")
            .bind(asker.account)
            .fetch_all(&mut *conn)
            .await?;
        Ok(json!({
            "account": asker.account, "handle": handle, "display_name": display_name, "kind": kind,
            "grants": grants.into_iter().map(|(id, role, scope)| json!({"id": id, "role": role, "scope": scope})).collect::<Vec<_>>(),
        }))
    }

    /// Whether a role grants only reading: visitors may hold nothing else. Reading Review counts as
    /// reading (9 Nov, step 6: Observer holds both); signed out, rule 5 still refuses it at every
    /// request, so visitors who hold Observer read merons only.
    async fn reading_only(&self, role: &str) -> Result<bool> {
        let cedar: Option<String> =
            sqlx::query_scalar("SELECT cedar FROM gov.policies WHERE path = $1 AND kind = 'role'")
                .bind(role)
                .fetch_optional(&self.pool)
                .await?;
        let Some(cedar) = cedar else { return Ok(false) };
        let Ok(template) = cedar_policy::Template::parse(None, &cedar) else {
            return Ok(false);
        };
        let named = match template.action_constraint() {
            cedar_policy::ActionConstraint::Eq(a) => vec![a],
            cedar_policy::ActionConstraint::In(list) => list,
            cedar_policy::ActionConstraint::Any => return Ok(false),
        };
        Ok(!named.is_empty()
            && named
                .iter()
                .all(|a| matches!(a.id().unescaped(), "read" | "read-review")))
    }
}

/// What a touch for giving a role names beyond the account (9 Nov, step 7): the role and the place.
pub fn grant_about(spec: &GrantSpec) -> Value {
    json!({ "role": spec.role, "scope": spec.scope })
}

/// What a touch for an invite names (9 Nov, step 7): the handle, and each role and place it gives.
pub fn invite_about(handle: &str, grants: &[GrantSpec]) -> Value {
    let mut roles: Vec<String> = grants
        .iter()
        .map(|g| format!("{}@{}", g.role, g.scope))
        .collect();
    roles.sort();
    json!({ "handle": handle, "roles": roles })
}
