//! Governance's Cedar: the schema every role and rule is checked against, built from the actions
//! each system declares in code, and the two checks Mero runs before a role or rule is admitted.
//! Roles and rules are merons under `noi.gov`; Governance enforces from its own copy of what was
//! approved.
use crate::Action;
use cedar_policy::{
    ActionConstraint, Effect, Policy, PolicyId, PolicySet, Schema, Template,
    TemplatePrincipalConstraint, TemplateResourceConstraint, ValidationMode, Validator,
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::OnceLock;

/// The check the role invariant asks Mero to run.
pub const ROLE_CHECK: &str = "gov.role";
/// The check the rule invariant asks Mero to run.
pub const RULE_CHECK: &str = "gov.rule";

/// Governance's own actions, on accounts, passkeys, grants and sessions. Governance's server
/// carries them out; they are declared here so the owner role can name them. `view` (7 Nov) sees
/// accounts, roles and the record and changes nothing; the fresh-touch rule exempts it.
pub const GOVERNANCE_ACTIONS: [&str; 8] = [
    "invite",
    "add-agent",
    "change-account",
    "remove-passkey",
    "grant",
    "end-grant",
    "end-session",
    "view",
];

/// The actions a role names, as written: a system's name stands for every action it declares.
/// None when the text is not a role.
pub fn role_actions(cedar: &str) -> Option<Vec<String>> {
    let template = Template::parse(Some(PolicyId::new("role")), cedar).ok()?;
    let named = match template.action_constraint() {
        ActionConstraint::Any => vec![],
        ActionConstraint::Eq(action) => vec![action],
        ActionConstraint::In(actions) => actions,
    };
    Some(
        named
            .iter()
            .map(|a| a.id().unescaped().to_string())
            .collect(),
    )
}

/// The systems that declare actions. Each is also a Cedar action group holding all of its
/// actions, so a role can grant every one with `action in Action::"mero"`.
pub const SYSTEMS: [&str; 2] = ["mero", "governance"];

pub(crate) fn declared(system: &str) -> Option<Vec<&'static str>> {
    match system {
        "mero" => Some(Action::ALL.iter().map(|a| a.as_str()).collect()),
        "governance" => Some(GOVERNANCE_ACTIONS.to_vec()),
        _ => None,
    }
}

/// The Cedar schema, in Cedar's own syntax. An account is in the roles it holds where a request
/// acts, and in the scope it belongs to; a scope is in its parent scope, so `noi.eio` is in `noi`.
/// Every action carries whether the request was signed with a fresh touch.
pub fn schema_text() -> String {
    let list = |system: &str| {
        declared(system)
            .unwrap_or_default()
            .iter()
            .map(|a| format!("\"{a}\""))
            .collect::<Vec<_>>()
            .join(", ")
    };
    format!(
        r#"entity Role;
entity Scope in [Scope];
entity Account in [Role, Scope];
action "mero";
action "governance";
action {mero} in ["mero"] appliesTo {{
  principal: [Account],
  resource: [Scope],
  context: {{ fresh_signature: Bool }}
}};
action {governance} in ["governance"] appliesTo {{
  principal: [Account],
  resource: [Scope, Account],
  context: {{ fresh_signature: Bool }}
}};
"#,
        mero = list("mero"),
        governance = list("governance"),
    )
}

/// The schema, parsed once. Governance's server checks requests and entities against it too.
pub(crate) fn schema() -> &'static Schema {
    static SCHEMA: OnceLock<Schema> = OnceLock::new();
    SCHEMA.get_or_init(|| {
        Schema::from_cedarschema_str(&schema_text())
            .expect("Governance's Cedar schema is valid; a test checks it")
            .0
    })
}

fn validator() -> &'static Validator {
    static VALIDATOR: OnceLock<Validator> = OnceLock::new();
    VALIDATOR.get_or_init(|| Validator::new(schema().clone()))
}

/// Strict Cedar validation against the schema: every action, entity type and context field must
/// exist, and every expression must type-check.
fn validate(add: impl FnOnce(&mut PolicySet) -> Result<(), String>) -> Result<(), String> {
    let mut set = PolicySet::new();
    add(&mut set)?;
    let result = validator().validate(&set, ValidationMode::Strict);
    let errors: Vec<String> = result.validation_errors().map(|e| e.to_string()).collect();
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RoleSpec {
    system: String,
    cedar: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RuleSpec {
    cedar: String,
}

/// The role check: a role is one Cedar permit template with two blanks, who (`principal ==
/// ?principal`) and where (`resource in ?resource`), naming only actions its system declares.
/// A grant fills the blanks.
pub fn check_role(spec: &Value) -> Result<(), String> {
    let role: RoleSpec = serde_json::from_value(spec.clone())
        .map_err(|e| format!("a role needs its system and its Cedar: {e}"))?;
    let actions = declared(&role.system).ok_or_else(|| {
        format!(
            "{} is not a system that declares actions; use {}",
            role.system,
            SYSTEMS.join(" or ")
        )
    })?;
    let template = Template::parse(Some(PolicyId::new("role")), &role.cedar).map_err(|e| {
        format!("a role must be one Cedar template with blanks for who and where: {e}")
    })?;
    if template.effect() != Effect::Permit {
        return Err("a role only grants, so it must be a permit; a forbid is a rule".into());
    }
    if template.principal_constraint() != TemplatePrincipalConstraint::Eq(None) {
        return Err("a role's who must be the blank: principal == ?principal".into());
    }
    if template.resource_constraint() != TemplateResourceConstraint::In(None) {
        return Err("a role's where must be the blank: resource in ?resource".into());
    }
    let named = match template.action_constraint() {
        ActionConstraint::Any => vec![],
        ActionConstraint::Eq(action) => vec![action],
        ActionConstraint::In(actions) => actions,
    };
    if named.is_empty() {
        return Err(format!(
            "a role must name its actions; to grant every {0} action, use action in Action::\"{0}\"",
            role.system
        ));
    }
    for action in &named {
        let name = action.id().unescaped();
        let own = action.type_name().to_string() == "Action"
            && (name == role.system || actions.contains(&name));
        if !own {
            return Err(format!(
                "{action} is not an action {} declares",
                role.system
            ));
        }
    }
    validate(|set| set.add_template(template).map_err(|e| e.to_string()))
}

/// The rule check: a rule is one Cedar policy with no blanks, valid against the schema.
pub fn check_rule(spec: &Value) -> Result<(), String> {
    let rule: RuleSpec =
        serde_json::from_value(spec.clone()).map_err(|e| format!("a rule needs its Cedar: {e}"))?;
    if Template::parse(None, &rule.cedar).is_ok() {
        return Err("a rule has no blanks; a policy with ?principal or ?resource is a role".into());
    }
    let policy = Policy::parse(Some(PolicyId::new("rule")), &rule.cedar)
        .map_err(|e| format!("a rule must be one Cedar policy: {e}"))?;
    validate(|set| set.add(policy).map_err(|e| e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn role(system: &str, cedar: &str) -> Result<(), String> {
        check_role(&json!({"system": system, "cedar": cedar}))
    }
    fn rule(cedar: &str) -> Result<(), String> {
        check_rule(&json!({"cedar": cedar}))
    }
    const CONTRIBUTOR: &str = r#"permit (
  principal == ?principal,
  action in [Action::"read", Action::"propose"],
  resource in ?resource
);"#;

    #[test]
    fn the_schema_holds_every_action_each_system_declares() {
        let text = schema_text();
        let (_, warnings) = Schema::from_cedarschema_str(&text).unwrap();
        assert_eq!(warnings.count(), 0);
        for action in Action::ALL {
            assert!(
                text.contains(&format!("\"{}\"", action.as_str())),
                "{action:?}"
            );
        }
        for action in GOVERNANCE_ACTIONS {
            assert!(text.contains(&format!("\"{action}\"")), "{action}");
        }
        assert_eq!(
            role_actions(
                r#"permit (principal == ?principal, action in [Action::"read", Action::"propose"], resource in ?resource);"#
            ),
            Some(vec!["read".into(), "propose".into()])
        );
        assert_eq!(
            role_actions(
                r#"permit (principal == ?principal, action in Action::"governance", resource in ?resource);"#
            ),
            Some(vec!["governance".into()])
        );
        assert_eq!(role_actions("not cedar"), None);
        // The JSON name and the Cedar name are the same.
        for action in Action::ALL {
            assert_eq!(serde_json::to_value(action).unwrap(), action.as_str());
        }
    }

    #[test]
    fn a_role_grants_its_own_systems_actions_with_two_blanks() {
        role("mero", CONTRIBUTOR).unwrap();
        role(
            "mero",
            r#"permit (principal == ?principal, action in Action::"mero", resource in ?resource);"#,
        )
        .unwrap();
        role(
            "governance",
            r#"permit (principal == ?principal, action in Action::"governance", resource in ?resource);"#,
        )
        .unwrap();
        // Another system's actions.
        let error = role(
            "mero",
            r#"permit (principal == ?principal, action == Action::"grant", resource in ?resource);"#,
        )
        .unwrap_err();
        assert_eq!(error, r#"Action::"grant" is not an action mero declares"#);
        assert!(role(
            "governance",
            r#"permit (principal == ?principal, action in Action::"mero", resource in ?resource);"#
        )
        .is_err());
        // Actions nobody declares, and no actions at all.
        assert!(role(
            "mero",
            r#"permit (principal == ?principal, action == Action::"delete", resource in ?resource);"#
        )
        .is_err());
        assert!(role(
            "mero",
            r#"permit (principal == ?principal, action, resource in ?resource);"#
        )
        .unwrap_err()
        .contains("must name its actions"));
        assert!(role("eidos", CONTRIBUTOR)
            .unwrap_err()
            .contains("mero or governance"));
    }

    #[test]
    fn a_role_is_a_permit_with_blanks_for_who_and_where() {
        let forbid = CONTRIBUTOR.replace("permit", "forbid");
        assert!(role("mero", &forbid)
            .unwrap_err()
            .contains("must be a permit"));
        let named = CONTRIBUTOR.replace("?principal", r#"Account::"design-agent""#);
        assert!(role("mero", &named).is_err());
        let any_principal = CONTRIBUTOR.replace("principal == ?principal", "principal");
        assert!(role("mero", &any_principal).is_err());
        let exact_place = CONTRIBUTOR.replace("resource in ?resource", "resource == ?resource");
        assert!(role("mero", &exact_place)
            .unwrap_err()
            .contains("resource in ?resource"));
        // Conditions must type-check against the schema.
        let condition = CONTRIBUTOR.replace(");", ") when { context.fresh_signature };");
        role("mero", &condition).unwrap();
        let unknown = CONTRIBUTOR.replace(");", ") when { context.trusted };");
        assert!(role("mero", &unknown).is_err());
        assert!(check_role(&json!({"system": "mero", "cedar": CONTRIBUTOR, "extra": 1})).is_err());
        assert!(check_role(&json!({"cedar": CONTRIBUTOR})).is_err());
    }

    #[test]
    fn a_rule_is_one_valid_policy_without_blanks() {
        rule(
            r#"forbid (principal, action in [Action::"review", Action::"governance"], resource)
unless { context.fresh_signature };"#,
        )
        .unwrap();
        rule(
            r#"forbid (principal, action == Action::"review", resource in Scope::"noi.gov")
unless { principal in Role::"owner" };"#,
        )
        .unwrap();
        assert!(rule(CONTRIBUTOR).unwrap_err().contains("is a role"));
        assert!(rule("forbid (principal, action, resource) unless {").is_err());
        assert!(rule(r#"forbid (principal, action == Action::"approve", resource);"#).is_err());
        assert!(rule(r#"forbid (principal, action, resource) unless { context.touch };"#).is_err());
        assert!(rule(r#"forbid (principal in Group::"x", action, resource);"#).is_err());
        let two = r#"forbid (principal, action, resource); permit (principal, action, resource);"#;
        assert!(rule(two).is_err());
        assert!(check_rule(&json!({"cedar": 1})).is_err());
    }
}
