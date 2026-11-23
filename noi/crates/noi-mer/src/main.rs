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
    answer, Action, Actor, Answer, AuthorizationRequest, Authorizer, Credential, Decision,
    GovernanceClient,
};
use noi_inv::{MeronState, NewMeron, Snapshot};
use noi_mer::{Change, Error as MeroError, NewBatch, Registry};
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
    /// With `gov` (step 3), every role and rule under noi.gov with every revision, for `noi gov
    /// move-in`; with `gov-retire`, the batch that retires them here once they have moved, which an
    /// agent proposes with `noi propose` and an owner approves in Review.
    Export {
        #[arg(value_parser = ["eio", "gov", "gov-retire"])]
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
        /// Name the branch checked out here and its commit, which must be on GitHub (part B): the
        /// approval then waits for that commit to land. A change to a component needs it.
        #[arg(long)]
        here: bool,
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
    /// An agent takes back its own batch while nothing in it is decided: every change still waiting
    /// or sent back is withdrawn, with the note, and stays on record. Only the batch's proposer may.
    Withdraw {
        batch: Uuid,
        /// Why it is taken back.
        #[arg(long)]
        note: String,
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
    /// Lands what waited for its code (part B, decision 4): every approved batch whose files GitHub's
    /// main now carries, however they got there, is applied under the approval it was given; another
    /// batch waiting with a change to the same meron goes back to its proposer. `pnpm land` runs it.
    Landed,
    /// Mero's API for the Explorer and Governance. Loopback only. Each request carries its own
    /// credential, and Mero asks Governance about it.
    Serve {
        #[arg(long, default_value = "127.0.0.1:8787")]
        bind: SocketAddr,
        /// Mero's name on GitHub, to post "Mero approved" right after an approval that waits to land.
        #[command(flatten)]
        github: GitHubArgs,
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

/// The branch checked out here and its commit, which must be on GitHub, where Mero looks at it.
fn pushed_head() -> Result<(String, String), Box<dyn std::error::Error>> {
    let branch = git(&["branch", "--show-current"])?;
    if branch.is_empty() || branch == "main" {
        return Err("check out the change's own branch: a proposal names it".into());
    }
    let commit = git(&["rev-parse", "HEAD"])?;
    git(&["fetch", "-q", "origin", &branch])
        .map_err(|_| format!("{branch} is not on GitHub: push it first"))?;
    if git(&["rev-parse", &format!("origin/{branch}")])? != commit {
        return Err(format!("{branch} here and on GitHub differ: push it first").into());
    }
    Ok((branch, commit))
}

/// Mero's check on a commit's meron files (decision 2): what Mero holds, with each batch approved
/// and waiting for its code that these files carry whole. Read from the files, never from the
/// commit's id (decision 4, changed 18 Nov), so a squash or a rebase keeps what you approved.
async fn check_files(
    registry: &Registry,
    reader: &Registry,
    operator: &Actor,
    files: &[Value],
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let held = reader.snapshot(operator).await?.merons;
    let waiting = registry.waiting_to_land().await?;
    Ok(noi_mer::approved::check(&held, files, &waiting))
}

/// Lands what main carries (decision 4, changed 18 Nov: by the files): each batch approved and
/// waiting whose files main has, as the batch left them, however they got there. Main's commits that
/// changed these files since the first such approval are looked at one by one, oldest first, so a
/// batch lands even when a later commit changed its merons again before this ran.
async fn land_what_main_carries(
    registry: &Registry,
    operator: &Actor,
) -> Result<Value, Box<dyn std::error::Error>> {
    git(&["fetch", "-q", "origin", "main"])?;
    let reader = registry.clone().with_authorizer(Arc::new(Operator));
    let (mut landed, mut sent_back, mut failed) = (vec![], vec![], serde_json::Map::new());
    let mut waiting = registry.waiting_to_land().await?;
    let Some(since) = noi_mer::approved::look_since(&waiting) else {
        return Ok(json!({"landed": landed, "sent_back": sent_back, "failed": failed}));
    };
    // The paths are the repository's, so git is asked from its top folder: `pnpm land` runs this
    // from `noi/`, where the same paths name nothing, and every batch was silently left waiting.
    let top = git(&["rev-parse", "--show-toplevel"])?;
    let commits = git(&[
        "-C",
        &top,
        "log",
        "--first-parent",
        "--reverse",
        "--format=%H %cI",
        &format!("--since={}", since.to_rfc3339()),
        "origin/main",
        "--",
        noi_mer::approved::COMPONENTS,
        noi_mer::approved::RULE,
    ])?;
    for line in commits.lines() {
        let Some((commit, made)) = line.split_once(' ') else {
            continue;
        };
        let made = chrono::DateTime::parse_from_rfc3339(made)?.with_timezone(&chrono::Utc);
        let files = merons_at(commit)?;
        loop {
            let held = reader.snapshot(operator).await?.merons;
            let open: Vec<_> = waiting
                .iter()
                .filter(|w| !failed.contains_key(&w.batch.to_string()))
                .cloned()
                .collect();
            let Some(batch) = noi_mer::approved::lands_first(&held, &files, &open, made) else {
                break;
            };
            match registry.land(operator, batch).await {
                Ok(l) => {
                    landed.push(
                        json!({"batch": batch, "on_main": commit, "changes": l.proposals.len()}),
                    );
                    sent_back.extend(l.sent_back);
                }
                Err(e) => {
                    failed.insert(
                        batch.to_string(),
                        json!({"on_main": commit, "error": e.to_string()}),
                    );
                }
            }
            waiting = registry.waiting_to_land().await?;
        }
        if waiting.is_empty() {
            break;
        }
    }
    Ok(json!({"landed": landed, "sent_back": sent_back, "failed": failed}))
}

/// The head of a batch's branch on GitHub, where its pull request is now: GitHub may have rebased
/// it since it was proposed. Its proposed commit when the branch is gone.
fn branch_head(branch: Option<&str>, commit: &str) -> String {
    branch
        .filter(|b| git(&["fetch", "-q", "origin", b]).is_ok())
        .and_then(|b| git(&["rev-parse", &format!("origin/{b}")]).ok())
        .unwrap_or_else(|| commit.to_string())
}

/// Mero looks at a commit and posts its answer on GitHub as "Mero approved" (decision 3).
async fn look_and_post(
    registry: &Registry,
    github: &GitHubArgs,
    commit: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let _ = git(&["fetch", "-q", "origin"]);
    let branch = merons_at(commit)?;
    let operator = Actor {
        subject: OPERATOR.into(),
    };
    let reader = registry.clone().with_authorizer(Arc::new(Operator));
    let problems = check_files(registry, &reader, &operator, &branch).await?;
    let words = noi_mer::approved::words(&problems, branch.len());
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
    .post(commit, verdict, &words)
    .await?;
    Ok(problems.is_empty())
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
            if let Some(gov) = target.as_deref().filter(|t| t.starts_with("gov")) {
                let value = if gov == "gov" {
                    serde_json::to_value(reader().roles_and_rules_to_move(&operator).await?)?
                } else {
                    let on = chrono::Utc::now().format("%-d %b %Y").to_string();
                    // The whole registry, so an invariant that still covers a rule elsewhere stays.
                    let held = reader().snapshot(&operator).await?;
                    serde_json::to_value(noi_mer::retire_moved(&held.merons, &on))?
                };
                match output {
                    Some(file) => std::fs::write(file, serde_json::to_vec_pretty(&value)?)?,
                    None => print(value)?,
                }
                return Ok(());
            }
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
            let problems = check_files(&registry, &reader(), &operator, &branch).await?;
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
        Command::Landed => print(land_what_main_carries(&registry, &operator).await?)?,
        Command::Propose {
            files,
            title,
            note,
            here,
            run,
        } => {
            let mut batch = read_batch(&files, title, note)?;
            if here {
                let (branch, commit) = pushed_head()?;
                batch.branch = Some(branch);
                batch.commit = Some(commit);
            }
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
        Command::Withdraw { batch, note, run } => {
            let (agent, registry) = as_agent(&registry, &governance, &run).await?;
            print(registry.withdraw(&agent, batch, &note).await?)?
        }
        Command::Serve { bind, github } => {
            // On this Mac, loopback only. Inside a container (its image sets NOI_IN_CONTAINER=1) the
            // container's own network is private, and only the ports its host publishes reach it.
            if !bind.ip().is_loopback() && !noi_log::in_container() {
                return Err("Mero binds to loopback on this Mac".into());
            }
            noi_log::init();
            if let Err(e) = governance.who(&Credential::Visitor).await {
                tracing::warn!("{e}. Until Governance answers, Mero refuses everything");
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
                .route("/api/problems", get(problems_handler))
                .layer(middleware::from_fn(local_only))
                .with_state(Served {
                    registry: registry.clone(),
                    governance,
                    github: Arc::new(github),
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
            return Err("noi propose, revise and withdraw act for an agent: pass --agent, or NOI_RUN_TOKEN from Hyperbase's tool runner".into())
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
    github: Arc<GitHubArgs>,
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
    // decision 5, agreed 18 Nov), and Mero only checks them. An approval that waits for its code to
    // land is followed at once by Mero's look at its branch as GitHub has it now, posted there
    // (decision 3): GitHub may have rebased it since it was proposed.
    let mut looked = vec![];
    if approved
        .iter()
        .any(|p| p.state == noi_mer::ProposalState::Landing)
    {
        let batches: std::collections::BTreeSet<Uuid> = approved.iter().map(|p| p.batch).collect();
        for batch in batches {
            if let Ok(b) = registry.batch(&actor, batch).await {
                if let Some(commit) = b.commit {
                    let commit = branch_head(b.branch.as_deref(), &commit);
                    let answer = match look_and_post(&served.registry, &served.github, &commit)
                        .await
                    {
                        Ok(green) => json!({"commit": commit, "green": green}),
                        Err(e) => {
                            json!({"commit": commit, "error": format!("approved, but Mero could not post its check: {e}")})
                        }
                    };
                    looked.push(answer);
                }
            }
        }
    }
    Json(json!({"approved": approved, "looked": looked})).into_response()
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
        branch: None,
        commit: None,
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
    fn the_retiring_batch_holds_the_roles_and_rules_in_force_and_their_invariants() {
        let meron =
            |path: &str, kind: &str, subtype: Option<&str>, state: &str| -> noi_inv::Meron {
                serde_json::from_value(json!({
                    "identity": {"uid": Uuid::new_v4(), "path": path, "name": path},
                    "classification": {"type": kind, "subtype": subtype},
                    "semantics": {"definition": "d", "responsibility": "r"},
                    "lifecycle": {"state": state, "release_mode": "inherited"},
                    "authority_scope": Uuid::nil(), "metadata": {}, "spec": {}, "revision": 4,
                    "created_at": "2026-11-06T00:00:00Z", "updated_at": "2026-11-06T00:00:00Z",
                }))
                .unwrap()
            };
        let held = [
            meron("noi.gov", "system", None, "active"),
            meron("noi.gov.roles.owner", "rule", Some("role"), "active"),
            meron("noi.gov.roles.observer", "rule", Some("role"), "deprecated"),
            meron("noi.gov.roles.old", "rule", Some("role"), "retired"),
            meron(
                "noi.gov.rules.fresh-touch",
                "rule",
                Some("policy"),
                "active",
            ),
            meron("noi.gov.inv.role", "invariant", None, "active"),
            meron("noi.gov.inv.rule", "invariant", None, "active"),
        ];
        let batch = noi_mer::retire_moved(&held, "21 Nov 2026");
        let retired: Vec<Uuid> = batch.changes.iter().filter_map(|c| c.target()).collect();
        let expected: Vec<Uuid> = [1, 2, 4, 5, 6]
            .iter()
            .map(|&i| held[i].identity.uid)
            .collect();
        assert_eq!(retired, expected);
        let value = serde_json::to_value(&batch).unwrap();
        assert_eq!(value["changes"][0]["operation"], "retire");
        assert_eq!(value["changes"][0]["expected_revision"], 4);
        assert!(value["changes"][0]["reason"]
            .as_str()
            .unwrap()
            .contains("Moved to Governance on 21 Nov 2026"));
        assert!(value["changes"][3]["reason"]
            .as_str()
            .unwrap()
            .contains("with the roles and rules it checked"));
        // What it writes is what `noi propose` reads.
        let back: NewBatch = serde_json::from_value(value).unwrap();
        assert_eq!(back.changes.len(), 5);
        // Nothing left to retire, nothing in it.
        assert!(noi_mer::retire_moved(&held[3..4], "21 Nov 2026")
            .changes
            .is_empty());
        // A rule meron outside noi.gov keeps the rule invariant, which still covers it.
        let mut more = held.to_vec();
        more.push(meron("noi.eio.rules.x", "rule", Some("policy"), "active"));
        let kept = noi_mer::retire_moved(&more, "21 Nov 2026");
        assert_eq!(kept.changes.len(), 4);
        assert!(!kept
            .changes
            .iter()
            .any(|c| c.target() == Some(held[6].identity.uid)));
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
