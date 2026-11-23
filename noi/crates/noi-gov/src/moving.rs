//! The one move of roles and rules out of Mero and into Governance (agreed 9 Nov, page "Where Roles
//! and Rules Live", decision 5). Mero writes what it holds under `noi.gov` into a file, every
//! revision of every role and rule from its own history (`noi export gov`); Governance takes that
//! file in once (`noi gov move-in`). Governance never asks Mero for it: the operator hands it over.
//! This module is the file's shape and the checks Governance runs on it before anything is written.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Everything Mero held under `noi.gov` that is a role or a rule, with every revision.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveFile {
    /// Always "mero".
    pub moved_from: String,
    pub written_at: DateTime<Utc>,
    pub roles_and_rules: Vec<Moving>,
}

/// One role or rule meron, as Mero holds it now, and every revision it had.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Moving {
    /// Mero's ID for it, kept with each version so either side can be traced to the other.
    pub uid: String,
    pub path: String,
    /// "role" or "policy", Mero's subtype.
    pub subtype: String,
    pub state: String,
    pub revision: i64,
    /// From revision 1 to `revision`, one each, in order.
    pub revisions: Vec<MovingRevision>,
}

/// One revision, as Mero's history recorded it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MovingRevision {
    pub revision: i64,
    /// Where it was then; the same as now unless it was renamed.
    pub path: String,
    pub name: String,
    pub definition: String,
    pub responsibility: String,
    pub spec: Value,
    pub state: String,
    pub at: DateTime<Utc>,
    /// Who did it, by handle, as Mero wrote it.
    pub by: String,
    /// What Mero did: meron.propose, meron.update, meron.transition, meron.rename.
    pub action: String,
    /// Mero's reference for the answer that allowed it, such as governance:record:224.
    pub reference: String,
    /// Why, when Mero kept it: an update's rationale, or a transition's reason.
    #[serde(default)]
    pub why: Option<String>,
}

/// One version as Governance will keep it.
#[derive(Debug, Clone, PartialEq)]
pub struct MovedVersion {
    pub path: String,
    pub revision: i64,
    pub kind: &'static str,
    pub name: String,
    pub definition: String,
    pub responsibility: String,
    pub system: Option<String>,
    pub cedar: String,
    pub state: String,
    pub at: DateTime<Utc>,
    pub by: String,
    pub why: Option<String>,
    /// Mero's own words: its ID, the path then, who, what and its reference.
    pub mero: Value,
}

const STATES: [&str; 5] = ["proposed", "registered", "active", "deprecated", "retired"];
const IN_FORCE: [&str; 2] = ["active", "deprecated"];

/// Checks a move file and turns it into the versions Governance will keep, in the order they were
/// written in Mero. Refuses the whole file on the first thing wrong: a place outside the roles and
/// rules, a revision missing, or a role or rule in force whose Cedar fails its check today, as the
/// copy refused it. At least one role must be in force, or nobody could do anything.
pub fn versions_of(file: &MoveFile) -> Result<Vec<MovedVersion>, String> {
    if file.moved_from != "mero" {
        return Err(format!("a move comes from Mero, not {}", file.moved_from));
    }
    let mut seen = std::collections::HashSet::new();
    let mut out = vec![];
    let mut roles_in_force = 0;
    for m in &file.roles_and_rules {
        let path = m.path.as_str();
        let kind = match (m.subtype.as_str(), path) {
            ("role", p) if p.starts_with("noi.gov.roles.") => "role",
            ("policy", p) if p.starts_with("noi.gov.rules.") => "rule",
            _ => {
                return Err(format!(
                    "{path}: a role belongs under noi.gov.roles and a rule under noi.gov.rules"
                ))
            }
        };
        if !seen.insert(path) {
            return Err(format!("{path} is in the file twice"));
        }
        if !STATES.contains(&m.state.as_str()) {
            return Err(format!("{path}: {} is not a state", m.state));
        }
        let numbers: Vec<i64> = m.revisions.iter().map(|r| r.revision).collect();
        if numbers != (1..=m.revision).collect::<Vec<_>>() {
            return Err(format!(
                "{path}: revisions 1 to {} are needed, each once and in order; the file has {numbers:?}",
                m.revision
            ));
        }
        for r in &m.revisions {
            let at = format!("{path} at revision {}", r.revision);
            if !STATES.contains(&r.state.as_str()) {
                return Err(format!("{at}: {} is not a state", r.state));
            }
            for (what, text) in [
                ("name", &r.name),
                ("definition", &r.definition),
                ("responsibility", &r.responsibility),
            ] {
                if text.trim().is_empty() {
                    return Err(format!("{at}: its {what} is empty"));
                }
            }
            let cedar = r.spec["cedar"]
                .as_str()
                .filter(|c| !c.trim().is_empty())
                .ok_or_else(|| format!("{at}: it has no Cedar"))?;
            let system = match kind {
                "role" => Some(
                    r.spec["system"]
                        .as_str()
                        .ok_or_else(|| format!("{at}: a role needs its system"))?
                        .to_string(),
                ),
                _ => None,
            };
            out.push(MovedVersion {
                path: path.to_string(),
                revision: r.revision,
                kind,
                name: r.name.trim().to_string(),
                definition: r.definition.trim().to_string(),
                responsibility: r.responsibility.trim().to_string(),
                system,
                cedar: cedar.to_string(),
                state: r.state.clone(),
                at: r.at,
                by: r.by.clone(),
                why: r.why.clone().filter(|w| !w.trim().is_empty()),
                mero: json!({
                    "uid": m.uid, "path": r.path, "by": r.by, "action": r.action, "reference": r.reference,
                }),
            });
        }
        let last = m
            .revisions
            .last()
            .ok_or_else(|| format!("{path}: no revisions"))?;
        if last.state != m.state {
            return Err(format!(
                "{path}: its last revision says {}, but Mero holds it as {}",
                last.state, m.state
            ));
        }
        if IN_FORCE.contains(&m.state.as_str()) {
            let checked = match kind {
                "role" => crate::check_role(&last.spec),
                _ => crate::check_rule(&last.spec),
            };
            checked.map_err(|e| format!("{path}: {e}"))?;
            if kind == "role" {
                roles_in_force += 1;
            }
        }
    }
    if roles_in_force == 0 {
        return Err("the file holds no role in force".into());
    }
    out.sort_by(|a, b| {
        a.at.cmp(&b.at)
            .then(a.path.cmp(&b.path))
            .then(a.revision.cmp(&b.revision))
    });
    Ok(out)
}

/// The note each retired meron carries in Mero, saying where it went.
pub fn retired_note(on: &str) -> String {
    format!("Moved to Governance on {on}: roles and rules now live there, with every revision, on Governance's Roles page. Retired here so they are kept in one place.")
}
/// The note for the two invariants that checked roles and rules in Mero.
pub fn retired_invariant_note(on: &str) -> String {
    format!("Retired on {on} with the roles and rules it checked, which moved to Governance. Governance checks them itself.")
}

#[cfg(test)]
mod tests {
    use super::*;

    const OWNER: &str = r#"permit (principal == ?principal, action in Action::"governance", resource in ?resource);"#;
    const TOUCH: &str = r#"forbid (principal, action in [Action::"review", Action::"governance"], resource) unless { context.fresh_signature || action == Action::"view" };"#;

    fn revision(n: i64, state: &str, spec: Value) -> MovingRevision {
        MovingRevision {
            revision: n,
            path: "noi.gov.roles.owner".into(),
            name: "Owner".into(),
            definition: "Every Governance action.".into(),
            responsibility: "Decide who may do what.".into(),
            spec,
            state: state.into(),
            at: DateTime::from_timestamp(1_762_400_000 + n * 60, 0).unwrap(),
            by: "hiddenstack".into(),
            action: "meron.transition".into(),
            reference: format!("governance:record:{n}"),
            why: None,
        }
    }
    fn owner() -> Moving {
        let spec = json!({"system": "governance", "cedar": OWNER});
        Moving {
            uid: "b57aa1d2-8500-4b81-b217-73590afcb75b".into(),
            path: "noi.gov.roles.owner".into(),
            subtype: "role".into(),
            state: "active".into(),
            revision: 3,
            revisions: vec![
                revision(1, "proposed", spec.clone()),
                revision(2, "registered", spec.clone()),
                revision(3, "active", spec),
            ],
        }
    }
    fn touch() -> Moving {
        let mut r = revision(1, "active", json!({"cedar": TOUCH}));
        r.path = "noi.gov.rules.fresh-touch".into();
        r.name = "A fresh touch".into();
        Moving {
            uid: "b57aa1d2-8500-4b81-b217-73590afcb75c".into(),
            path: "noi.gov.rules.fresh-touch".into(),
            subtype: "policy".into(),
            state: "active".into(),
            revision: 1,
            revisions: vec![r],
        }
    }
    fn file(items: Vec<Moving>) -> MoveFile {
        MoveFile {
            moved_from: "mero".into(),
            written_at: DateTime::from_timestamp(1_763_700_000, 0).unwrap(),
            roles_and_rules: items,
        }
    }

    #[test]
    fn every_revision_moves_in_the_order_it_was_written() {
        let v = versions_of(&file(vec![owner(), touch()])).unwrap();
        let got: Vec<_> = v
            .iter()
            .map(|x| (x.path.as_str(), x.revision, x.state.as_str(), x.kind))
            .collect();
        assert_eq!(
            got,
            [
                ("noi.gov.roles.owner", 1, "proposed", "role"),
                ("noi.gov.rules.fresh-touch", 1, "active", "rule"),
                ("noi.gov.roles.owner", 2, "registered", "role"),
                ("noi.gov.roles.owner", 3, "active", "role"),
            ]
        );
        assert_eq!(v[0].system.as_deref(), Some("governance"));
        assert_eq!(v[1].system, None);
        assert_eq!(v[3].mero["reference"], "governance:record:3");
    }

    #[test]
    fn a_missing_revision_or_a_wrong_place_refuses_the_whole_file() {
        let mut gap = owner();
        gap.revisions.remove(1);
        assert!(versions_of(&file(vec![gap]))
            .unwrap_err()
            .contains("revisions 1 to 3"));
        let mut misplaced = touch();
        misplaced.path = "noi.gov.roles.touch".into();
        assert!(versions_of(&file(vec![owner(), misplaced]))
            .unwrap_err()
            .contains("under noi.gov.rules"));
        assert!(versions_of(&file(vec![owner(), owner()]))
            .unwrap_err()
            .contains("twice"));
        let mut other = file(vec![owner()]);
        other.moved_from = "elsewhere".into();
        assert!(versions_of(&other).is_err());
    }

    #[test]
    fn what_is_in_force_must_pass_its_check_today() {
        let mut bad = owner();
        bad.revisions[2].spec = json!({"system": "mero", "cedar": OWNER});
        assert!(versions_of(&file(vec![bad]))
            .unwrap_err()
            .contains("not an action mero declares"));
        // A retired one is history: it moves as it was, unchecked.
        let mut retired = owner();
        retired.state = "retired".into();
        retired.revision = 4;
        let mut last = retired.revisions[2].clone();
        last.revision = 4;
        last.state = "retired".into();
        last.spec = json!({"system": "mero", "cedar": OWNER});
        retired.revisions.push(last);
        let mut second = owner();
        second.path = "noi.gov.roles.owner2".into();
        second.uid = "x".into();
        assert!(versions_of(&file(vec![retired.clone(), second])).is_ok());
        assert!(versions_of(&file(vec![retired, touch()]))
            .unwrap_err()
            .contains("no role in force"));
    }

    #[test]
    fn the_last_revision_is_what_mero_holds() {
        let mut odd = owner();
        odd.state = "deprecated".into();
        assert!(versions_of(&file(vec![odd]))
            .unwrap_err()
            .contains("Mero holds it as deprecated"));
    }
}
