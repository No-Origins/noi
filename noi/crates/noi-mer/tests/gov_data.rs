//! The Governance proposal files in `data/gov` pass their invariants before anyone proposes them.
//! No database: invariant schemas and the role and rule checks run directly on the files.
use noi_inv::{InvariantSpec, MeronType, NewMeron};
use serde_json::json;
use std::{fs, path::Path};

fn read(path: &Path) -> NewMeron {
    let meron: NewMeron = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    meron.validate().unwrap();
    meron
}
fn data(dir: &str) -> Vec<NewMeron> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/gov")
        .join(dir);
    let mut files: Vec<_> = fs::read_dir(path)
        .unwrap()
        .map(|f| f.unwrap().path())
        .collect();
    files.sort();
    files.iter().map(|f| read(f)).collect()
}
fn invariant(file: &str) -> InvariantSpec {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/gov")
        .join(file);
    InvariantSpec::parse(&read(&path).spec).unwrap()
}
fn under_gov(m: &NewMeron, folder: &str) {
    assert!(
        m.path.starts_with(&format!("noi.gov.{folder}.")),
        "{}",
        m.path
    );
    assert_eq!(m.classification.kind, MeronType::Rule, "{}", m.path);
}

#[test]
fn gov_roles_pass_their_invariant() {
    let role = invariant("role-invariant.json");
    assert_eq!(role.checks[0].name, noi_gov::ROLE_CHECK);
    let roles = data("roles");
    let paths: Vec<_> = roles.iter().map(|r| r.path.as_str()).collect();
    assert_eq!(paths, ["noi.gov.roles.maintainer", "noi.gov.roles.owner"]);
    for r in &roles {
        under_gov(r, "roles");
        assert!(role.applies_to.covers(&r.classification), "{}", r.path);
        role.check(&r.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", r.path));
        noi_gov::check_role(&r.spec).unwrap_or_else(|e| panic!("{}: {e}", r.path));
    }
    // The schema refuses what is not a role's: a missing system, or anything extra.
    assert!(role
        .check(&json!({"cedar": "permit (principal, action, resource);"}))
        .is_err());
    assert!(role
        .check(&json!({"system": "mero", "cedar": "x", "grants": []}))
        .is_err());
}

#[test]
fn gov_rules_pass_their_invariant() {
    let rule = invariant("rule-invariant.json");
    assert_eq!(rule.checks[0].name, noi_gov::RULE_CHECK);
    let rules = data("rules");
    assert_eq!(rules.len(), 2, "the two rules agreed on 6 Nov");
    for r in &rules {
        under_gov(r, "rules");
        assert!(rule.applies_to.covers(&r.classification), "{}", r.path);
        rule.check(&r.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", r.path));
        noi_gov::check_rule(&r.spec).unwrap_or_else(|e| panic!("{}: {e}", r.path));
    }
    assert!(rule.check(&json!({"cedar": ""})).is_err());
}

#[test]
fn no_secrets_in_gov_merons() {
    // Rule 8 of What Governance Is: passwords, keys and tokens never enter Mero.
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data/gov");
    let mut text = String::new();
    for folder in ["", "roles", "rules"] {
        for f in fs::read_dir(dir.join(folder)).unwrap() {
            let p = f.unwrap().path();
            if p.extension().is_some_and(|e| e == "json") {
                text.push_str(&fs::read_to_string(p).unwrap().to_lowercase());
            }
        }
    }
    for word in ["password", "secret", "token\"", "private_key", "bearer"] {
        assert!(!text.contains(word), "{word}");
    }
}
