//! Mero's check (part B, decision 2, agreed 18 Nov 2026): a commit may land only when its Eidos
//! meron files are exactly what you approved. The code matching those files, and Eidos's written
//! files matching them, are CI's own checks (`eio-components.mjs --check`, `noi-eio`'s `written`
//! test); so this one question settles that what lands is what you approved.
use noi_inv::{Meron, MeronState};
use serde_json::Value;
use std::collections::HashSet;

/// Where a commit keeps the merons this check covers.
pub const COMPONENTS: &str = "noi/data/eio/components";
pub const RULE: &str = "noi/data/eio/component-invariant.json";
const UNDER: &str = "noi.eio.components.";

/// Approved and in force: active, or deprecated (still in force until it retires).
fn approved(m: &Meron) -> bool {
    matches!(
        m.lifecycle.state,
        MeronState::Active | MeronState::Deprecated
    )
}

/// What differs between a commit's meron files and what Mero holds: nothing when they agree.
pub fn problems(held: &[Meron], branch: &[Value]) -> Vec<String> {
    let mut out = vec![];
    let mut seen = HashSet::new();
    for b in branch {
        let path = b["path"].as_str().unwrap_or_default();
        seen.insert(path.to_string());
        match held.iter().find(|m| m.identity.path == path) {
            None => out.push(format!(
                "{path}: not in Mero. Propose it, and approve it in Review"
            )),
            Some(m) if !approved(m) => out.push(format!(
                "{path}: {} in Mero, not approved",
                format!("{:?}", m.lifecycle.state).to_lowercase()
            )),
            Some(m) => {
                let same = m.spec == b["spec"]
                    && serde_json::to_value(&m.semantics).ok().as_ref() == Some(&b["semantics"])
                    && b["name"].as_str() == Some(m.identity.name.as_str());
                if !same {
                    out.push(format!(
                        "{path}: not what you approved in Mero. Propose the change, and approve it in Review"
                    ));
                }
            }
        }
    }
    for m in held {
        let path = &m.identity.path;
        if path.starts_with(UNDER) && approved(m) && !seen.contains(path) {
            out.push(format!(
                "{path}: approved in Mero, but this commit has no meron for it"
            ));
        }
    }
    out
}

/// The words GitHub shows beside the check: at most 140 letters.
pub fn words(problems: &[String], merons: usize) -> String {
    let w = match problems {
        [] => format!("As you approved in Mero: {merons} merons"),
        [one] => one.clone(),
        [first, rest @ ..] => format!("{first} (and {} more)", rest.len()),
    };
    if w.chars().count() <= 140 {
        w
    } else {
        format!("{}…", w.chars().take(139).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn meron(path: &str, state: &str, spec: Value) -> Meron {
        serde_json::from_value(json!({
            "identity": {"uid": "00000000-0000-0000-0000-000000000001", "path": path, "name": "Chip"},
            "classification": {"type": "component"},
            "semantics": {"definition": "A chip.", "responsibility": "Be the chip."},
            "lifecycle": {"state": state, "release_mode": "inherited"},
            "authority_scope": "00000000-0000-0000-0000-000000000002",
            "metadata": {},
            "spec": spec,
            "revision": 3,
            "created_at": "2026-11-18T00:00:00Z",
            "updated_at": "2026-11-18T00:00:00Z"
        }))
        .unwrap()
    }
    fn file(path: &str, spec: Value) -> Value {
        json!({"path": path, "name": "Chip", "semantics": {"definition": "A chip.", "responsibility": "Be the chip."}, "spec": spec})
    }
    const CHIP: &str = "noi.eio.components.chip";

    #[test]
    fn a_commit_agrees_with_mero_or_says_why_not() {
        let held = [meron(CHIP, "active", json!({"job": "Lead", "files": []}))];
        // The same, in another key order: agreed.
        assert!(problems(&held, &[file(CHIP, json!({"files": [], "job": "Lead"}))]).is_empty());
        // Changed and never approved.
        let p = problems(
            &held,
            &[file(CHIP, json!({"job": "Lead elsewhere", "files": []}))],
        );
        assert_eq!(p, [format!("{CHIP}: not what you approved in Mero. Propose the change, and approve it in Review")]);
        // New, and not in Mero.
        let both = [
            file(CHIP, json!({"job": "Lead", "files": []})),
            file("noi.eio.components.toast", json!({})),
        ];
        assert_eq!(
            problems(&held, &both),
            ["noi.eio.components.toast: not in Mero. Propose it, and approve it in Review"]
        );
        // Taken away from the commit, still approved in Mero.
        assert_eq!(
            problems(&held, &[]),
            [format!(
                "{CHIP}: approved in Mero, but this commit has no meron for it"
            )]
        );
        // Proposed but not approved yet.
        let proposed = [meron(CHIP, "proposed", json!({"job": "Lead", "files": []}))];
        assert_eq!(
            problems(
                &proposed,
                &[file(CHIP, json!({"job": "Lead", "files": []}))]
            ),
            [format!("{CHIP}: proposed in Mero, not approved")]
        );
        // Deprecated is still in force.
        let old = [meron(
            CHIP,
            "deprecated",
            json!({"job": "Lead", "files": []}),
        )];
        assert!(problems(&old, &[file(CHIP, json!({"job": "Lead", "files": []}))]).is_empty());
    }

    #[test]
    fn githubs_words_are_short() {
        assert_eq!(words(&[], 35), "As you approved in Mero: 35 merons");
        let many: Vec<String> = (0..3)
            .map(|i| format!("noi.eio.components.c{i}: not in Mero"))
            .collect();
        assert_eq!(
            words(&many, 35),
            "noi.eio.components.c0: not in Mero (and 2 more)"
        );
        let long = vec!["x".repeat(300)];
        assert_eq!(words(&long, 1).chars().count(), 140);
    }
}
