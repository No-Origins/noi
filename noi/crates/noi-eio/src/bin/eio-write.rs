//! Mero's writer on a branch (part B, decision 5): makes `tokens.css`, `tokens.ts`, `tokens.json` and
//! `components.ts` from the meron files in `noi/data/eio`, exactly as Mero makes them, into
//! `ui/packages/eio-tokens`. With `--check` it writes nothing and fails if any file there differs.
//!
//!   cargo run -q -p noi-eio --bin eio-write              (or: pnpm eio:write, from the top)
//!   cargo run -q -p noi-eio --bin eio-write -- --check   (or: pnpm eio:write --check)
use std::path::Path;

fn main() {
    let here = Path::new(env!("CARGO_MANIFEST_DIR"));
    let data = here.join("../../data/eio");
    let out = here.join("../../../ui/packages/eio-tokens");
    let check = std::env::args().any(|a| a == "--check");
    let written = match noi_eio::write_from_data(&data) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("✗ the meron files do not make Eidos's files: {e}");
            std::process::exit(1);
        }
    };
    let mut differ = vec![];
    for (name, body) in &written.files {
        let file = out.join(name);
        if check {
            if std::fs::read_to_string(&file).ok().as_deref() != Some(body.as_str()) {
                differ.push(*name);
            }
        } else if let Err(e) = std::fs::write(&file, body) {
            eprintln!("✗ {}: {e}", file.display());
            std::process::exit(1);
        }
    }
    if !differ.is_empty() {
        eprintln!(
            "✗ not what Mero's writer makes from the meron files: {}. Run pnpm eio:write and commit them",
            differ.join(", ")
        );
        std::process::exit(1);
    }
    println!(
        "{} Eidos's four files {}",
        if check { "✓" } else { "wrote" },
        if check {
            "are what Mero's writer makes from the meron files"
        } else {
            "from the meron files"
        }
    );
}
