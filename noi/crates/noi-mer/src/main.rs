//! The `noi` command: Mero's server, the operator's tools, and `noi propose` for agents.
//! Who you are comes only from signing in (rule 1): Mero asks Governance's server about every
//! request, and no answer means no. Agreed and built 7 Nov (step 3).
use axum::{
    extract::{Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use clap::{Args, Parser, Subcommand};
use noi_gov::{
    answer, form, Action, Actor, Answer, AuthorizationRequest, Authorizer, Credential, Decision,
    GovernanceClient,
};
use noi_inv::{MeronState, NewMeron, Snapshot};
use noi_mer::{Change, Error as MeroError, NewBatch, Proposal, Registry};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

#[derive(Parser)]
#[command(
    name = "noi",
    about = "No Origins · Mero, the registry of merons. Mero asks Governance about every request."
)]
struct Cli {
    /// Mero's own database login (from mero.local.env); the operator's login for `migrate`.
    #[arg(long, env = "DATABASE_URL", hide_env_values = true)]
    database_url: String,
    /// Governance's server, which Mero asks "may they?".
    #[arg(long, env = "NOI_GOV_URL", default_value = "http://127.0.0.1:8788")]
    governance: String,
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand)]
enum Command {
    /// The operator: applies Mero's migrations, with the operator's database login.
    Migrate,
    /// The operator: one meron, read with the database password.
    Get { reference: String },
    /// The operator: every meron, or those matching a query.
    List {
        #[arg(long)]
        query: Option<String>,
    },
    /// The operator: what happened to one meron.
    History { uid: Uuid },
    /// The operator: every batch, newest first, with its proposals, test-run results and notes.
    Review,
    /// The operator: a meron's release in effect.
    EffectiveRelease { uid: Uuid },
    /// The operator: the whole registry as JSON; or, with `eio`, the Eidos token files into --output.
    Export {
        #[arg(value_parser = ["eio"])]
        target: Option<String>,
        #[arg(long)]
        output: Option<PathBuf>,
    },
    /// An agent sends changes for review as one batch. Each file is a new meron, a change
    /// (`{"operation": "update" | "rename" | "deprecate" | "reinstate", ...}`), or a whole batch.
    Propose {
        #[arg(required = true)]
        files: Vec<PathBuf>,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        note: Option<String>,
        #[command(flatten)]
        run: RunArgs,
    },
    /// An agent revises a proposal that was sent back; the batch is test-run again and waits.
    Revise {
        uid: Uuid,
        file: PathBuf,
        #[arg(long)]
        note: Option<String>,
        #[command(flatten)]
        run: RunArgs,
    },
    /// Mero's check on a commit (part B, agreed 18 Nov): are its Eidos meron files exactly what you
    /// approved? With --post, Mero posts the answer on GitHub as the commit status "Mero approved".
    /// Fails (exit 1) when they are not.
    CheckApproved {
        /// The commit: a hash, or anything git reads as one (HEAD, a branch).
        #[arg(long)]
        commit: String,
        /// Post the answer on GitHub, as the App "No Origins Mero".
        #[arg(long)]
        post: bool,
        #[command(flatten)]
        github: GitHubArgs,
    },
    /// Mero's API for the Explorer and Governance. Loopback only. Each request carries its own
    /// credential, and Mero asks Governance about it.
    Serve {
        #[arg(long, default_value = "127.0.0.1:8787")]
        bind: SocketAddr,
    },
}

/// Mero's own name on GitHub (part B, decision 1): the App "No Origins Mero" and its private key,
/// an owner-only file beside Mero's other secrets.
#[derive(Args)]
struct GitHubArgs {
    #[arg(long, env = "NOI_GITHUB_APP", default_value = "5818697")]
    github_app: String,
    #[arg(long, env = "NOI_GITHUB_KEY", default_value = "mero-github.local.pem")]
    github_key: PathBuf,
    #[arg(long, env = "NOI_GITHUB_REPO", default_value = "No-Origins/noi")]
    github_repo: String,
    #[arg(long, env = "NOI_GITHUB_API", default_value = "https://api.github.com")]
    github_api: String,
}

/// git, run at the top of the repository this Mero works in.
fn git(args: &[&str]) -> Result<String, Box<dyn std::error::Error>> {
    let out = std::process::Command::new("git").args(args).output()?;
    if !out.status.success() {
        return Err(format!(
            "git {}: {}",
            args.join(" "),
            String::from_utf8_lossy(&out.stderr).trim()
        )
        .into());
    }
    Ok(String::from_utf8(out.stdout)?.trim().to_string())
}

/// The Eidos meron files this check covers, as a commit has them.
fn merons_at(commit: &str) -> Result<Vec<Value>, Box<dyn std::error::Error>> {
    let top = git(&["rev-parse", "--show-toplevel"])?;
    let files = git(&[
        "-C",
        &top,
        "ls-tree",
        "-r",
        "--name-only",
        commit,
        "--",
        noi_mer::approved::COMPONENTS,
        noi_mer::approved::RULE,
    ])?;
    let mut merons = vec![];
    for file in files.lines().filter(|f| f.ends_with(".json")) {
        let text = git(&["-C", &top, "show", &format!("{commit}:{file}")])?;
        merons.push(serde_json::from_str(&text).map_err(|e| format!("{file}: {e}"))?);
    }
    Ok(merons)
}

/// What an agent's run carries. Until Hyperbase exists, `noi propose` plays its tool runner: it
/// signs a vouch with this Mac's key and trades it for a 15-minute run token. The model never
/// holds either.
#[derive(Args)]
struct RunArgs {
    /// A run token from Hyperbase's tool runner.
    #[arg(long, env = "NOI_RUN_TOKEN", hide_env_values = true)]
    run_token: Option<String>,
    /// The agent this run is for, when noi propose gets the run token itself.
    #[arg(long, conflicts_with = "run_token")]
    agent: Option<String>,
    /// This Mac's Hyperbase key, which vouches for the run (owner-only).
    #[arg(
        long,
        env = "NOI_VOUCH_KEY",
        default_value = "hyperbase-vouch.local.pem"
    )]
    key_file: PathBuf,
    /// Who vouches: this Mac's Hyperbase, until Hyperbase runs elsewhere.
    #[arg(long, default_value = "hyperbase:this-mac")]
    voucher: String,
    /// The person who started this run.
    #[arg(long)]
    started_by: Option<String>,
}

/// The operator holds the database password and can read everything anyway; the commands that
/// read say so, and nothing else. Not an account.
struct Operator;
const OPERATOR: &str = "operator";
impl Authorizer for Operator {
    fn authorize<'a>(&'a self, request: &'a AuthorizationRequest) -> Answer<'a> {
        answer(
            if matches!(request.action, Action::Read | Action::ReadReview)
                && request.actor.subject == OPERATOR
            {
                Decision::Allow {
                    reference: "operator:database-password".into(),
                    policies: vec![],
                }
            } else {
                Decision::Deny {
                reason: "the terminal only reads: agents propose with noi propose, people approve in the Explorer".into(),
            }
            },
        )
    }
}

fn print(value: impl serde::Serialize) -> Result<(), Box<dyn std::error::Error>> {
    println!("{}", serde_json::to_string_pretty(&value)?);
    Ok(())
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // `noi gov …` is Governance's own command, which sits beside this one.
    let mut args = std::env::args_os();
    if args.nth(1).is_some_and(|a| a == "gov") {
        let status = std::process::Command::new(sibling("noi-gov")?)
            .args(args)
            .status()?;
        std::process::exit(status.code().unwrap_or(1));
    }
    let cli = Cli::parse();
    let registry = Registry::connect(&cli.database_url).await?;
    let governance = GovernanceClient::new(&cli.governance);
    let operator = Actor {
        subject: OPERATOR.into(),
    };
    let reader = || registry.clone().with_authorizer(Arc::new(Operator));
    match cli.command {
        Command::Migrate => {
            registry.migrate().await?;
            print(json!({"migrations":"applied"}))?;
        }
        Command::Get { reference } => print(reader().get(&operator, &reference).await?)?,
        Command::List { query } => {
            let mut s = reader().snapshot(&operator).await?;
            if let Some(q) = query {
                let q = q.to_lowercase();
                s.merons.retain(|e| {
                    format!(
                        "{} {} {}",
                        e.identity.path, e.identity.name, e.classification.kind
                    )
                    .to_lowercase()
                    .contains(&q)
                });
            }
            print(s.merons)?;
        }
        Command::History { uid } => print(reader().history(&operator, uid).await?)?,
        Command::Review => print(reader().review(&operator).await?)?,
        Command::EffectiveRelease { uid } => {
            print(reader().effective_release(&operator, uid).await?)?
        }
        Command::Export { target, output } => {
            let snapshot = reader().snapshot(&operator).await?;
            if target.is_some() {
                let dir =
                    output.ok_or("`export eio` needs --output, the @noi/eio-tokens folder")?;
                let exported = export_eio(&snapshot, &dir)?;
                print(json!({"exported": exported, "output": dir}))?;
            } else if let Some(file) = output {
                std::fs::write(file, serde_json::to_vec_pretty(&snapshot)?)?;
            } else {
                print(snapshot)?;
            }
        }
        Command::CheckApproved {
            commit,
            post,
            github,
        } => {
            let sha = git(&["rev-parse", "--verify", &format!("{commit}^{{commit}}")])?;
            let branch = merons_at(&sha)?;
            let held = reader().snapshot(&operator).await?;
            let problems = noi_mer::approved::problems(&held.merons, &branch);
            let words = noi_mer::approved::words(&problems, branch.len());
            if post {
                let key = std::fs::read(&github.github_key)
                    .map_err(|e| format!("the App's key, {}: {e}", github.github_key.display()))?;
                let verdict = if problems.is_empty() {
                    noi_mer::github::Verdict::Green
                } else {
                    noi_mer::github::Verdict::Red
                };
                noi_mer::github::GitHub::new(
                    &github.github_app,
                    &key,
                    &github.github_repo,
                    &github.github_api,
                )?
                .post(&sha, verdict, &words)
                .await?;
            }
            print(
                json!({"commit": sha, "approved": problems.is_empty(), "merons": branch.len(), "problems": problems, "words": words, "posted": post}),
            )?;
            if !problems.is_empty() {
                std::process::exit(1);
            }
        }
        Command::Propose {
            files,
            title,
            note,
            run,
        } => {
            let batch = read_batch(&files, title, note)?;
            let (agent, registry) = as_agent(&registry, &governance, &run).await?;
            print(registry.propose_batch(&agent, batch).await?)?
        }
        Command::Revise {
            uid,
            file,
            note,
            run,
        } => {
            let change = read_change(&file)?;
            let (agent, registry) = as_agent(&registry, &governance, &run).await?;
            print(
                registry
                    .revise(&agent, uid, change, note.as_deref())
                    .await?,
            )?
        }
        Command::Serve { bind } => {
            // On this Mac, loopback only. Inside a container (its image sets NOI_IN_CONTAINER=1) the
            // container's own network is private, and only the ports its host publishes reach it.
            if !bind.ip().is_loopback() && !noi_log::in_container() {
                return Err("Mero binds to loopback on this Mac".into());
            }
            noi_log::init();
            if let Err(e) = governance.who(&Credential::Visitor).await {
                tracing::warn!("{e}. Until Governance answers, Mero refuses everything");
            }
            // How current the roles and rules are, sent with every question (9 Nov, step 7).
            match registry.rules_version().await {
                Ok(v) => governance.rules_now(v),
                Err(e) => tracing::warn!("the roles and rules could not be read: {e}"),
            }
            let app = Router::new()
                .route("/health/alive", get(|| async { noi_log::health::alive() }))
                .route("/health/ready", get(ready_handler))
                .route("/api/registry", get(snapshot_handler))
                .route("/api/review", get(review_handler))
                .route("/api/review/waiting", get(waiting_handler))
                .route("/api/review/places", post(places_handler))
                .route("/api/review/batches", post(propose_handler))
                .route("/api/review/approve", post(approve_handler))
                .route("/api/review/send-back", post(send_back_handler))
                .route("/api/review/reject", post(reject_handler))
                .route(
                    "/api/governance/roles-and-rules",
                    get(roles_and_rules_handler),
                )
                .route("/api/cedar/read", post(cedar_read_handler))
                .route("/api/cedar/write", post(cedar_write_handler))
                .route("/api/problems", get(problems_handler))
                .layer(middleware::from_fn(local_only))
                .with_state(Served {
                    registry: registry.clone(),
                    governance,
                });
            // At most 5 MB a request (a batch of changes) and 30 seconds an answer (agreed 8 Nov).
            let app = noi_log::limits::around(app, 5 << 20, std::time::Duration::from_secs(30));
            // One line per request on standard error, with nothing secret in it; every failure is
            // also kept in mer.problems, for the Problems page (agreed 8 Nov).
            let keep = registry.clone();
            let report: noi_log::Report = Arc::new(move |p: noi_log::Problem| {
                let keep = keep.clone();
                tokio::spawn(async move {
                    if keep
                        .record_problem(&p.request_id, &p.method, &p.path, p.status as i32, &p.what)
                        .await
                        .is_err()
                    {
                        tracing::warn!(
                            "a problem was not kept: the log line above is all there is"
                        );
                    }
                });
            });
            let app = noi_log::around_reporting("mero", app, report);
            let listener = tokio::net::TcpListener::bind(bind).await?;
            tracing::info!(
                "Mero's API on http://{} · it asks Governance at {} about every request",
                listener.local_addr()?,
                cli.governance
            );
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = tokio::signal::ctrl_c().await;
                })
                .await?;
        }
    }
    Ok(())
}

/// A binary that sits beside this one.
fn sibling(name: &str) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let path = std::env::current_exe()?.with_file_name(name);
    if !path.exists() {
        return Err(format!(
            "{}: build it with cargo build -p noi-gov --features server",
            path.display()
        )
        .into());
    }
    Ok(path)
}

/// The agent behind `noi propose`: a run token, from Hyperbase's tool runner or, until it exists,
/// from a vouch this command signs with this Mac's key.
async fn as_agent(
    registry: &Registry,
    governance: &GovernanceClient,
    run: &RunArgs,
) -> Result<(Actor, Registry), Box<dyn std::error::Error>> {
    let token = match (&run.run_token, &run.agent) {
        (Some(token), _) => token.clone(),
        (None, Some(agent)) => {
            let mut sign = std::process::Command::new(sibling("noi-gov")?);
            sign.arg("vouch")
                .arg("--key-file")
                .arg(&run.key_file)
                .args(["--voucher", &run.voucher, "--agent", agent, "--run", &Uuid::new_v4().to_string()]);
            if let Some(person) = &run.started_by {
                sign.args(["--started-by", person]);
            }
            let out = sign.output()?;
            if !out.status.success() {
                return Err(String::from_utf8_lossy(&out.stderr).trim().to_string().into());
            }
            governance.run_token(String::from_utf8(out.stdout)?.trim()).await?
        }
        (None, None) => {
            return Err("noi propose acts for an agent: pass --agent, or NOI_RUN_TOKEN from Hyperbase's tool runner".into())
        }
    };
    let credential = Credential::RunToken(token);
    let who = governance.who(&credential).await?;
    let registry = registry
        .clone()
        .with_authorizer(Arc::new(governance.asking(credential, None)));
    Ok((
        Actor {
            subject: who.handle,
        },
        registry,
    ))
}

/// What Mero's server holds: the registry and Governance's address. No identity of its own.
#[derive(Clone)]
struct Served {
    registry: Registry,
    governance: GovernanceClient,
}

/// The credential a request carries: `Authorization: Session <token>` from the Explorer's server,
/// `Authorization: Run <token>` from a tool runner, or none (signed out). Cookies are not read, so
/// no page on another port can act with yours.
fn credential(headers: &HeaderMap) -> Result<Credential, String> {
    let Some(value) = headers.get(header::AUTHORIZATION) else {
        return Ok(Credential::Visitor);
    };
    let value = value
        .to_str()
        .map_err(|_| "unreadable credential".to_string())?;
    match value.split_once(' ') {
        Some(("Session", token)) if !token.trim().is_empty() => {
            Ok(Credential::Session(token.trim().into()))
        }
        Some(("Run", token)) if !token.trim().is_empty() => {
            Ok(Credential::RunToken(token.trim().into()))
        }
        _ => Err("send Authorization: Session <token> or Run <token>".into()),
    }
}

/// Who is asking, by Governance's word, and the registry that asks Governance for them. Signed
/// out, you can at most read (rule 5), so a change is refused before Mero looks anything up.
async fn caller(
    served: &Served,
    headers: &HeaderMap,
    touch: Option<Uuid>,
    changes: bool,
) -> Result<(Actor, Registry), Box<Response>> {
    let credential =
        credential(headers).map_err(|e| Box::new(refused(StatusCode::UNAUTHORIZED, &e)))?;
    if changes && credential == Credential::Visitor {
        return Err(Box::new(refused(
            StatusCode::UNAUTHORIZED,
            "signed out: sign in at Governance first",
        )));
    }
    // Governance's line for this request carries the same ID as Mero's.
    let governance = served.governance.for_request(
        headers
            .get(noi_log::REQUEST_ID)
            .and_then(|v| v.to_str().ok()),
    );
    let who = governance
        .who(&credential)
        .await
        .map_err(|e| Box::new(refused(StatusCode::UNAUTHORIZED, &e)))?;
    noi_log::who(&who.handle);
    let registry = served
        .registry
        .clone()
        .with_authorizer(Arc::new(governance.asking(credential, touch)));
    Ok((
        Actor {
            subject: who.handle,
        },
        registry,
    ))
}
fn refused(status: StatusCode, error: &str) -> Response {
    (status, Json(json!({ "error": error }))).into_response()
}
fn failure(e: MeroError) -> Response {
    let status = match &e {
        MeroError::Validation(_) => StatusCode::UNPROCESSABLE_ENTITY,
        MeroError::Conflict { .. } => StatusCode::CONFLICT,
        MeroError::NotFound => StatusCode::NOT_FOUND,
        MeroError::Denied(_) | MeroError::ApprovalRequired(_) => StatusCode::FORBIDDEN,
        _ => StatusCode::SERVICE_UNAVAILABLE,
    };
    // A failure inside Mero says only that; its reason, which can be the database's own words,
    // reaches the log and the Problems page, never the asker (architecture review, 9 Nov).
    let said = if status.is_server_error() {
        "Mero could not answer: try again".to_string()
    } else {
        e.to_string()
    };
    let mut response = refused(status, &said);
    if status.is_server_error() {
        response
            .extensions_mut()
            .insert(noi_log::Why(e.to_string()));
    }
    response
}
macro_rules! caller {
    ($served:expr, $headers:expr, $touch:expr, $changes:expr) => {
        match caller(&$served, &$headers, $touch, $changes).await {
            Ok(c) => c,
            Err(response) => return *response,
        }
    };
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProblemsQuery {
    before: Option<i64>,
    limit: Option<i64>,
}
/// Mero's problems, newest first, for those Governance lets view (owners).
async fn problems_handler(
    State(served): State<Served>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<ProblemsQuery>,
) -> Response {
    let (actor, _) = caller!(served, headers, None, true);
    let credential = match credential(&headers) {
        Ok(c) => c,
        Err(e) => return refused(StatusCode::UNAUTHORIZED, &e),
    };
    let governance = served.governance.for_request(
        headers
            .get(noi_log::REQUEST_ID)
            .and_then(|v| v.to_str().ok()),
    );
    if !governance.may_view(&credential).await {
        return refused(
            StatusCode::FORBIDDEN,
            &format!("{} may not view Mero's problems: owners may", actor.subject),
        );
    }
    let limit = q.limit.unwrap_or(50);
    match served.registry.problems(q.before, limit).await {
        Ok(problems) => {
            let next = (problems.len() as i64 == limit.clamp(1, 200))
                .then(|| problems.last().map(|p| p["seq"].clone()))
                .flatten();
            Json(json!({ "problems": problems, "next": next })).into_response()
        }
        Err(e) => failure(e),
    }
}

/// Mero can do its job when its database answers and Governance answers: no answer means no.
async fn ready_handler(State(served): State<Served>) -> Response {
    let (database, governance) = tokio::join!(
        served.registry.database_answers(),
        served.governance.alive()
    );
    noi_log::health::ready(&[("database", database), ("governance", governance)])
}

#[derive(Deserialize)]
struct Under {
    /// One place and everything under it, such as noi.gov; the whole registry without it.
    under: Option<String>,
}
async fn snapshot_handler(
    State(served): State<Served>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<Under>,
) -> Response {
    let (actor, registry) = caller!(served, headers, None, false);
    match registry.snapshot_under(&actor, q.under.as_deref()).await {
        Ok(snapshot) => Json(json!(snapshot)).into_response(),
        Err(e) => failure(e),
    }
}
/// How many proposals wait: Review's badge (9 Nov, step 6).
async fn waiting_handler(State(served): State<Served>, headers: HeaderMap) -> Response {
    let (actor, registry) = caller!(served, headers, None, false);
    match registry.waiting(&actor).await {
        Ok(waiting) => Json(json!({ "waiting": waiting })).into_response(),
        Err(e) => failure(e),
    }
}
async fn review_handler(State(served): State<Served>, headers: HeaderMap) -> Response {
    let (actor, registry) = caller!(served, headers, None, false);
    let signed_in = actor.subject != "visitors";
    match registry.review(&actor).await {
        Ok(batches) => {
            // Which waiting batches they may decide (agreed 9 Nov, step 6): one question to
            // Governance for all of them, as if confirmed with a touch, and not recorded. The page
            // offers Approve, Send back and Reject only there; the real question, with the touch,
            // is asked when they act.
            let open: Vec<usize> = (0..batches.len())
                .filter(|&i| !batches[i].places.is_empty())
                .collect();
            let questions: Vec<(Action, Vec<String>)> = open
                .iter()
                .map(|&i| (Action::Review, batches[i].places.clone()))
                .collect();
            let answers = match credential(&headers) {
                Ok(c) if signed_in => {
                    served
                        .governance
                        .for_request(
                            headers
                                .get(noi_log::REQUEST_ID)
                                .and_then(|v| v.to_str().ok()),
                        )
                        .may_preview(&c, &questions)
                        .await
                }
                _ => vec![false; questions.len()],
            };
            let mut may_decide = vec![false; batches.len()];
            for (k, &i) in open.iter().enumerate() {
                may_decide[i] = answers.get(k).copied().unwrap_or(false);
            }
            Json(json!({
                // Whether they may decide any waiting batch.
                "writable": may_decide.iter().any(|d| *d),
                "reviewer": signed_in.then_some(&actor.subject),
                "touch_to_decide": true,
                "batches": batches.iter().zip(may_decide).map(|(b, d)| {
                    let mut batch = json!(b);
                    batch["may_decide"] = json!(d);
                    batch
                }).collect::<Vec<_>>(),
            }))
            .into_response()
        }
        Err(e) => failure(e),
    }
}
/// What approving these (or every waiting proposal of these batches), or sending back or
/// rejecting one, asks Governance about: the action and places a touch must be for.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PlacesBody {
    proposals: Vec<Uuid>,
    #[serde(default)]
    whole_batches: bool,
    /// approve, send-back or reject: what the touch is for (9 Nov, step 7).
    #[serde(default)]
    decision: Option<String>,
}
async fn places_handler(
    State(served): State<Served>,
    headers: HeaderMap,
    Json(body): Json<PlacesBody>,
) -> Response {
    let (actor, registry) = caller!(served, headers, None, false);
    if let Some(d) = &body.decision {
        if !["approve", "send-back", "reject"].contains(&d.as_str()) {
            return refused(
                StatusCode::UNPROCESSABLE_ENTITY,
                "a decision is approve, send-back or reject",
            );
        }
    }
    match registry
        .review_places_for(
            &actor,
            &body.proposals,
            body.whole_batches,
            body.decision.as_deref(),
        )
        .await
    {
        Ok((places, about)) => Json(json!({
            "action": Action::Review.as_str(),
            "targets": places.into_iter().map(|p| json!({"path": p})).collect::<Vec<_>>(),
            "about": about,
        }))
        .into_response(),
        Err(e) => failure(e),
    }
}
async fn propose_handler(
    State(served): State<Served>,
    headers: HeaderMap,
    Json(batch): Json<NewBatch>,
) -> Response {
    // A touch goes with a batch that writes Cedar by hand (9 Nov, step 7).
    let (actor, registry) = caller!(served, headers, batch.touch, true);
    match registry.propose_batch(&actor, batch).await {
        Ok(batch) => Json(json!(batch)).into_response(),
        Err(e) => failure(e),
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ApproveBody {
    proposals: Vec<Uuid>,
    touch: Option<Uuid>,
}
async fn approve_handler(
    State(served): State<Served>,
    headers: HeaderMap,
    Json(body): Json<ApproveBody>,
) -> Response {
    let (actor, registry) = caller!(served, headers, body.touch, true);
    let approved = match registry.approve(&actor, &body.proposals).await {
        Ok(p) => p,
        Err(e) => return failure(e),
    };
    // Eidos's files are not written here: the branch carries them, made by Mero's writer (part B,
    // decision 5, agreed 18 Nov), and Mero only checks them.
    // An approved role or rule reaches Governance at once: it copies them again from Mero. Should
    // that fail, the next question says how current the rules are, and Governance copies then.
    let copied = if touches(&approved, "noi.gov.") {
        if let Ok(v) = served.registry.rules_version().await {
            served.governance.rules_now(v);
        }
        match served.governance.copy().await {
            Ok(c) => c,
            Err(e) => {
                json!({"error": format!("approved, but Governance has not copied it yet: {e}")})
            }
        }
    } else {
        Value::Null
    };
    Json(json!({"approved": approved, "copied": copied})).into_response()
}
/// Whether an approval changed anything under this place, where it was or where it went.
fn touches(approved: &[Proposal], prefix: &str) -> bool {
    approved.iter().any(|p| {
        ["meron", "before"].iter().any(|k| {
            p.outcome[k]["identity"]["path"]
                .as_str()
                .is_some_and(|path| path.starts_with(prefix))
        })
    })
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DecideBody {
    proposal: Uuid,
    note: String,
    touch: Option<Uuid>,
}
async fn send_back_handler(
    State(served): State<Served>,
    headers: HeaderMap,
    Json(body): Json<DecideBody>,
) -> Response {
    let (actor, registry) = caller!(served, headers, body.touch, true);
    match registry.send_back(&actor, body.proposal, &body.note).await {
        Ok(p) => Json(json!(p)).into_response(),
        Err(e) => failure(e),
    }
}
async fn reject_handler(
    State(served): State<Served>,
    headers: HeaderMap,
    Json(body): Json<DecideBody>,
) -> Response {
    let (actor, registry) = caller!(served, headers, body.touch, true);
    match registry.reject(&actor, body.proposal, &body.note).await {
        Ok(p) => Json(json!(p)).into_response(),
        Err(e) => failure(e),
    }
}
/// What Governance copies: the roles and rules under noi.gov, and nothing else.
async fn roles_and_rules_handler(State(served): State<Served>) -> Response {
    match served.registry.roles_and_rules().await {
        Ok(snapshot) => Json(json!(snapshot)).into_response(),
        Err(e) => failure(e),
    }
}

/// Roles and rules as a form (agreed 8 Nov): the Explorer never parses or writes Cedar itself. Both
/// reads and writes are for signed-in people only; they touch no data, only the text sent.
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum CedarText {
    Rule { cedar: String },
    Role { system: String, cedar: String },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CedarReadBody {
    items: Vec<CedarText>,
}
/// At most this many roles and rules, each at most this long, per request.
const CEDAR_ITEMS: usize = 200;
const CEDAR_LENGTH: usize = 20_000;
/// Each role or rule as the form, or why it is written by hand; and every system's verbs, for
/// the form's checkboxes.
async fn cedar_read_handler(
    State(served): State<Served>,
    headers: HeaderMap,
    Json(body): Json<CedarReadBody>,
) -> Response {
    let _ = caller!(served, headers, None, true);
    if body.items.len() > CEDAR_ITEMS {
        return refused(
            StatusCode::PAYLOAD_TOO_LARGE,
            "too many roles and rules at once",
        );
    }
    Json(cedar_readings(&body.items)).into_response()
}
fn cedar_readings(items: &[CedarText]) -> Value {
    let readings: Vec<Value> = items
        .iter()
        .map(|item| {
            let read = match item {
                CedarText::Rule { cedar } if cedar.len() <= CEDAR_LENGTH => {
                    form::read_rule(cedar).map(|f| json!(f))
                }
                CedarText::Role { system, cedar } if cedar.len() <= CEDAR_LENGTH => {
                    form::read_role(system, cedar).map(|f| json!(f))
                }
                _ => Err("it is too long to read".into()),
            };
            match read {
                Ok(form) => json!({ "form": form }),
                Err(why) => json!({ "by_hand": why }),
            }
        })
        .collect();
    let verbs: serde_json::Map<String, Value> = form::verbs()
        .into_iter()
        .map(|(s, v)| (s.to_string(), json!(v)))
        .collect();
    json!({ "readings": readings, "verbs": verbs })
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
enum CedarForm {
    Rule { form: form::RuleForm },
    Role { form: form::RoleForm },
}
/// The Cedar a form says, checked as Mero will check it when it is proposed.
async fn cedar_write_handler(
    State(served): State<Served>,
    headers: HeaderMap,
    Json(body): Json<CedarForm>,
) -> Response {
    let _ = caller!(served, headers, None, true);
    match cedar_written(&body) {
        Ok(cedar) => Json(json!({ "cedar": cedar })).into_response(),
        Err(e) => refused(StatusCode::UNPROCESSABLE_ENTITY, &e),
    }
}
fn cedar_written(body: &CedarForm) -> Result<String, String> {
    match body {
        CedarForm::Rule { form } => form::write_rule(form),
        CedarForm::Role { form } => form::write_role(form),
    }
}

/// Writes the Eidos token files from the active Eidos merons. Returns how many merons it used.
fn export_eio(snapshot: &Snapshot, dir: &Path) -> Result<usize, Box<dyn std::error::Error>> {
    // Active merons reach apps, and deprecated ones, marked, until they retire (18 Nov): what reads
    // them keeps working while it moves off. Proposals never do.
    let sources: Vec<noi_eio::TokenSource> = snapshot
        .merons
        .iter()
        .filter(|m| {
            matches!(
                m.lifecycle.state,
                MeronState::Active | MeronState::Deprecated
            ) && m.identity.path.starts_with("noi.eio.")
        })
        .map(|m| noi_eio::TokenSource {
            path: &m.identity.path,
            subtype: m.classification.subtype.as_deref().unwrap_or(""),
            spec: &m.spec,
            deprecated: m.lifecycle.state == MeronState::Deprecated,
        })
        .collect();
    let files = noi_eio::export_tokens(&sources)?;
    // Components' states, by key, as types the code must use (agreed 18 Nov, "Component States").
    let components: Vec<noi_eio::ComponentSource> = snapshot
        .merons
        .iter()
        // A deprecated component keeps its types, marked, until it retires (18 Nov): the code that
        // uses it moves off it in its own time, and still builds meanwhile.
        .filter(|m| {
            matches!(
                m.lifecycle.state,
                MeronState::Active | MeronState::Deprecated
            ) && m.classification.kind == noi_inv::MeronType::Component
                && m.identity.path.starts_with("noi.eio.")
        })
        .map(|m| noi_eio::ComponentSource {
            path: &m.identity.path,
            spec: &m.spec,
            deprecated: m.lifecycle.state == MeronState::Deprecated,
        })
        .collect();
    let types = noi_eio::export_component_types(&components);
    // The values reach the apps even when the types cannot be written; the error still says why.
    for (name, body) in [
        ("tokens.css", &files.css),
        ("tokens.ts", &files.ts),
        ("tokens.json", &files.json),
    ] {
        std::fs::write(dir.join(name), body)?;
    }
    std::fs::write(
        dir.join("components.ts"),
        types.map_err(|e| format!("the token files are written, but not components.ts: {e}"))?,
    )?;
    Ok(sources.len())
}

/// A file for `propose`: a whole batch, one change, or a new meron (an add).
fn read_change(file: &Path) -> Result<Change, Box<dyn std::error::Error>> {
    let value: Value = serde_json::from_slice(&std::fs::read(file)?)?;
    Ok(if value.get("operation").is_some() {
        serde_json::from_value(value)?
    } else {
        Change::Add {
            meron: serde_json::from_value::<NewMeron>(value)?,
            container: None,
        }
    })
}
fn read_batch(
    files: &[PathBuf],
    title: Option<String>,
    note: Option<String>,
) -> Result<NewBatch, Box<dyn std::error::Error>> {
    if let [file] = files {
        let value: Value = serde_json::from_slice(&std::fs::read(file)?)?;
        if value.get("changes").is_some() {
            let mut batch: NewBatch = serde_json::from_value(value)?;
            batch.title = title.unwrap_or(batch.title);
            batch.note = note.or(batch.note);
            return Ok(batch);
        }
    }
    let changes = files
        .iter()
        .map(|f| read_change(f))
        .collect::<Result<Vec<_>, _>>()?;
    let title = title.unwrap_or_else(|| match &changes[..] {
        [Change::Add { meron, .. }] => format!("Add {}", meron.name),
        [one] => format!("{} one meron", one.operation()),
        many => format!("{} changes", many.len()),
    });
    Ok(NewBatch {
        title,
        note,
        changes,
        touch: None,
    })
}

async fn local_only(request: Request, next: Next) -> axum::response::Response {
    let host = request
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    let local = host
        .parse::<axum::http::uri::Authority>()
        .ok()
        .is_some_and(|a| matches!(a.host(), "localhost" | "127.0.0.1" | "[::1]"));
    let same_origin = request
        .headers()
        .get(header::ORIGIN)
        .is_none_or(|o| o.to_str().ok() == Some(format!("http://{host}").as_str()));
    if !local || !same_origin {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut response = next.run(request).await;
    response.headers_mut().insert(header::CONTENT_SECURITY_POLICY, "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'".parse().unwrap());
    response
        .headers_mut()
        .insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse().unwrap());
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Result<Cli, clap::Error> {
        let mut all = vec!["noi", "--database-url", "postgresql://unused"];
        all.extend_from_slice(args);
        Cli::try_parse_from(all)
    }

    #[test]
    fn nobody_types_a_name() {
        // The old ways of saying who you are are gone (rule 1).
        for old in [
            &["--actor", "human", "list"][..],
            &["--dev-actor", "dev", "list"],
            &["--governance-policy", "governance.local.json", "list"],
            &["serve", "--review-as", "local-maintainer"],
        ] {
            assert!(parse(old).is_err(), "{old:?}");
        }
        assert!(parse(&["list"]).is_ok());
        assert!(parse(&["serve"]).is_ok());
    }

    #[test]
    fn the_terminal_changes_nothing_but_proposals() {
        for gone in [
            "approve",
            "send-back",
            "reject",
            "update",
            "rename",
            "transition",
            "relate",
            "unrelate",
            "plan-release",
            "transition-release",
            "seed",
        ] {
            assert!(parse(&[gone]).is_err(), "{gone}");
        }
        assert!(parse(&["propose", "change.json", "--agent", "design-agent"]).is_ok());
        assert!(parse(&["propose", "change.json", "--agent", "a", "--run-token", "t"]).is_err());
    }

    #[test]
    fn a_request_names_its_credential_or_is_signed_out() {
        let mut h = HeaderMap::new();
        assert_eq!(credential(&h), Ok(Credential::Visitor));
        h.insert(header::AUTHORIZATION, "Session abc".parse().unwrap());
        assert_eq!(credential(&h), Ok(Credential::Session("abc".into())));
        h.insert(header::AUTHORIZATION, "Run xyz".parse().unwrap());
        assert_eq!(credential(&h), Ok(Credential::RunToken("xyz".into())));
        for bad in ["Bearer abc", "Session ", "abc"] {
            h.insert(header::AUTHORIZATION, bad.parse().unwrap());
            assert!(credential(&h).is_err(), "{bad}");
        }
        // A cookie alone is ignored: another page on this machine cannot act with it.
        let mut c = HeaderMap::new();
        c.insert(header::COOKIE, "noi_session=abc".parse().unwrap());
        assert_eq!(credential(&c), Ok(Credential::Visitor));
    }

    #[test]
    fn cedar_requests_read_and_write_as_the_explorer_sends_them() {
        let fresh = r#"forbid (
  principal,
  action in [Action::"review",
             Action::"governance"],
  resource
) unless { context.fresh_signature || action == Action::"view" };"#;
        let items: Vec<CedarText> = serde_json::from_value(json!([
            {"kind": "rule", "cedar": fresh},
            {"kind": "role", "system": "mero", "cedar": "permit (\n  principal == ?principal,\n  action in Action::\"mero\",\n  resource in ?resource\n);"},
            {"kind": "rule", "cedar": "forbid (principal, action, resource);"},
        ]))
        .unwrap();
        let out = cedar_readings(&items);
        assert_eq!(out["readings"][0]["form"]["unless"], json!(["fresh-touch"]));
        assert_eq!(
            out["readings"][1]["form"],
            json!({"system": "mero", "pick": "every", "except": []})
        );
        assert!(out["readings"][2]["by_hand"]
            .as_str()
            .unwrap()
            .contains("names no actions"));
        assert!(out["verbs"]["governance"]
            .as_array()
            .unwrap()
            .contains(&json!("view")));
        let form = out["readings"][0]["form"].clone();
        let body: CedarForm =
            serde_json::from_value(json!({"kind": "rule", "form": form})).unwrap();
        assert_eq!(cedar_written(&body).unwrap(), fresh);
        let wrong: CedarForm = serde_json::from_value(
            json!({"kind": "role", "form": {"system": "mero", "pick": "these", "verbs": []}}),
        )
        .unwrap();
        assert!(cedar_written(&wrong)
            .unwrap_err()
            .contains("tick at least one"));
        assert!(serde_json::from_value::<CedarForm>(
            json!({"kind": "rule", "form": {}, "extra": 1})
        )
        .is_err());
    }

    #[tokio::test]
    async fn the_operator_only_reads() {
        let request = |action, subject: &str| AuthorizationRequest {
            actor: Actor {
                subject: subject.into(),
            },
            action,
            resources: vec![],
            intent: Value::Null,
        };
        assert!(matches!(
            Operator.authorize(&request(Action::Read, OPERATOR)).await,
            Decision::Allow { .. }
        ));
        assert!(matches!(
            Operator
                .authorize(&request(Action::Propose, OPERATOR))
                .await,
            Decision::Deny { .. }
        ));
        assert!(matches!(
            Operator
                .authorize(&request(Action::Read, "hiddenstack"))
                .await,
            Decision::Deny { .. }
        ));
    }
}
