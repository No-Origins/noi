//! Governance over HTTP, on loopback only: its API and its health, and no pages. Its pages (sign
//! in, add your passkey) are in the one app (agreed 8 Nov), whose server asks this API, so a
//! passkey is only ever used on the app's pages. The session travels as an HttpOnly,
//! SameSite=Strict cookie that no page script can read. Requests from other hosts or sites are
//! refused.
use super::{
    accounts::GrantSpec, Change, Credential, Decide, Draft, Error, Governance, Target,
    FAILED_SIGN_INS, SESSION_COOKIE, SESSION_DAYS, WAIT_MINUTES,
};
use crate::form;
use axum::{
    extract::{ConnectInfo, Path, Query, Request, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
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
            Error::TooMany(_) => StatusCode::TOO_MANY_REQUESTS,
            Error::Mail(_) => StatusCode::BAD_GATEWAY,
            Error::Database(_) | Error::Migration(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        // Internal failures stay in Governance's log; the asker learns only that it said no.
        let message = match &self {
            Error::Database(_) | Error::Migration(_) => {
                "Governance could not answer, so no".to_string()
            }
            Error::Mail(_) => "the email could not be sent: try again later".to_string(),
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
        .route("/health/alive", get(|| async { noi_log::health::alive() }))
        .route("/health/ready", get(ready))
        .route("/api/me", get(me))
        .route("/api/link/start", post(link_start))
        .route("/api/link/finish", post(link_finish))
        .route("/api/sign-in/start", post(sign_in_start))
        .route("/api/sign-in/finish", post(sign_in_finish))
        .route("/api/sign-out", post(sign_out))
        .route("/api/sign-up/start", post(sign_up_start))
        .route("/api/lost/start", post(lost_start))
        .route("/api/touch/start", post(touch_start))
        .route("/api/touch/finish", post(touch_finish))
        .route("/api/may", post(may))
        .route("/api/may/preview", post(may_preview))
        .route("/api/profile", get(profile))
        .route("/api/account/touch/start", post(own_touch_start))
        .route("/api/account/passkeys/start", post(passkey_add_start))
        .route("/api/account/passkeys/finish", post(passkey_add_finish))
        .route("/api/account/passkeys/remove", post(remove_passkey))
        .route("/api/account/sign-ins/end", post(end_sign_ins))
        .route("/api/account/email/start", post(email_change_start))
        .route("/api/account/email/finish", post(email_change_finish))
        .route(
            "/api/profile/sign-out-everywhere",
            post(sign_out_everywhere),
        )
        .route("/api/accounts", get(accounts))
        .route("/api/accounts/{handle}", get(account))
        .route("/api/roles", get(roles))
        .route("/api/dashboard", get(dashboard))
        .route("/api/people/{handle}", get(person))
        .route("/api/record", get(record_page))
        .route("/api/problems", get(problems))
        .route("/api/who", post(who))
        .route("/api/run-tokens", post(run_token))
        .route("/api/grants", post(grant))
        .route("/api/grants/end", post(end_grant))
        .route("/api/invitations", post(invite))
        .route("/api/agents", post(add_agent))
        .route("/api/sessions/end", post(end_sessions))
        .route("/api/roles-and-rules", get(roles_and_rules))
        .route("/api/roles-and-rules/versions", get(versions))
        .route("/api/proposals", get(proposals).post(propose))
        .route("/api/proposals/decide", post(decide_proposal))
        .route("/api/proposals/{id}", get(proposal))
        .route("/api/cedar/read", post(cedar_read))
        .route("/api/cedar/write", post(cedar_write))
        .layer(middleware::from_fn_with_state(
            (gov.clone(), Tries::new()),
            limit_starts,
        ))
        .layer(middleware::from_fn_with_state(
            (gov.clone(), Tries::new()),
            limit_failed_sign_ins,
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
    failed: Window,
    noted: Window,
}
impl Tries {
    fn new() -> Self {
        Self {
            starts: Window::new(STARTS_PER_MINUTE, Duration::from_secs(60)),
            failed: Window::new(
                FAILED_SIGN_INS,
                Duration::from_secs(WAIT_MINUTES as u64 * 60),
            ),
            noted: Window::new(1, Duration::from_secs(60)),
        }
    }
}

/// Failed sign-ins slow down whoever is trying, not the person they aim at (agreed 9 Nov, finding
/// 1): after FAILED_SIGN_INS failed answers from one address in WAIT_MINUTES, that address waits
/// before signing in again. A passkey can't be guessed, so this only keeps a flood off; it never
/// stops the person themselves. Until the hosting service names visitors (NOI_VISITOR_HEADER),
/// every visitor is the app's own server here, and they wait together.
async fn limit_failed_sign_ins(
    State((gov, tries)): State<(Governance, Tries)>,
    req: Request,
    next: Next,
) -> Response {
    let path = req.uri().path();
    if path != "/api/sign-in/start" && path != "/api/sign-in/finish" {
        return next.run(req).await;
    }
    let finish = path == "/api/sign-in/finish";
    let key = format!("failed-sign-in:{}", visitor(&req));
    if let Some(wait) = tries.failed.waits(&key) {
        let minutes = wait.as_secs().div_ceil(60).max(1);
        let why = format!(
            "{FAILED_SIGN_INS} sign-ins failed from here in {WAIT_MINUTES} minutes: wait {minutes} minute{}, then try again",
            if minutes == 1 { "" } else { "s" }
        );
        if tries.noted.allow(&key).is_ok() {
            gov.note_limit(None, &why, json!({})).await;
        }
        return Error::TooMany(why).into_response();
    }
    let response = next.run(req).await;
    if finish && !response.status().is_success() {
        let _ = tries.failed.allow(&key);
    }
    response
}

/// Which count a start belongs to, if it is one: its key, and what the key stands for.
fn start_key(req: &Request) -> Option<(String, &'static str)> {
    match req.uri().path() {
        "/api/sign-in/start"
        | "/api/link/start"
        | "/api/sign-up/start"
        | "/api/lost/start"
        | "/api/account/email/finish" => Some((format!("address:{}", visitor(req)), "address")),
        "/api/touch/start" | "/api/account/touch/start" | "/api/account/passkeys/start" => {
            cookie_session(req.headers()).map(|token| {
                (
                    format!("sign-in:{}", hex(&super::digest(&token)[..8])),
                    "sign-in",
                )
            })
        }
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

/// Who is visiting: the address the one app's server names for its visitor (it asks for them, so
/// its own address says nothing about who asks), else the connection's. Governance answers only on
/// this machine, so only this machine's processes can name one.
fn visitor(req: &Request) -> String {
    visitor_of(req.headers()).unwrap_or_else(|| {
        req.extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|c| c.0.ip().to_string())
            .unwrap_or_else(|| "unknown".into())
    })
}
fn visitor_of(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-noi-visitor")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.trim().chars().take(64).collect::<String>())
        .filter(|v| !v.is_empty())
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
/// The cookie lasts as long as a session can (agreed 9 Nov: a session runs on while it is used);
/// Governance ends the session itself after SESSION_HOURS unused.
fn set_session(token: &str) -> HeaderValue {
    HeaderValue::from_str(&format!(
        "{SESSION_COOKIE}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={}",
        SESSION_DAYS * 24 * 3600
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
struct SignUpStart {
    email: String,
    handle: String,
    display_name: String,
}
/// A sign-up (agreed 8 Nov): the same answer whether or not the email has an account.
async fn sign_up_start(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<SignUpStart>,
) -> Result<Json<Value>> {
    // The visitor the app names, for the hourly limit on sign-ups from one address.
    let address = visitor_of(&headers);
    let said = gov
        .sign_up_start(&b.email, &b.handle, &b.display_name, address.as_deref())
        .await?;
    Ok(Json(json!({ "ok": true, "said": said })))
}
#[derive(Deserialize)]
struct LostStart {
    email: String,
}
/// A lost passkey: the same answer whether or not the email has an account.
async fn lost_start(
    State(gov): State<Governance>,
    Json(b): Json<LostStart>,
) -> Result<Json<Value>> {
    let said = gov.lost_passkey_start(&b.email).await?;
    Ok(Json(json!({ "ok": true, "said": said })))
}

/// Signing in (agreed 9 Nov): with no handle, the browser offers this site's passkeys; with one,
/// only that person's.
#[derive(Deserialize)]
struct SignInStart {
    #[serde(default)]
    handle: Option<String>,
}
async fn sign_in_start(
    State(gov): State<Governance>,
    Json(b): Json<SignInStart>,
) -> Result<impl IntoResponse> {
    Ok(Json(match b.handle.as_deref().map(str::trim) {
        Some(handle) if !handle.is_empty() => gov.sign_in_start(handle).await?,
        _ => gov.sign_in_any_start().await?,
    }))
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

/// Your account (agreed 9 Nov): a touch for one change to it, then the change with that touch.
async fn own_touch_start(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(change): Json<Change>,
) -> Result<impl IntoResponse> {
    Ok(Json(
        gov.own_touch_start(&session(&headers)?, change).await?,
    ))
}
#[derive(Deserialize)]
struct Touched {
    touch: Uuid,
}
async fn passkey_add_start(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<Touched>,
) -> Result<impl IntoResponse> {
    Ok(Json(
        gov.passkey_add_start(&session(&headers)?, b.touch).await?,
    ))
}
async fn passkey_add_finish(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<LinkFinish>,
) -> Result<Json<Value>> {
    let passkey = gov
        .passkey_add_finish(
            &session(&headers)?,
            b.ceremony,
            &b.credential,
            &b.name,
            device(&headers).as_deref(),
        )
        .await?;
    Ok(Json(json!({ "passkey": passkey })))
}
#[derive(Deserialize)]
struct RemovePasskey {
    touch: Uuid,
    passkey: Uuid,
}
async fn remove_passkey(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<RemovePasskey>,
) -> Result<Json<Value>> {
    let ended = gov
        .remove_passkey(&session(&headers)?, b.touch, b.passkey)
        .await?;
    Ok(Json(json!({ "sign_ins_ended": ended })))
}
#[derive(Deserialize)]
struct EndSignIns {
    touch: Uuid,
    /// One sign-in; without it, every one but this.
    #[serde(default)]
    session: Option<Uuid>,
}
async fn end_sign_ins(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<EndSignIns>,
) -> Result<Json<Value>> {
    let ended = gov
        .end_sign_ins(&session(&headers)?, b.touch, b.session)
        .await?;
    Ok(Json(json!({ "ended": ended })))
}
#[derive(Deserialize)]
struct EmailStart {
    touch: Uuid,
    email: String,
}
async fn email_change_start(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<EmailStart>,
) -> Result<Json<Value>> {
    let said = gov
        .email_change_start(&session(&headers)?, b.touch, &b.email)
        .await?;
    Ok(Json(json!({ "ok": true, "said": said })))
}
/// The link sent to a new email: no sign-in needed, as the link proves the address.
async fn email_change_finish(
    State(gov): State<Governance>,
    Json(b): Json<LinkStart>,
) -> Result<Json<Value>> {
    gov.email_change_finish(&b.token).await?;
    Ok(Json(json!({ "ok": true })))
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
/// Governance's home, for whoever is looking: signed out gets nothing asked of it.
async fn dashboard(State(gov): State<Governance>, headers: HeaderMap) -> Result<Json<Value>> {
    Ok(Json(gov.dashboard(&viewer(&headers)).await?))
}
/// Someone's public profile, by handle: open to everyone, signed in or not.
async fn person(State(gov): State<Governance>, Path(handle): Path<String>) -> Result<Json<Value>> {
    Ok(Json(gov.public_profile(&handle).await?))
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
    /// What else the touch is for (step 7), as the system that will ask says it.
    #[serde(default)]
    about: Option<Value>,
}
/// Governance can decide when its database answers and it holds roles and rules.
async fn ready(State(gov): State<Governance>) -> Response {
    let (database, held) = gov.readiness().await;
    noi_log::health::ready(&[("database", database), ("roles and rules", held)])
}

async fn touch_start(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<TouchStart>,
) -> Result<impl IntoResponse> {
    Ok(Json(
        gov.touch_start_about(&session(&headers)?, &b.action, &b.targets, b.about.as_ref())
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

/// "What may they do here?" (step 6): a system names the credential it was given, else the
/// browser's cookie, else signed out. Answers only yes or no for each; nothing is recorded.
#[derive(Deserialize)]
struct Preview {
    #[serde(default)]
    credential: Option<Credential>,
    questions: Vec<Question>,
}
#[derive(Deserialize)]
struct Question {
    action: String,
    targets: Vec<Target>,
}
async fn may_preview(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<Preview>,
) -> Result<Json<Value>> {
    let credential = b.credential.unwrap_or_else(|| viewer(&headers));
    let questions: Vec<(String, Vec<Target>)> = b
        .questions
        .into_iter()
        .map(|q| (q.action, q.targets))
        .collect();
    let answers = gov.may_preview(&credential, &questions).await?;
    Ok(Json(json!({ "answers": answers })))
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
    /// What else the touch named (step 7): it must be the same.
    #[serde(default)]
    about: Option<Value>,
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
    let answer = gov
        .may_about(
            &credential,
            &b.action,
            &b.targets,
            b.touch,
            b.about.as_ref(),
        )
        .await?;
    if let Some(handle) = &answer.handle {
        noi_log::who(handle);
    }
    // Only what is safe to show: what, how many places, the answer and why; never the credential.
    if answer.allowed {
        tracing::info!(action = %b.action, places = b.targets.len(), touch = b.touch.is_some(), record = ?answer.record, "may: allowed");
    } else {
        tracing::info!(action = %b.action, places = b.targets.len(), touch = b.touch.is_some(), record = ?answer.record, why = %answer.reason, "may: refused");
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
    email: String,
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
            &b.email,
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
// ——— Roles and rules, kept by Governance (step 3, agreed 9 Nov: "Where Roles and Rules Live") ———

/// Who is asking: a system names the credential it was given (an agent's run token); a browser's
/// cookie is used otherwise; with neither, the asker is signed out.
fn asker_of(given: Option<Credential>, headers: &HeaderMap) -> Credential {
    given.unwrap_or_else(|| viewer(headers))
}

/// Every role and rule in force, for whoever may read them.
async fn roles_and_rules(State(gov): State<Governance>, headers: HeaderMap) -> Result<Json<Value>> {
    Ok(Json(gov.roles_and_rules(&viewer(&headers)).await?))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct VersionsQuery {
    path: String,
}
/// Every version of one role or rule, newest first.
async fn versions(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Query(q): Query<VersionsQuery>,
) -> Result<Json<Value>> {
    Ok(Json(
        json!({ "versions": gov.versions(&viewer(&headers), &q.path).await? }),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProposalsQuery {
    #[serde(default)]
    all: bool,
}
/// What waits (or every proposal), for Review.
async fn proposals(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Query(q): Query<ProposalsQuery>,
) -> Result<Json<Value>> {
    Ok(Json(
        json!({ "proposals": gov.proposals(&viewer(&headers), q.all).await? }),
    ))
}
async fn proposal(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    Ok(Json(json!(gov.proposal(&viewer(&headers), id).await?)))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Propose {
    #[serde(default)]
    credential: Option<Credential>,
    /// The touch for writing Cedar by hand, when the Cedar is.
    #[serde(default)]
    touch: Option<Uuid>,
    proposal: Draft,
}
/// A proposed change to roles and rules, waiting for an owner.
async fn propose(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<Propose>,
) -> Result<Json<Value>> {
    let credential = asker_of(b.credential, &headers);
    Ok(Json(json!(
        gov.propose(&credential, b.touch, &b.proposal).await?
    )))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DecideBody {
    #[serde(default)]
    credential: Option<Credential>,
    #[serde(default)]
    touch: Option<Uuid>,
    proposal: Uuid,
    decision: Decide,
    #[serde(default)]
    note: String,
}
/// Approve, send back or reject a proposal, with the touch made for exactly that.
async fn decide_proposal(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<DecideBody>,
) -> Result<Json<Value>> {
    let credential = asker_of(b.credential, &headers);
    Ok(Json(
        gov.decide_proposal(&credential, b.touch, b.proposal, b.decision, &b.note)
            .await?,
    ))
}

/// Roles and rules as a form (agreed 8 Nov): pages never parse or write Cedar themselves. For
/// people signed in only; it touches no data, only the text sent. Mero answered this before roles
/// and rules moved to Governance.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CedarRead {
    items: Vec<form::Text>,
}
async fn cedar_read(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<CedarRead>,
) -> Result<Json<Value>> {
    gov.me(&Credential::Session(session(&headers)?)).await?;
    if b.items.len() > form::ITEMS {
        return Err(Error::Invalid("too many roles and rules at once".into()));
    }
    Ok(Json(form::readings(&b.items)))
}
/// The Cedar a form says, checked as Governance will check it when it is proposed.
async fn cedar_write(
    State(gov): State<Governance>,
    headers: HeaderMap,
    Json(b): Json<form::Form>,
) -> Result<Json<Value>> {
    gov.me(&Credential::Session(session(&headers)?)).await?;
    let cedar = form::written(&b).map_err(Error::Invalid)?;
    Ok(Json(json!({ "cedar": cedar })))
}
