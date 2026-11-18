//! What Governance shows (7 Nov). Your own Profile needs no verb: who you are, your email, your
//! roles, your passkeys and where you are signed in; you may sign out everywhere. Ending one other
//! sign-in, or all the others, needs a touch, on Your account (9 Nov, see `own`). Whoever may
//! `view` (owners) also sees every account, the roles and who holds them, and the record. Nothing
//! here shows a token, a hash, a credential ID or a public key.
use super::{decide::role_name, digest, record, Credential, Error, Governance, Result, Target};
use crate::role_actions;
use chrono::{DateTime, Utc};

/// A kept problem: seq, when, request ID, method, path, status, what.
type ProblemRow = (i64, DateTime<Utc>, String, String, String, i32, String);
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgConnection;
use uuid::Uuid;

/// A short name for the browser and device a session was made on, from its User-Agent, such as
/// "Safari on a Mac". Only a label: Governance decides nothing from it.
pub fn device_label(user_agent: &str) -> String {
    let ua = user_agent;
    let browser = if ua.contains("Claude/") {
        "the Claude app"
    } else if ua.contains("Edg/") {
        "Edge"
    } else if ua.contains("Firefox/") || ua.contains("FxiOS/") {
        "Firefox"
    } else if ua.contains("Chrome/") || ua.contains("CriOS/") {
        "Chrome"
    } else if ua.contains("Safari/") {
        "Safari"
    } else {
        "a browser"
    };
    let device = if ua.contains("iPhone") {
        "an iPhone"
    } else if ua.contains("iPad") {
        "an iPad"
    } else if ua.contains("Android") {
        "Android"
    } else if ua.contains("Macintosh") || ua.contains("Mac OS X") {
        "a Mac"
    } else if ua.contains("Windows") {
        "Windows"
    } else if ua.contains("Linux") {
        "Linux"
    } else {
        "a device"
    };
    format!("{browser} on {device}")
}

/// Which part of the record to show: newest first, at most `limit` (1 to 200, default 50), before
/// an entry, one person's part (by them or about them), of one kind, only refusals, or one of the
/// record page's views (9 Nov): `changes`, `sign-ins`, `refused`, or everything.
#[derive(Debug, Default, Deserialize)]
pub struct RecordFilter {
    pub before: Option<i64>,
    pub who: Option<String>,
    pub kind: Option<String>,
    pub refused: Option<bool>,
    pub limit: Option<i64>,
    pub show: Option<String>,
}

type Grant = (Uuid, String, String, DateTime<Utc>, Option<String>);
type PasskeyRow = (Uuid, String, DateTime<Utc>, Option<DateTime<Utc>>);
type SessionRow = (
    Uuid,
    Option<String>,
    DateTime<Utc>,
    DateTime<Utc>,
    bool,
    Option<Uuid>,
    Option<String>,
);
type AccountRow = (
    Uuid,
    String,
    String,
    String,
    String,
    DateTime<Utc>,
    Option<String>,
    Value,
    Option<DateTime<Utc>>,
);
type LiveSession = (Option<String>, DateTime<Utc>, DateTime<Utc>);
type RunRow = (
    String,
    Option<String>,
    String,
    DateTime<Utc>,
    DateTime<Utc>,
    bool,
);
type PolicyRow = (String, String, Option<String>, String, String, i64);
type HolderRow = (String, String, String, String, DateTime<Utc>);

/// An account's live roles: which, where, when, and who granted them.
async fn roles_of(conn: &mut PgConnection, account: Uuid) -> Result<Vec<Value>> {
    let rows: Vec<Grant> = sqlx::query_as(
        "SELECT g.id, g.role, g.scope, g.granted_at, b.handle FROM gov.grants g
         LEFT JOIN gov.accounts b ON b.id = g.granted_by
         WHERE g.account = $1 AND g.ended_at IS NULL ORDER BY g.granted_at",
    )
    .bind(account)
    .fetch_all(conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, role, scope, at, by)| json!({"grant": id, "role": role_name(&role), "path": role, "scope": scope, "granted_at": at, "granted_by": by}))
        .collect())
}

/// An account's passkeys, by name only.
async fn passkeys_named(conn: &mut PgConnection, account: Uuid) -> Result<Vec<Value>> {
    let rows: Vec<PasskeyRow> = sqlx::query_as(
        "SELECT id, name, added_at, last_used_at FROM gov.passkeys WHERE account = $1 AND removed_at IS NULL ORDER BY added_at",
    )
    .bind(account)
    .fetch_all(conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, name, added, used)| json!({"id": id, "name": name, "added_at": added, "last_used_at": used}))
        .collect())
}

impl Governance {
    /// Your own Profile. Any signed-in person may see their own; no role is needed.
    pub async fn profile(&self, session: &str) -> Result<Value> {
        let mut conn = self.pool.acquire().await?;
        let asker = self
            .asker(&mut conn, &Credential::Session(session.into()))
            .await?;
        let (handle, display_name, kind, state, made_at, email): (
            String,
            String,
            String,
            String,
            DateTime<Utc>,
            Option<String>,
        ) = sqlx::query_as(
            "SELECT handle, display_name, kind, state, made_at, email FROM gov.accounts WHERE id = $1",
        )
        .bind(asker.account)
        .fetch_one(&mut *conn)
        .await?;
        let roles = roles_of(&mut conn, asker.account).await?;
        let passkeys = passkeys_named(&mut conn, asker.account).await?;
        // Each sign-in with the passkey that made it, when Governance knows (from 9 Nov).
        let sessions: Vec<SessionRow> = sqlx::query_as(
            "SELECT s.id, s.device, s.started_at, s.expires_at, s.token_hash = $2, s.passkey, p.name
             FROM gov.sessions s LEFT JOIN gov.passkeys p ON p.id = s.passkey
             WHERE s.account = $1 AND s.ended_at IS NULL AND s.expires_at > now() ORDER BY s.started_at DESC",
        )
        .bind(asker.account)
        .bind(digest(session))
        .fetch_all(&mut *conn)
        .await?;
        Ok(json!({
            "account": asker.account, "handle": handle, "display_name": display_name, "kind": kind, "state": state, "since": made_at,
            "email": email,
            "roles": roles,
            "passkeys": passkeys,
            "sessions": sessions.into_iter().map(|(id, device, started, expires, this, passkey, name)| json!({
                "id": id, "device": device.unwrap_or_else(|| "a browser".into()), "started_at": started, "expires_at": expires, "this": this,
                "passkey": passkey, "passkey_name": name,
            })).collect::<Vec<_>>(),
        }))
    }

    /// Ends every one of your sign-ins, this one too. Returns how many ended.
    pub async fn sign_out_everywhere(&self, session: &str) -> Result<u64> {
        let mut tx = self.write().await?;
        let asker = self
            .asker(tx.as_mut(), &Credential::Session(session.into()))
            .await?;
        let ended = sqlx::query("UPDATE gov.sessions SET ended_at = now(), ended_by = $1 WHERE account = $1 AND ended_at IS NULL")
            .bind(asker.account)
            .execute(tx.as_mut())
            .await?
            .rows_affected();
        record(
            tx.as_mut(),
            "sign-out",
            Some(asker.account),
            None,
            &[],
            true,
            "signed out everywhere",
            json!({"sessions": ended}),
        )
        .await?;
        tx.commit().await?;
        Ok(ended)
    }

    /// Whether this asker may see Governance's data: the `view` verb, in all of NOI.
    async fn may_view(&self, credential: &Credential) -> Result<()> {
        let answer = self
            .may(credential, "view", &[Target::Path("noi".into())], None)
            .await?;
        if answer.allowed {
            Ok(())
        } else {
            Err(Error::Refused(answer.reason))
        }
    }

    /// Governance's problems, newest first, for those who may view (owners).
    pub async fn problems(
        &self,
        credential: &Credential,
        before: Option<i64>,
        limit: Option<i64>,
    ) -> Result<Value> {
        self.may_view(credential).await?;
        let limit = limit.unwrap_or(50).clamp(1, 200);
        let rows: Vec<ProblemRow> = sqlx::query_as(
            "SELECT seq, at, request_id, method, path, status, what FROM gov.problems
             WHERE $1::bigint IS NULL OR seq < $1 ORDER BY seq DESC LIMIT $2",
        )
        .bind(before)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        let next = (rows.len() as i64 == limit)
            .then(|| rows.last().map(|r| r.0))
            .flatten();
        Ok(json!({
            "problems": rows.into_iter().map(|(seq, at, request_id, method, path, status, what)| json!({
                "seq": seq, "at": at, "request_id": request_id, "method": method, "path": path, "status": status, "what": what,
            })).collect::<Vec<_>>(),
            "next": next,
        }))
    }

    /// Everyone who can act in NOI: people, agents and the visitors account.
    pub async fn accounts(&self, credential: &Credential) -> Result<Value> {
        self.may_view(credential).await?;
        let mut conn = self.pool.acquire().await?;
        // Each with the roles held and where (agreed 9 Nov), and when they last signed in: a
        // person's newest sign-in, an agent's newest run.
        let rows: Vec<AccountRow> = sqlx::query_as(
            "SELECT a.id, a.handle, a.display_name, a.kind, a.state, a.made_at, s.handle,
                    COALESCE((SELECT jsonb_agg(jsonb_build_object('role', g.role, 'scope', g.scope) ORDER BY g.granted_at)
                              FROM gov.grants g WHERE g.account = a.id AND g.ended_at IS NULL), '[]'),
                    GREATEST((SELECT max(started_at) FROM gov.sessions WHERE account = a.id),
                             (SELECT max(issued_at) FROM gov.run_tokens WHERE agent = a.id))
             FROM gov.accounts a LEFT JOIN gov.accounts s ON s.id = a.sponsor
             ORDER BY a.kind, a.handle",
        )
        .fetch_all(&mut *conn)
        .await?;
        Ok(
            json!({"accounts": rows.into_iter().map(|(id, handle, name, kind, state, since, sponsor, held, last)| {
            let held: Vec<Value> = held.as_array().cloned().unwrap_or_default().into_iter().map(|g| json!({
                "role": g["role"].as_str().map(role_name), "path": g["role"], "scope": g["scope"],
            })).collect();
            json!({
                "id": id, "handle": handle, "display_name": name, "kind": kind, "state": state, "since": since, "sponsor": sponsor,
                "roles": held.len(), "held": held, "last_signed_in": last,
            })
        }).collect::<Vec<_>>()}),
        )
    }

    /// One account: its roles, passkeys by name, where it is signed in and, for an agent, its runs.
    pub async fn account(&self, credential: &Credential, handle: &str) -> Result<Value> {
        self.may_view(credential).await?;
        let mut conn = self.pool.acquire().await?;
        type Row = (
            Uuid,
            String,
            String,
            String,
            DateTime<Utc>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        );
        let row: Option<Row> = sqlx::query_as(
            "SELECT a.id, a.display_name, a.kind, a.state, a.made_at, m.handle, s.handle, a.purpose, a.vouched_by
             FROM gov.accounts a LEFT JOIN gov.accounts m ON m.id = a.made_by LEFT JOIN gov.accounts s ON s.id = a.sponsor
             WHERE a.handle = $1",
        )
        .bind(handle)
        .fetch_optional(&mut *conn)
        .await?;
        let (id, name, kind, state, since, made_by, sponsor, purpose, vouched_by) =
            row.ok_or_else(|| Error::NotFound(format!("no account is called {handle}")))?;
        let roles = roles_of(&mut conn, id).await?;
        let passkeys = passkeys_named(&mut conn, id).await?;
        let sessions: Vec<LiveSession> = sqlx::query_as(
            "SELECT device, started_at, expires_at FROM gov.sessions WHERE account = $1 AND ended_at IS NULL AND expires_at > now() ORDER BY started_at DESC",
        )
        .bind(id)
        .fetch_all(&mut *conn)
        .await?;
        let runs: Vec<RunRow> = sqlx::query_as(
            "SELECT t.run, b.handle, t.vouched_by, t.issued_at, t.expires_at, t.ended_at IS NULL AND t.expires_at > now()
             FROM gov.run_tokens t LEFT JOIN gov.accounts b ON b.id = t.started_by
             WHERE t.agent = $1 ORDER BY t.issued_at DESC LIMIT 20",
        )
        .bind(id)
        .fetch_all(&mut *conn)
        .await?;
        Ok(json!({
            "id": id, "handle": handle, "display_name": name, "kind": kind, "state": state, "since": since,
            "made_by": made_by, "sponsor": sponsor, "purpose": purpose, "vouched_by": vouched_by,
            "roles": roles,
            "passkeys": passkeys.into_iter().map(|mut p| { p.as_object_mut().map(|o| o.remove("id")); p }).collect::<Vec<_>>(),
            "sessions": sessions.into_iter().map(|(device, started, expires)| json!({
                "device": device.unwrap_or_else(|| "a browser".into()), "started_at": started, "expires_at": expires,
            })).collect::<Vec<_>>(),
            "runs": runs.into_iter().map(|(run, by, vouched, issued, expires, live)| json!({
                "run": run, "started_by": by, "vouched_by": vouched, "issued_at": issued, "expires_at": expires, "live": live,
            })).collect::<Vec<_>>(),
        }))
    }

    /// The roles and rules in Governance's copy, each role's verbs, and who holds it where.
    pub async fn roles(&self, credential: &Credential) -> Result<Value> {
        self.may_view(credential).await?;
        let mut conn = self.pool.acquire().await?;
        let policies: Vec<PolicyRow> =
            sqlx::query_as("SELECT path, kind, system, cedar, state, revision FROM gov.policies ORDER BY kind, path")
                .fetch_all(&mut *conn)
                .await?;
        let holders: Vec<HolderRow> = sqlx::query_as(
            "SELECT g.role, a.handle, a.kind, g.scope, g.granted_at FROM gov.grants g JOIN gov.accounts a ON a.id = g.account
             WHERE g.ended_at IS NULL ORDER BY g.granted_at",
        )
        .fetch_all(&mut *conn)
        .await?;
        let copied: Option<(DateTime<Utc>, String)> =
            sqlx::query_as("SELECT at, source FROM gov.copies ORDER BY id DESC LIMIT 1")
                .fetch_optional(&mut *conn)
                .await?;
        let roles: Vec<Value> = policies
            .iter()
            .filter(|p| p.1 == "role")
            .map(|(path, _, system, cedar, state, revision)| {
                let held: Vec<Value> = holders
                    .iter()
                    .filter(|h| &h.0 == path)
                    .map(|(_, handle, kind, scope, at)| json!({"handle": handle, "kind": kind, "scope": scope, "granted_at": at}))
                    .collect();
                json!({
                    "path": path, "name": role_name(path), "system": system, "verbs": role_actions(cedar).unwrap_or_default(),
                    "state": state, "revision": revision, "cedar": cedar, "holders": held,
                })
            })
            .collect();
        let rules: Vec<Value> = policies
            .iter()
            .filter(|p| p.1 == "rule")
            .map(|(path, _, _, cedar, state, revision)| json!({"path": path, "cedar": cedar, "state": state, "revision": revision}))
            .collect();
        Ok(json!({
            "roles": roles, "rules": rules,
            "copied": copied.map(|(at, source)| json!({"at": at, "source": source})),
        }))
    }

    /// The record, newest first.
    pub async fn record_page(
        &self,
        credential: &Credential,
        filter: &RecordFilter,
    ) -> Result<Value> {
        self.may_view(credential).await?;
        let limit = filter.limit.unwrap_or(50).clamp(1, 200);
        let show = filter.show.as_deref().unwrap_or("everything");
        if !["everything", "changes", "sign-ins", "refused"].contains(&show) {
            return Err(Error::Invalid(format!(
                "{show} is not a view of the record: everything, changes, sign-ins or refused"
            )));
        }
        let mut conn = self.pool.acquire().await?;
        // Allowed reads recorded before 9 Nov stay in the record, which can't change, and are left
        // out here: Governance no longer records them (agreed 9 Nov, finding I).
        let rows: Vec<RecordRow> = sqlx::query_as(
            "WITH copies AS (
                 SELECT seq, resources, lag(resources) OVER (ORDER BY seq) AS before
                 FROM gov.record WHERE kind = 'copy' AND allowed
             )
             SELECT r.seq, r.at, r.kind, a.handle, r.action, r.resources, r.allowed, r.reason, r.detail,
                    t.handle, g.role, g.scope, c.resources, c.before
             FROM gov.record r
             LEFT JOIN gov.accounts a ON a.id = r.account
             LEFT JOIN gov.accounts t ON 'account:' || t.id::text = r.resources->>0
             LEFT JOIN gov.grants g ON g.id::text = r.detail->>'grant'
             LEFT JOIN copies c ON c.seq = r.seq
             WHERE NOT (r.kind = 'decision' AND r.action = 'read' AND r.allowed)
               AND ($1::bigint IS NULL OR r.seq < $1)
               AND ($2::text IS NULL OR a.handle = $2 OR t.handle = $2)
               AND ($3::text IS NULL OR r.kind = $3)
               AND ($4::boolean IS NULL OR r.allowed = NOT $4)
               AND CASE $6
                   WHEN 'changes' THEN r.allowed
                       AND r.kind <> ALL($7)
                       AND NOT (r.kind = 'decision' AND r.action = 'view')
                       AND NOT (r.kind = 'copy' AND c.before IS NOT DISTINCT FROM c.resources)
                   WHEN 'sign-ins' THEN r.kind = ANY($8)
                   WHEN 'refused' THEN NOT r.allowed
                   ELSE true
               END
             ORDER BY r.seq DESC LIMIT $5",
        )
        .bind(filter.before)
        .bind(&filter.who)
        .bind(&filter.kind)
        .bind(filter.refused)
        .bind(limit)
        .bind(show)
        .bind(NOT_CHANGES.iter().map(|k| k.to_string()).collect::<Vec<_>>())
        .bind(SIGN_IN_KINDS.iter().map(|k| k.to_string()).collect::<Vec<_>>())
        .fetch_all(&mut *conn)
        .await?;
        let next = if rows.len() as i64 == limit {
            rows.last().map(|r| r.0)
        } else {
            None
        };
        Ok(json!({
            "entries": rows.into_iter().map(|(seq, at, kind, who, action, places, allowed, reason, detail, whom, role, scope, now, before)| {
                let mut entry = json!({
                    "seq": seq, "at": at, "kind": kind, "who": who, "by": who, "action": action, "places": places,
                    "allowed": allowed, "reason": reason, "detail": detail, "whom": whom,
                    "role": role.as_deref().map(role_name), "scope": scope,
                });
                if let Some(now) = now {
                    entry["changed"] = json!(revisions_moved(&now, before.as_ref()));
                }
                entry
            }).collect::<Vec<_>>(),
            "next": next,
        }))
    }

    /// What Governance's home shows whoever is looking (agreed 9 Nov). Signed out: nothing, and
    /// nothing asked. Signed in: you and your roles. Whoever may `view` (owners) also gets how many
    /// hold each role, the latest changes, and what needs attention. One `view` question per look.
    pub async fn dashboard(&self, credential: &Credential) -> Result<Value> {
        if matches!(credential, Credential::Visitor) {
            return Ok(json!({"you": null}));
        }
        let mut conn = self.pool.acquire().await?;
        let asker = self.asker(&mut conn, credential).await?;
        let (handle, display_name, kind): (String, String, String) =
            sqlx::query_as("SELECT handle, display_name, kind FROM gov.accounts WHERE id = $1")
                .bind(asker.account)
                .fetch_one(&mut *conn)
                .await?;
        let you = json!({
            "handle": handle, "display_name": display_name, "kind": kind,
            "roles": roles_of(&mut conn, asker.account).await?,
        });
        drop(conn);
        let view = self
            .may(credential, "view", &[Target::Path("noi".into())], None)
            .await?;
        if !view.allowed {
            return Ok(json!({"you": you, "view": false}));
        }
        let mut conn = self.pool.acquire().await?;
        let held: Vec<(String, i64)> = sqlx::query_as(
            "SELECT role, count(DISTINCT account) FROM gov.grants WHERE ended_at IS NULL GROUP BY role",
        )
        .fetch_all(&mut *conn)
        .await?;
        let waiting: Vec<String> = sqlx::query_scalar(
            "SELECT handle FROM gov.accounts WHERE state = 'invited' ORDER BY made_at",
        )
        .fetch_all(&mut *conn)
        .await?;
        let problems: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM gov.problems WHERE at > now() - interval '1 day'",
        )
        .fetch_one(&mut *conn)
        .await?;
        Ok(json!({
            "you": you,
            "view": true,
            "held": held.into_iter().map(|(role, n)| (role, json!(n))).collect::<serde_json::Map<String, Value>>(),
            "changes": changes(&mut conn, 8).await?,
            "attention": {"waiting": waiting, "problems_today": problems},
        }))
    }

    /// The public part of someone's profile, for their link (`no-origins.com/@handle`, agreed 9
    /// Nov): handle, name, person or agent, and since when. Only active people and agents have one.
    /// What else it shows is for later; owners see more through `account`.
    pub async fn public_profile(&self, handle: &str) -> Result<Value> {
        type Row = (
            String,
            String,
            String,
            DateTime<Utc>,
            Option<String>,
            Option<String>,
        );
        let row: Option<Row> = sqlx::query_as(
            "SELECT a.handle, a.display_name, a.kind, a.made_at, s.handle, a.purpose FROM gov.accounts a
             LEFT JOIN gov.accounts s ON s.id = a.sponsor
             WHERE a.handle = $1 AND a.state = 'active' AND a.kind IN ('person', 'agent')",
        )
        .bind(handle)
        .fetch_optional(&self.pool)
        .await?;
        let (handle, display_name, kind, since, sponsor, purpose) =
            row.ok_or_else(|| Error::NotFound(format!("no one here is called {handle}")))?;
        let mut person =
            json!({"handle": handle, "display_name": display_name, "kind": kind, "since": since});
        // An agent's sponsor and purpose are public (agreed 9 Nov): who answers for it, and what it
        // is for. A person's roles stay for owners, and themselves.
        if kind == "agent" {
            person["sponsor"] = json!(sponsor);
            person["purpose"] = json!(purpose);
        }
        Ok(person)
    }
}

/// The kinds of record entries that change who may do what. Sign-ups count once confirmed (they
/// name the account then), and copies of Mero's roles and rules only when a revision moved.
const CHANGE_KINDS: &[&str] = &[
    "setup",
    "grant",
    "end-grant",
    "add-agent",
    "voucher-add",
    "invite",
];

/// Entries about signing in: a person's sign-in, sign-out and touch, and an agent's run.
const SIGN_IN_KINDS: &[&str] = &["sign-in", "sign-out", "touch", "run-token"];
/// Entries that are never a change: signing in, and what Governance says about itself.
const NOT_CHANGES: &[&str] = &[
    "sign-in",
    "sign-out",
    "touch",
    "run-token",
    "notice",
    "limit",
];

/// One entry of the record page: seq, when, kind, by whom, action, places, allowed, why, detail, to
/// whom, the grant's role and place, and for a copy, its revisions and the copy's before it.
type RecordRow = (
    i64,
    DateTime<Utc>,
    String,
    Option<String>,
    Option<String>,
    Value,
    bool,
    String,
    Value,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<Value>,
    Option<Value>,
);

/// A change in the record: seq, when, kind, by whom, to whom, the grant's role and place, detail,
/// and for a copy, its revisions and the copy's before it.
type ChangeRow = (
    i64,
    DateTime<Utc>,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Value,
    Option<Value>,
    Option<Value>,
);

/// The latest changes to who may do what, newest first: roles given and ended, agents and
/// vouchers added, invitations and sign-ups, and roles or rules changed in Mero.
async fn changes(conn: &mut PgConnection, limit: i64) -> Result<Vec<Value>> {
    let kinds: Vec<String> = CHANGE_KINDS.iter().map(|k| k.to_string()).collect();
    let rows: Vec<ChangeRow> = sqlx::query_as(
        "WITH copies AS (
             SELECT seq, resources, lag(resources) OVER (ORDER BY seq) AS before
             FROM gov.record WHERE kind = 'copy' AND allowed
         )
         SELECT r.seq, r.at, r.kind, a.handle, t.handle, g.role, g.scope, r.detail, c.resources, c.before
         FROM gov.record r
         LEFT JOIN gov.accounts a ON a.id = r.account
         LEFT JOIN gov.accounts t ON 'account:' || t.id::text = r.resources->>0
         LEFT JOIN gov.grants g ON g.id::text = r.detail->>'grant'
         LEFT JOIN copies c ON c.seq = r.seq
         WHERE r.allowed AND (
             r.kind = ANY($1)
             OR (r.kind = 'sign-up' AND r.account IS NOT NULL)
             OR (r.kind = 'copy' AND c.before IS DISTINCT FROM c.resources)
         )
         ORDER BY r.seq DESC LIMIT $2",
    )
    .bind(&kinds)
    .bind(limit)
    .fetch_all(conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(
            |(seq, at, kind, by, whom, role, scope, detail, now, before)| {
                let mut change = json!({
                    "seq": seq, "at": at, "kind": kind, "by": by, "whom": whom, "detail": detail,
                    "role": role.as_deref().map(role_name), "scope": scope,
                });
                if let Some(now) = now {
                    change["changed"] = json!(revisions_moved(&now, before.as_ref()));
                }
                change
            },
        )
        .collect())
}

/// Which roles and rules a copy brought a new revision of, against the copy before it, as
/// "noi.gov.roles.observer@5". All of them for the first copy.
fn revisions_moved(now: &Value, before: Option<&Value>) -> Vec<String> {
    let list = |v: &Value| -> Vec<String> {
        v.as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default()
    };
    let before = before.map(list).unwrap_or_default();
    list(now)
        .into_iter()
        .filter(|r| !before.contains(r))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{device_label, revisions_moved};
    use serde_json::json;

    #[test]
    fn a_copy_changes_only_what_moved_revision() {
        let before = json!(["noi.gov.roles.owner@3", "noi.gov.roles.observer@4"]);
        let now = json!(["noi.gov.roles.owner@3", "noi.gov.roles.observer@5"]);
        assert_eq!(
            revisions_moved(&now, Some(&before)),
            ["noi.gov.roles.observer@5"]
        );
        assert!(revisions_moved(&now, Some(&now)).is_empty());
        assert_eq!(
            revisions_moved(&now, None).len(),
            2,
            "the first copy brings all"
        );
    }

    #[test]
    fn a_session_is_named_for_its_browser_and_device() {
        let safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
        let chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
        let claude = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/4.16336.0 Chrome/152.0.7977.167 Safari/537.36";
        let iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/152.0 Mobile/15E148 Safari/604.1";
        assert_eq!(device_label(safari), "Safari on a Mac");
        assert_eq!(device_label(chrome), "Chrome on a Mac");
        assert_eq!(device_label(claude), "the Claude app on a Mac");
        assert_eq!(device_label(iphone), "Chrome on an iPhone");
        assert_eq!(device_label(""), "a browser on a device");
    }
}
