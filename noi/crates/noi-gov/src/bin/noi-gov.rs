//! Governance's command: run its server, set up the first owner, and the operator's few tools.
//! Also reached as `noi gov …`.
use clap::{Parser, Subcommand};
use noi_gov::server::{http, new_voucher_key, vouch, Config, Governance};
use std::{net::SocketAddr, path::PathBuf};
use url::Url;

#[derive(Parser)]
#[command(name = "noi gov", about = "Governance: who may do what, and where, in every NOI system")]
struct Cli {
    /// Governance's database login (from governance.local.env); the operator's for `migrate`.
    /// Only Governance uses schema gov. Not needed to sign a vouch.
    #[arg(long, env = "NOI_GOV_DATABASE_URL", hide_env_values = true)]
    database_url: Option<String>,
    /// Governance's own address. Passkeys need a name, so use localhost, not 127.0.0.1.
    #[arg(long, env = "NOI_GOV_ORIGIN", default_value = "http://localhost:8788")]
    origin: Url,
    /// Mero's read API, for copying the approved roles and rules.
    #[arg(long, env = "NOI_MERO_URL", default_value = "http://127.0.0.1:8787")]
    mero: Url,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Applies Governance's migrations (administrative).
    Migrate,
    /// Runs Governance's server on loopback. Copies the roles and rules from Mero as it starts.
    Serve {
        #[arg(long, default_value = "127.0.0.1:8788")]
        bind: SocketAddr,
    },
    /// Copies the roles and rules approved in Mero under noi.gov.
    Copy,
    /// Makes the first owner, once, while no owner exists, and prints the link for their first passkey.
    Setup {
        #[arg(long)]
        handle: String,
        #[arg(long)]
        name: String,
    },
    /// Passkeys.
    Passkey {
        #[command(subcommand)]
        command: PasskeyCommand,
    },
    /// Platforms that vouch for agents.
    Voucher {
        #[command(subcommand)]
        command: VoucherCommand,
    },
    /// Signs a vouch for one agent's run with a platform's key, as Hyperbase will (until it exists).
    Vouch {
        #[arg(long)]
        key_file: PathBuf,
        #[arg(long, default_value = "hyperbase:this-mac")]
        voucher: String,
        #[arg(long)]
        agent: String,
        #[arg(long)]
        run: String,
        #[arg(long)]
        started_by: Option<String>,
    },
}

#[derive(Subcommand)]
enum PasskeyCommand {
    /// Prints a one-time, 10-minute link for an account's first passkey. Refused once it has one.
    Add { handle: String },
}

#[derive(Subcommand)]
enum VoucherCommand {
    /// Makes this Mac's Hyperbase key: the private half in an owner-only file, the public half in Governance.
    AddThisMac {
        #[arg(long)]
        key_file: PathBuf,
        #[arg(long, default_value = "hyperbase:this-mac")]
        name: String,
    },
}

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("noi gov: {e}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    if let Command::Vouch { key_file, voucher, agent, run, started_by } = &cli.command {
        let pem = std::fs::read_to_string(key_file)?;
        println!("{}", vouch(&pem, voucher, agent, run, started_by.as_deref())?);
        return Ok(());
    }
    let url = cli.database_url.clone().ok_or("--database-url or NOI_GOV_DATABASE_URL is required")?;
    let gov = Governance::connect(&url, Config { origin: cli.origin.clone(), mero: Some(cli.mero.clone()) }).await?;
    match cli.command {
        Command::Migrate => {
            gov.migrate().await?;
            println!("{{\"migrations\": \"applied\"}}");
        }
        Command::Copy => println!("{}", serde_json::to_string_pretty(&gov.copy_from_mero().await?)?),
        Command::Setup { handle, name } => {
            let setup = gov.setup(&handle, &name).await?;
            println!("{} is the first owner. Open this link in your browser within 10 minutes, then touch to add your passkey:\n{}", handle, setup.link);
        }
        Command::Passkey { command: PasskeyCommand::Add { handle } } => {
            let link = gov.first_passkey_link(&handle).await?;
            println!("Open this link within 10 minutes, then touch:\n{link}");
        }
        Command::Voucher { command: VoucherCommand::AddThisMac { key_file, name } } => {
            if key_file.exists() {
                return Err(format!("{} exists; keep the key you have", key_file.display()).into());
            }
            let (private_pem, public) = new_voucher_key();
            write_owner_only(&key_file, &private_pem)?;
            gov.add_voucher(&name, &public).await?;
            println!("{name} may vouch for agents. Its private key is in {} (owner-only).", key_file.display());
        }
        Command::Serve { bind } => {
            // On this Mac, loopback only. Inside a container (its image sets NOI_IN_CONTAINER=1) the
            // container's own network is private, and only the ports its host publishes reach it.
            if !bind.ip().is_loopback() && !noi_log::in_container() {
                return Err("Governance binds to loopback on this Mac".into());
            }
            noi_log::init();
            match gov.copy_from_mero().await {
                Ok(c) => tracing::info!("copied {} roles and {} rules from Mero", c.roles, c.rules),
                Err(e) => tracing::warn!("{e}"),
            }
            let listener = tokio::net::TcpListener::bind(bind).await?;
            tracing::info!("Governance listening on {} (open {})", bind, cli.origin);
            // One line per request on standard error, with nothing secret in it.
            // At most 1 MB a request and 30 seconds an answer (agreed 8 Nov); the caller's address
            // is kept for the limit on sign-in starts.
            let keep = gov.clone();
            let app = noi_log::limits::around(http::router(gov), 1 << 20, std::time::Duration::from_secs(30));
            // Every failure is also kept in gov.problems, for the Problems page (agreed 8 Nov).
            let report: noi_log::Report = std::sync::Arc::new(move |p: noi_log::Problem| {
                let keep = keep.clone();
                tokio::spawn(async move {
                    if keep.record_problem(&p.request_id, &p.method, &p.path, p.status as i32, &p.what).await.is_err() {
                        tracing::warn!("a problem was not kept: the log line above is all there is");
                    }
                });
            });
            let app = noi_log::around_reporting("governance", app, report);
            axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
                .with_graceful_shutdown(async {
                    let _ = tokio::signal::ctrl_c().await;
                })
                .await?;
        }
        Command::Vouch { .. } => unreachable!(),
    }
    Ok(())
}

fn write_owner_only(path: &std::path::Path, contents: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path)?;
    f.write_all(contents.as_bytes())
}
