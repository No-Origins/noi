//! Mero's writer, run on a branch (part B, decision 5, agreed 18 Nov): the four files the apps read,
//! made from the meron files in `noi/data/eio` exactly as Mero makes them from what it holds. The
//! branch carries them; Mero's check makes them again from what you approved and compares.
use crate::{export_component_types, export_tokens, ComponentSource, TokenSource};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// The four files, by their names in `@noi/eio-tokens`.
pub struct Written {
    pub files: Vec<(&'static str, String)>,
}

/// Every meron file under a folder, in a fixed order.
fn meron_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut out = vec![];
    let entries = std::fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_dir() {
            out.extend(meron_files(&path)?);
        } else if path.extension().is_some_and(|x| x == "json") {
            out.push(path);
        }
    }
    out.sort();
    Ok(out)
}

/// Makes the four files from the merons given: the values (tokens), and the components' states.
pub fn write_merons(merons: &[Value]) -> Result<Written, String> {
    let field = |m: &Value, a: &str, b: Option<&str>| -> String {
        let v = &m[a];
        match b {
            Some(b) => v[b].as_str().unwrap_or_default().to_string(),
            None => v.as_str().unwrap_or_default().to_string(),
        }
    };
    let mut tokens: Vec<(String, String, &Value)> = vec![];
    let mut components: Vec<(String, &Value)> = vec![];
    for m in merons {
        let path = field(m, "path", None);
        match field(m, "classification", Some("type")).as_str() {
            "token" => tokens.push((
                path,
                field(m, "classification", Some("subtype")),
                &m["spec"],
            )),
            "component" => components.push((path, &m["spec"])),
            _ => {}
        }
    }
    let sources: Vec<TokenSource> = tokens
        .iter()
        .map(|(path, subtype, spec)| TokenSource {
            path,
            subtype,
            spec,
            deprecated: false,
        })
        .collect();
    let t = export_tokens(&sources)?;
    let parts: Vec<ComponentSource> = components
        .iter()
        .map(|(path, spec)| ComponentSource {
            path,
            spec,
            deprecated: false,
        })
        .collect();
    let types = export_component_types(&parts)?;
    Ok(Written {
        files: vec![
            ("tokens.css", t.css),
            ("tokens.ts", t.ts),
            ("tokens.json", t.json),
            ("components.ts", types),
        ],
    })
}

/// Makes the four files from the meron files under `data` (noi/data/eio on a branch).
pub fn write_from_data(data: &Path) -> Result<Written, String> {
    let mut merons = vec![];
    for file in meron_files(data)? {
        let text =
            std::fs::read_to_string(&file).map_err(|e| format!("{}: {e}", file.display()))?;
        merons.push(serde_json::from_str(&text).map_err(|e| format!("{}: {e}", file.display()))?);
    }
    write_merons(&merons)
}
