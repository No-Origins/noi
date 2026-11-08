//! Governance over HTTP, on loopback only. Its own small pages run the passkey ceremonies, so a
//! passkey is only ever used on Governance's origin or the Explorer's. The session travels as an
//! HttpOnly, SameSite=Strict cookie that no page script can read. Requests from other hosts or
//! sites are refused.
use super::{
    accounts::GrantSpec, Credential, Error, Governance, Target, SESSION_COOKIE, SESSION_HOURS,
};
use axum::{
    extract::{ConnectInfo, Path, Query, Request, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use noi_log::limits::Window;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{net::SocketAddr, time::Duration};
use uuid::Uuid;
use webauthn_rs::prelude::{PublicKeyCredential, RegisterPublicKeyCredential};

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status = match &self {
            Error::Refused(_) => StatusCode::FORBIDDEN,
            Error::Invalid(_) | Error::Passkey(_) => StatusCode::BAD_REQUEST,
            Error::NotFound(_) => StatusCode::NOT_FOUND,
            Error::Mero(_) => StatusCode::BAD_GATEWAY,
            Error::TooMany(_) => StatusCode::TOO_MANY_REQUESTS,
            Error::Database(_) | Error::Migration(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        // Internal failures stay in Governance's log; the asker learns only that it said no.
        let message = match &self {
            Error::Database(_) | Error::Migration(_) => {
                "Governance could not answer, so no".to_string()
            }
            other => other.to_string(),
        };
        let mut response = (status, Json(json!({"error": message}))).into_response();
        // The inner reason goes to the log and the Problems page; never to the asker.
        if status.is_server_error() {
            response
                .extensions_mut()
                .insert(noi_log::Why(self.to_string()));
        }
        response
    }
}

type Result<T> = std::result::Result<T, Error>;

pub fn router(gov: Governance) -> Router {
    Router::new()
        .route("/", get(|| async { page("Governance", INDEX) }))
        .route("/sign-in", get(|| async { page("Sign in", SIGN_IN) }))
        .route(
            "/link/{token}",
            get(|| async { page("Add your passkey", LINK) }),
        )
        .route("/health/alive", get(|| async { noi_log::health::alive() }))
        .route("/health/ready", get(ready))
        .route("/api/me", get(me))
        .route("/api/link/start", post(link_start))
        .route("/api/link/finish", post(link_finish))
        .route("/api/sign-in/start", post(sign_in_start))
        .route("/api/sign-in/finish", post(sign_in_finish))
        .route("/api/sign-out", post(sign_out))
        .route("/api/touch/start", post(touch_start))
        .route("/api/touch/finish", post(touch_finish))
        .route("/api/may", post(may))
        .route("/api/profile", get(profile))
        .route("/api/profile/sign-out", post(profile_sign_out))
        .route(
            "/api/profile/sign-out-everywhere",
            post(sign_out_everywhere),
        )
        .route("/api/accounts", get(accounts))
        .route("/api/accounts/{handle}", get(account))
        .route("/api/roles", get(roles))
        .route("/api/record", get(record_page))
        .route("/api/problems", get(problems))
        .route("/api/who", post(who))
        .route("/api/run-tokens", post(run_token))
        .route("/api/grants", post(grant))
        .route("/api/grants/end", post(end_grant))
        .route("/api/invitations", post(invite))
        .route("/api/agents", post(add_agent))
        .route("/api/sessions/end", post(end_sessions))
        .route("/api/copy", post(copy))
        .layer(middleware::from_fn_with_state(
            (gov.clone(), Tries::new()),
            limit_starts,
        ))
        .layer(middleware::from_fn_with_state(gov.clone(), same_machine))
        .with_state(gov)
}

/// How many sign-ins, one-time links and touches may start in a minute (agreed 8 Nov).
pub const STARTS_PER_MINUTE: usize = 10;

/// Counts starts: sign-ins and links per address, touches per sign-in (they arrive from the one
/// app's server, so its address says nothing about who asks). A refusal is recorded once a minute
/// for each, so a flood cannot fill the record.
#[derive(Clone)]
struct Tries {
    starts: Window,
    noted: Window,
}
impl Tries {
    fn new() -> Self {
        Self {
            starts: Window::new(STARTS_PER_MINUTE, Duration::from_secs(60)),
            noted: Window::new(1, Duration::from_secs(60)),
        }
    }
}

/// Which count a start belongs to, if it is one: its key, and what the key stands for.
fn start_key(req: &Request) -> Option<(String, &'static str)> {
    match req.uri().path() {
        "/api/sign-in/start" | "/api/link/start" => {
            let address = req
                .extensions()
                .get::<ConnectInfo<SocketAddr>>()
                .map(|c| c.0.ip().to_string())
                .unwrap_or_else(|| "unknown".into());
            Some((format!("address:{address}"), "address"))
        }
        "/api/touch/start" => cookie_session(req.headers()).map(|token| {
            (
                format!("sign-in:{}", hex(&super::digest(&token)[..8])),
                "sign-in",
            )
        }),
        _ => None,
    }
}

async fn limit_starts(
    State((gov, tries)): State<(Governance, Tries)>,
    req: Request,
    next: Next,
) -> Response {
    let Some((key, per)) = start_key(&req) else {
        return next.run(req).await;
    };
    let Err(wait) = tries.starts.allow(&key) else {
        return next.run(req).await;
    };
    if tries.noted.allow(&key).is_ok() {
        let path = req.uri().path().to_string();
        gov.note_limit(
            None,
            &format!("more than {STARTS_PER_MINUTE} starts a minute from one {per}"),
            json!({ "path": path }),
        )
        .await;
    }
    Error::TooMany(format!(
        "too many tries: wait {} seconds, then try again",
        wait.as_secs().max(1)
    ))
    .into_response()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Only this machine, by its own names, and never a request sent from another site.
async fn same_machine(State(gov): State<Governance>, req: Request, next: Next) -> Response {
    let port = gov.config().origin.port_or_known_default().unwrap_or(80);
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    let local = |h: &str| h == format!("localhost:{port}") || h == format!("127.0.0.1:{port}");
    if !local(host) {
        return Error::Refused("Governance answers only on this machine".into()).into_response();
    }
    if let Some(origin) = req.headers().get(header::ORIGIN) {
        let ok = origin
            .to_str()
            .ok()
            .and_then(|o| url::Url::parse(o).ok())
            .is_some_and(|u| {
                u.scheme() == "http"
                    && matches!(u.host_str(), Some("localhost") | Some("127.0.0.1"))
            });
        if !ok {
            return Error::Refused("requests from other sites are refused".into()).into_response();
        }
    }
    if req.method() == Method::POST
        && !req
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|c| c.to_str().ok())
            .is_some_and(|c| c.starts_with("application/json"))
    {
        return Error::Invalid("send JSON".into()).into_response();
    }
    next.run(req).await
}

fn cookie_session(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|c| c.trim().split_once('='))
        .find(|(k, _)| *k == SESSION_COOKIE)
        .map(|(_, v)| v.to_string())
}
fn session(headers: &HeaderMap) -> Result<String> {
    cookie_session(headers).ok_or_else(|| Error::Refused("signed out: sign in first".into()))
}
fn set_session(token: &str) -> HeaderValue {
    HeaderValue::from_str(&format!(
        "{SESSION_COOKIE}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={}",
        SESSION_HOURS * 3600
    ))
    .expect("a cookie")
}
fn signed_in(token: &str) -> Response {
    (
        [(header::SET_COOKIE, set_session(token))],
        Json(json!({"ok": true})),
    )
        .into_response()
}

/// Who holds this credential: what a system asks before it acts for someone. A credential that
/// does not check out is refused.
#[derive(Deserialize)]
struct WhoIs {
    credential: Credential,
}
async fn who(State(gov): State<Governance>, Json(b): Json<WhoIs>) -> Result<Json<Value>> {
    let me = gov.me(&b.credential).await?;
    if let Some(handle) = me["handle"].as_str() {
        noi_log::who(handle);
    }
    Ok(Json(me))
}

/// Who is signed in, or null when no one is.
async fn me(State(gov): State<Governance>, headers: HeaderMap) -> Result<Json<Value>> {
    let Some(token) = cookie_session(&headers) else {
        return Ok(Json(Value::Null));
    };
    match gov.me(&Credential::Session(token)).await {
        Ok(me) => Ok(Json(me)),
        Err(Error::Refused(_)) => Ok(Json(Value::Null)),
        Err(e) => Err(e),
    }
}

#[derive(Deserialize)]
struct LinkStart {
    token: String,
}
async fn link_start(
    State(gov): State<Governance>,
    Json(b): Json<LinkStart>,
) -> Result<impl IntoResponse> {
    Ok(Json(gov.link_start(&b.token).await?))
}
#[derive(Deserialize)]
struct LinkFinish {
    ceremony: Uuid,
    credential: RegisterPublicKeyCredential,
    #[serde(default)]
    name: String,
}
/// The browser and device a new session is made on, as a label for Profile.
fn device(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(super::device_label)
}
async fn link_finish(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<LinkFinish>,
) -> Result<Response> {
    Ok(signed_in(
        &gov.link_finish_on(
            b.ceremony,
            &b.credential,
            &b.name,
            device(&headers).as_deref(),
        )
        .await?,
    ))
}

#[derive(Deserialize)]
struct SignInStart {
    handle: String,
}
async fn sign_in_start(
    State(gov): State<Governance>,
    Json(b): Json<SignInStart>,
) -> Result<impl IntoResponse> {
    Ok(Json(gov.sign_in_start(b.handle.trim()).await?))
}
#[derive(Deserialize)]
struct Finish {
    ceremony: Uuid,
    credential: PublicKeyCredential,
}
async fn sign_in_finish(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<Finish>,
) -> Result<Response> {
    Ok(signed_in(
        &gov.sign_in_finish_on(b.ceremony, &b.credential, device(&headers).as_deref())
            .await?,
    ))
}

/// Your own Profile: who you are, your roles, passkeys and sign-ins.
async fn profile(State(gov): State<Governance>, headers: HeaderMap) -> Result<Json<Value>> {
    Ok(Json(gov.profile(&session(&headers)?).await?))
}
#[derive(Deserialize)]
struct SignOutOne {
    session: Uuid,
}
async fn profile_sign_out(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<SignOutOne>,
) -> Result<Json<Value>> {
    gov.sign_out_session(&session(&headers)?, b.session).await?;
    Ok(Json(json!({"ok": true})))
}
async fn sign_out_everywhere(
    State(gov): State<Governance>,
    headers: HeaderMap,
) -> Result<Response> {
    let ended = gov.sign_out_everywhere(&session(&headers)?).await?;
    let clear =
        HeaderValue::from_static("noi_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    Ok(([(header::SET_COOKIE, clear)], Json(json!({"ended": ended}))).into_response())
}

/// Who is looking at Governance's data: the signed-in person, or a visitor.
fn viewer(headers: &HeaderMap) -> Credential {
    cookie_session(headers)
        .map(Credential::Session)
        .unwrap_or(Credential::Visitor)
}
async fn accounts(State(gov): State<Governance>, headers: HeaderMap) -> Result<Json<Value>> {
    Ok(Json(gov.accounts(&viewer(&headers)).await?))
}
async fn account(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Path(handle): Path<String>,
) -> Result<Json<Value>> {
    Ok(Json(gov.account(&viewer(&headers), &handle).await?))
}
async fn roles(State(gov): State<Governance>, headers: HeaderMap) -> Result<Json<Value>> {
    Ok(Json(gov.roles(&viewer(&headers)).await?))
}
async fn record_page(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Query(f): Query<super::RecordFilter>,
) -> Result<Json<Value>> {
    Ok(Json(gov.record_page(&viewer(&headers), &f).await?))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProblemsQuery {
    before: Option<i64>,
    limit: Option<i64>,
}
async fn problems(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Query(q): Query<ProblemsQuery>,
) -> Result<Json<Value>> {
    Ok(Json(
        gov.problems(&viewer(&headers), q.before, q.limit).await?,
    ))
}
async fn sign_out(State(gov): State<Governance>, headers: HeaderMap) -> Result<Response> {
    if let Some(token) = cookie_session(&headers) {
        gov.sign_out(&token).await?;
    }
    let clear =
        HeaderValue::from_static("noi_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
    Ok(([(header::SET_COOKIE, clear)], Json(json!({"ok": true}))).into_response())
}

#[derive(Deserialize)]
struct TouchStart {
    action: String,
    targets: Vec<Target>,
}
/// Governance can decide when its database answers and it holds a copy of the roles and rules.
async fn ready(State(gov): State<Governance>) -> Response {
    let (database, copy) = gov.readiness().await;
    noi_log::health::ready(&[("database", database), ("roles and rules", copy)])
}

async fn touch_start(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<TouchStart>,
) -> Result<impl IntoResponse> {
    Ok(Json(
        gov.touch_start(&session(&headers)?, &b.action, &b.targets)
            .await?,
    ))
}
async fn touch_finish(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<Finish>,
) -> Result<Json<Value>> {
    let touch = gov
        .touch_finish(&session(&headers)?, b.ceremony, &b.credential)
        .await?;
    Ok(Json(json!({"touch": touch})))
}

/// "May they?" A system names the credential it was given; a browser's cookie is used otherwise;
/// with neither, the asker is signed out.
#[derive(Deserialize)]
struct May {
    #[serde(default)]
    credential: Option<Credential>,
    action: String,
    targets: Vec<Target>,
    #[serde(default)]
    touch: Option<Uuid>,
}
async fn may(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<May>,
) -> Result<impl IntoResponse> {
    let credential = b
        .credential
        .or_else(|| cookie_session(&headers).map(Credential::Session))
        .unwrap_or(Credential::Visitor);
    let answer = gov.may(&credential, &b.action, &b.targets, b.touch).await?;
    if let Some(handle) = &answer.handle {
        noi_log::who(handle);
    }
    // Only what is safe to show: what, how many places, the answer and why; never the credential.
    if answer.allowed {
        tracing::info!(action = %b.action, places = b.targets.len(), touch = b.touch.is_some(), record = answer.record, "may: allowed");
    } else {
        tracing::info!(action = %b.action, places = b.targets.len(), touch = b.touch.is_some(), record = answer.record, why = %answer.reason, "may: refused");
    }
    Ok(Json(answer))
}

#[derive(Deserialize)]
struct RunToken {
    vouch: String,
}
async fn run_token(State(gov): State<Governance>, Json(b): Json<RunToken>) -> Result<Json<Value>> {
    let (token, agent) = gov.run_token(&b.vouch).await?;
    Ok(Json(
        json!({"run_token": token, "agent": agent, "expires_in": super::RUN_TOKEN_MINUTES * 60}),
    ))
}

#[derive(Deserialize)]
struct Grant {
    touch: Option<Uuid>,
    handle: String,
    role: String,
    scope: String,
}
async fn grant(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<Grant>,
) -> Result<Json<Value>> {
    let spec = GrantSpec {
        role: b.role,
        scope: b.scope,
    };
    let id = gov
        .grant(
            &Credential::Session(session(&headers)?),
            b.touch,
            &b.handle,
            &spec,
        )
        .await?;
    Ok(Json(json!({"grant": id})))
}
#[derive(Deserialize)]
struct EndGrant {
    touch: Option<Uuid>,
    grant: Uuid,
}
async fn end_grant(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<EndGrant>,
) -> Result<Json<Value>> {
    gov.end_grant(&Credential::Session(session(&headers)?), b.touch, b.grant)
        .await?;
    Ok(Json(json!({"ok": true})))
}
#[derive(Deserialize)]
struct Invite {
    touch: Option<Uuid>,
    handle: String,
    display_name: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    grants: Vec<GrantSpec>,
}
async fn invite(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<Invite>,
) -> Result<Json<Value>> {
    let link = gov
        .invite(
            &Credential::Session(session(&headers)?),
            b.touch,
            &b.handle,
            &b.display_name,
            b.email.as_deref(),
            &b.grants,
        )
        .await?;
    Ok(Json(json!({"link": link})))
}
#[derive(Deserialize)]
struct AddAgent {
    touch: Option<Uuid>,
    handle: String,
    display_name: String,
    purpose: String,
    sponsor: String,
    vouched_by: String,
}
async fn add_agent(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<AddAgent>,
) -> Result<Json<Value>> {
    let id = gov
        .add_agent(
            &Credential::Session(session(&headers)?),
            b.touch,
            &b.handle,
            &b.display_name,
            &b.purpose,
            &b.sponsor,
            &b.vouched_by,
        )
        .await?;
    Ok(Json(json!({"account": id})))
}
#[derive(Deserialize)]
struct EndSessions {
    touch: Option<Uuid>,
    handle: String,
}
async fn end_sessions(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<EndSessions>,
) -> Result<Json<Value>> {
    let ended = gov
        .end_sessions(&Credential::Session(session(&headers)?), b.touch, &b.handle)
        .await?;
    Ok(Json(json!({"ended": ended})))
}
/// Mero calls this after an approval in noi.gov. It only ever pulls what Mero has approved.
async fn copy(State(gov): State<Governance>) -> Result<impl IntoResponse> {
    Ok(Json(gov.copy_from_mero().await?))
}

fn page(title: &str, body: &str) -> Html<String> {
    let title = if title == "Governance" {
        "Governance".to_string()
    } else {
        format!("{title} · Governance")
    };
    Html(format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title><style>{STYLE}</style><script>{SCRIPT}</script></head><body><main><p class="label">No Origins · Governance</p>{body}</main></body></html>"#
    ))
}

const STYLE: &str = r#"
:root { color-scheme: light dark; --ink: #0a0a0a; --muted: #636363; --line: #d4d4d4; --page: #fafafa; --card: #fff; --accent: #ceee38; }
@media (prefers-color-scheme: dark) { :root { --ink: #fafafa; --muted: #a3a3a3; --line: #404040; --page: #0a0a0a; --card: #171717; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 16px/24px system-ui, sans-serif; }
main { max-width: 440px; margin: 64px auto; padding: 24px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; }
h1 { font-size: 24px; line-height: 32px; margin: 0 0 8px; }
p { margin: 0 0 16px; }
.label { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
label { display: block; margin: 0 0 16px; color: var(--muted); font-size: 14px; }
input { display: block; width: 100%; margin-top: 8px; min-height: 44px; padding: 0 12px; font: inherit; color: var(--ink); background: var(--page); border: 1px solid var(--line); border-radius: 12px; }
button { min-height: 44px; padding: 0 20px; font: inherit; font-weight: 600; color: #0a0a0a; background: var(--accent); border: 0; border-radius: 999px; cursor: pointer; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
#out { margin-top: 16px; min-height: 24px; color: var(--muted); }
"#;

const SCRIPT: &str = r#"
const dec = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const enc = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const out = t => { document.getElementById('out').textContent = t; };
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Governance said no');
  return j;
}
function creation(o) {
  const p = structuredClone(o.publicKey);
  p.challenge = dec(p.challenge); p.user.id = dec(p.user.id);
  (p.excludeCredentials || []).forEach(c => { c.id = dec(c.id); });
  return { publicKey: p };
}
function request(o) {
  const p = structuredClone(o.publicKey);
  p.challenge = dec(p.challenge);
  (p.allowCredentials || []).forEach(c => { c.id = dec(c.id); });
  return { publicKey: p };
}
const registered = c => ({ id: c.id, rawId: enc(c.rawId), type: c.type, extensions: c.getClientExtensionResults(),
  response: { attestationObject: enc(c.response.attestationObject), clientDataJSON: enc(c.response.clientDataJSON),
    transports: c.response.getTransports ? c.response.getTransports() : undefined } });
const asserted = c => ({ id: c.id, rawId: enc(c.rawId), type: c.type, extensions: c.getClientExtensionResults(),
  response: { authenticatorData: enc(c.response.authenticatorData), clientDataJSON: enc(c.response.clientDataJSON),
    signature: enc(c.response.signature), userHandle: c.response.userHandle ? enc(c.response.userHandle) : null } });
async function whoami() {
  const r = await fetch('/api/me');
  return r.ok ? r.json() : null;
}
async function showMe() {
  const me = await whoami();
  const el = document.getElementById('me');
  if (!el) return;
  el.textContent = me ? `Signed in as ${me.display_name} (${me.handle}).` : 'Signed out.';
  document.getElementById('signout').hidden = !me;
}
async function signOut() { await post('/api/sign-out'); showMe(); out(''); }
"#;

const INDEX: &str = r#"<h1>Governance</h1><p id="me">…</p>
<p><a href="/sign-in">Sign in</a></p><button id="signout" hidden onclick="signOut()">Sign out</button><p id="out"></p>
<script>addEventListener('DOMContentLoaded', showMe)</script>"#;

const SIGN_IN: &str = r#"<h1>Sign in</h1><p id="me">…</p>
<p>No passkey yet? Open the one-time link you were given first: it adds your passkey and signs you in.</p>
<label>Handle<input id="handle" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
<button onclick="signIn()">Sign in with your passkey</button> <button id="signout" hidden onclick="signOut()">Sign out</button>
<p id="out" role="status"></p>
<script>
addEventListener('DOMContentLoaded', showMe);
async function signIn() {
  try {
    out('Touch your passkey…');
    const s = await post('/api/sign-in/start', { handle: document.getElementById('handle').value });
    const c = await navigator.credentials.get(request(s.options));
    await post('/api/sign-in/finish', { ceremony: s.ceremony, credential: asserted(c) });
    out(''); showMe();
  } catch (e) { out(e.message); }
}
</script>"#;

const LINK: &str = r#"<h1>Add your passkey</h1>
<p>This link works once. Your passkey stays on your device; Governance keeps only its public half.</p>
<label>Name this passkey<input id="name" value="Touch ID on this Mac" autocomplete="off"></label>
<button onclick="addPasskey()">Add a passkey</button>
<p id="out" role="status"></p><p id="me"></p><button id="signout" hidden onclick="signOut()">Sign out</button>
<script>
async function addPasskey() {
  try {
    out('Touch to make your passkey…');
    const token = location.pathname.split('/').pop();
    const s = await post('/api/link/start', { token });
    const c = await navigator.credentials.create(creation(s.options));
    await post('/api/link/finish', { ceremony: s.ceremony, credential: registered(c), name: document.getElementById('name').value });
    out('Your passkey is added.'); showMe();
  } catch (e) { out(e.message); }
}
</script>"#;
