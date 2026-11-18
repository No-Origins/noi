//! Mero's check (part B, decision 2, agreed 18 Nov 2026): a commit may land only when its Eidos
//! meron files are exactly what you approved. The code matching those files, and Eidos's written
//! files matching them, are CI's own checks (`eio-components.mjs --check`, `noi-eio`'s `written`
//! test); so this one question settles that what lands is what you approved.
//!
//! What you approved is read from the files, never from a commit's id (decision 4, changed 18 Nov,
//! the user: "By the files"): a batch approved and waiting for its code counts for any commit whose
//! files carry it whole, however it got there: a merge, a squash, a rebase.
use chrono::{DateTime, Duration, Utc};
use noi_inv::{Meron, MeronState};
use serde_json::Value;
use std::collections::HashSet;
use uuid::Uuid;

/// Where a commit keeps the merons this check covers.
pub const COMPONENTS: &str = "noi/data/eio/components";
pub const RULE: &str = "noi/data/eio/component-invariant.json";
const UNDER: &str = "noi.eio.components.";
/// The component rule's own meron.
const RULE_PATH: &str = "noi.eio.inv.component";

/// The merons this check covers: the components, and their rule. A change to one comes with its
/// code, so it names its branch and commit, and waits for its files to land.
pub fn covers(path: &str) -> bool {
    path.starts_with(UNDER) || path == RULE_PATH
}

/// Approved and in force: active, or deprecated (still in force until it retires).
fn approved(m: &Meron) -> bool {
    matches!(
        m.lifecycle.state,
        MeronState::Active | MeronState::Deprecated
    )
}

/// A meron and its file say the same: its name, its meaning, its spec (in any key order).
fn agrees(m: &Meron, file: &Value) -> bool {
    m.spec == file["spec"]
        && serde_json::to_value(&m.semantics).ok().as_ref() == Some(&file["semantics"])
        && file["name"].as_str() == Some(m.identity.name.as_str())
}

fn file_at<'a>(files: &'a [Value], path: &str) -> Option<&'a Value> {
    files.iter().find(|f| f["path"].as_str() == Some(path))
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
            Some(m) if !agrees(m, b) => out.push(format!(
                "{path}: not what you approved in Mero. Propose the change, and approve it in Review"
            )),
            Some(_) => {}
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

/// A batch approved and waiting for its code to land (part B, decision 4): when it was approved,
/// and each meron as the batch leaves it.
#[derive(Debug, Clone)]
pub struct Waiting {
    pub batch: Uuid,
    pub approved_at: DateTime<Utc>,
    pub merons: Vec<Meron>,
}

/// How one meron of a waiting batch stands in a commit's files.
struct Stand {
    path: String,
    /// The files have it as the batch leaves it: there and the same, or gone when the batch retires
    /// it; and under its old name no longer, when the batch renames it.
    carried: bool,
    /// And it is a change: Mero holds it otherwise.
    changed: bool,
}

/// Each meron of a batch that this check covers, as a commit's files have it.
fn stands(held: &[Meron], files: &[Value], w: &Waiting) -> Vec<Stand> {
    let mut out = vec![];
    for m in &w.merons {
        let before = held.iter().find(|h| h.identity.uid == m.identity.uid);
        let path = m.identity.path.as_str();
        if !covers(path) && !before.is_some_and(|b| covers(&b.identity.path)) {
            continue;
        }
        let moved_from = before
            .map(|b| b.identity.path.as_str())
            .filter(|old| *old != path);
        let old_gone = moved_from.is_none_or(|old| file_at(files, old).is_none());
        let here = file_at(files, path);
        let carried = old_gone
            && match here {
                Some(f) => approved(m) && agrees(m, f),
                None => !approved(m),
            };
        let unchanged = before.is_some_and(|b| {
            b.identity.path == path && approved(b) && here.is_some_and(|f| agrees(b, f))
        });
        let changed = carried && here.is_some() && !unchanged;
        out.push(Stand {
            path: path.to_string(),
            carried,
            changed,
        });
    }
    out
}

/// A commit's files carry a waiting batch whole: every meron of it this check covers.
pub fn carries(held: &[Meron], files: &[Value], w: &Waiting) -> bool {
    let s = stands(held, files, w);
    !s.is_empty() && s.iter().all(|s| s.carried)
}

/// Mero's check on a commit's files: nothing when they are what you approved. That is what Mero
/// holds, with each batch approved and waiting for its code that the files carry whole, as it leaves
/// them. A batch lands whole: a commit with only part of one is told which part it lacks.
pub fn check(held: &[Meron], files: &[Value], waiting: &[Waiting]) -> Vec<String> {
    let mut expected = held.to_vec();
    let mut partial = vec![];
    let mut explained = HashSet::new();
    let mut ordered: Vec<&Waiting> = waiting.iter().collect();
    ordered.sort_by_key(|w| w.approved_at);
    for w in ordered {
        let s = stands(held, files, w);
        if !s.is_empty() && s.iter().all(|s| s.carried) {
            for m in &w.merons {
                expected.retain(|h| h.identity.uid != m.identity.uid);
                expected.push(m.clone());
            }
        } else if s.iter().any(|s| s.changed) {
            let has: Vec<&str> = s
                .iter()
                .filter(|s| s.changed)
                .map(|s| s.path.as_str())
                .collect();
            for lacks in s.iter().filter(|s| !s.carried) {
                partial.push(format!(
                    "{}: approved in Mero in one batch with {}, which this commit has; a batch lands whole, so this commit needs it too",
                    lacks.path,
                    has.join(", ")
                ));
            }
            explained.extend(has.into_iter().map(String::from));
        }
    }
    let mut out = partial;
    out.extend(problems(&expected, files).into_iter().filter(|p| {
        !explained
            .iter()
            .any(|path| p.starts_with(&format!("{path}: ")))
    }));
    out
}

/// How far two clocks may differ: Mero's, which notes an approval, and GitHub's, which dates a merge.
fn leeway() -> Duration {
    Duration::minutes(5)
}

/// The first waiting batch a commit on main carries whole, by when it was approved; only one
/// approved before that commit was made, so files main had before an approval never land it.
pub fn lands_first(
    held: &[Meron],
    files: &[Value],
    waiting: &[Waiting],
    made: DateTime<Utc>,
) -> Option<Uuid> {
    let mut ordered: Vec<&Waiting> = waiting
        .iter()
        .filter(|w| w.approved_at <= made + leeway())
        .collect();
    ordered.sort_by_key(|w| w.approved_at);
    ordered
        .into_iter()
        .find(|w| carries(held, files, w))
        .map(|w| w.batch)
}

/// From when main's commits are looked at: the first of these approvals, less the clocks' leeway.
pub fn look_since(waiting: &[Waiting]) -> Option<DateTime<Utc>> {
    waiting
        .iter()
        .map(|w| w.approved_at)
        .min()
        .map(|t| t - leeway())
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

    fn waits(batch: u128, minutes: i64, merons: Vec<Meron>) -> Waiting {
        Waiting {
            batch: Uuid::from_u128(batch),
            approved_at: "2026-11-18T12:00:00Z".parse::<DateTime<Utc>>().unwrap()
                + Duration::minutes(minutes),
            merons,
        }
    }
    fn with_uid(mut m: Meron, uid: u128) -> Meron {
        m.identity.uid = Uuid::from_u128(uid);
        m
    }
    const TOAST: &str = "noi.eio.components.toast";

    #[test]
    fn a_waiting_batch_counts_when_the_files_carry_it_whole() {
        let held = [
            with_uid(meron(CHIP, "active", json!({"job": "Lead"})), 1),
            with_uid(meron(TOAST, "active", json!({"job": "Tell"})), 2),
        ];
        let chip = with_uid(meron(CHIP, "active", json!({"job": "Lead well"})), 1);
        let toast = with_uid(meron(TOAST, "active", json!({"job": "Tell well"})), 2);
        let both = waits(10, 0, vec![chip.clone(), toast.clone()]);
        let now = [
            file(CHIP, json!({"job": "Lead"})),
            file(TOAST, json!({"job": "Tell"})),
        ];
        let after = [
            file(CHIP, json!({"job": "Lead well"})),
            file(TOAST, json!({"job": "Tell well"})),
        ];
        // Not on the branch yet: what Mero holds is still what you approved.
        assert!(check(&held, &now, std::slice::from_ref(&both)).is_empty());
        assert!(!carries(&held, &now, &both));
        // Carried whole: whatever commit has these files, by any merge.
        assert!(carries(&held, &after, &both));
        assert!(check(&held, &after, std::slice::from_ref(&both)).is_empty());
        // Never approved, it is still refused.
        assert_eq!(
            check(&held, &after, &[]).len(),
            2,
            "without the waiting batch both differ"
        );
        // Only part of it: told what it lacks, not that the part it has was never approved.
        let half = [
            file(CHIP, json!({"job": "Lead well"})),
            file(TOAST, json!({"job": "Tell"})),
        ];
        assert!(!carries(&held, &half, &both));
        assert_eq!(
            check(&held, &half, std::slice::from_ref(&both)),
            [format!("{TOAST}: approved in Mero in one batch with {CHIP}, which this commit has; a batch lands whole, so this commit needs it too")]
        );
    }

    #[test]
    fn a_rename_or_a_retirement_is_carried_by_where_the_files_are() {
        let held = [with_uid(meron(CHIP, "active", json!({"job": "Lead"})), 1)];
        const BADGE: &str = "noi.eio.components.badge";
        let renamed = waits(
            10,
            0,
            vec![with_uid(meron(BADGE, "active", json!({"job": "Lead"})), 1)],
        );
        let moved = [file(BADGE, json!({"job": "Lead"}))];
        assert!(carries(&held, &moved, &renamed));
        assert!(check(&held, &moved, std::slice::from_ref(&renamed)).is_empty());
        let both = [
            file(CHIP, json!({"job": "Lead"})),
            file(BADGE, json!({"job": "Lead"})),
        ];
        assert!(
            !carries(&held, &both, &renamed),
            "the old name must be gone"
        );
        let retired = waits(
            11,
            0,
            vec![with_uid(meron(CHIP, "retired", json!({"job": "Lead"})), 1)],
        );
        assert!(
            carries(&held, &[], &retired),
            "a retired meron's file is gone"
        );
        assert!(check(&held, &[], std::slice::from_ref(&retired)).is_empty());
        assert!(!carries(
            &held,
            &[file(CHIP, json!({"job": "Lead"}))],
            &retired
        ));
    }

    #[test]
    fn main_lands_the_first_batch_its_files_carry_approved_before_it() {
        let held = [with_uid(meron(CHIP, "active", json!({"job": "Lead"})), 1)];
        let a = waits(
            10,
            0,
            vec![with_uid(meron(CHIP, "active", json!({"job": "A"})), 1)],
        );
        let b = waits(
            11,
            30,
            vec![with_uid(meron(CHIP, "active", json!({"job": "B"})), 1)],
        );
        let both = [a.clone(), b.clone()];
        let at = |m: i64| {
            "2026-11-18T12:00:00Z".parse::<DateTime<Utc>>().unwrap() + Duration::minutes(m)
        };
        let has_a = [file(CHIP, json!({"job": "A"}))];
        let has_b = [file(CHIP, json!({"job": "B"}))];
        assert_eq!(lands_first(&held, &has_a, &both, at(20)), Some(a.batch));
        assert_eq!(lands_first(&held, &has_b, &both, at(40)), Some(b.batch));
        // Made before B was approved (beyond the clocks' leeway): those files never land B.
        assert_eq!(lands_first(&held, &has_b, &both, at(20)), None);
        assert_eq!(
            lands_first(&held, &[file(CHIP, json!({"job": "Lead"}))], &both, at(40)),
            None
        );
        assert_eq!(look_since(&both), Some(at(-5)));
        assert_eq!(look_since(&[]), None);
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
