//! The two roles and two rules in `data/gov`, as agreed on 6 Nov, decide what the board says
//! they decide. Grants are linked the way Governance will link them: a role's template with who
//! and where filled in. Every other role is made later by an owner, in the UI. No database.
use cedar_policy::{
    Authorizer, Context, Decision, Entities, Entity, EntityUid, Policy, PolicyId, PolicySet,
    Request, Schema, SlotId, Template,
};
use serde_json::{json, Value};
use std::{collections::HashMap, collections::HashSet, fs, path::Path, str::FromStr};

fn file(path: &str) -> Value {
    let full = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/gov")
        .join(path);
    serde_json::from_str(&fs::read_to_string(full).unwrap()).unwrap()
}
fn uid(text: &str) -> EntityUid {
    EntityUid::from_str(text).unwrap()
}
fn entity(name: &str, parents: &[&str]) -> Entity {
    Entity::new_no_attrs(
        uid(name),
        parents.iter().map(|p| uid(p)).collect::<HashSet<_>>(),
    )
}

/// A role an owner might make later in the UI: read and propose, granted only in Eidos.
const EIDOS_PROPOSER: &str = r#"permit (
  principal == ?principal,
  action in [Action::"read", Action::"propose"],
  resource in ?resource
);"#;

struct World {
    schema: Schema,
    policies: PolicySet,
    entities: Entities,
}
impl World {
    fn new() -> Self {
        let (schema, _) = Schema::from_cedarschema_str(&noi_gov::schema_text()).unwrap();
        let mut policies = PolicySet::new();
        let mut roles: Vec<(String, Value)> = ["maintainer", "owner"]
            .iter()
            .map(|r| {
                (
                    r.to_string(),
                    file(&format!("roles/{r}.json"))["spec"].clone(),
                )
            })
            .collect();
        roles.push((
            "eidos-proposer".into(),
            json!({"system": "mero", "cedar": EIDOS_PROPOSER}),
        ));
        for (name, spec) in &roles {
            noi_gov::check_role(spec).unwrap();
            let cedar = spec["cedar"].as_str().unwrap();
            policies
                .add_template(Template::parse(Some(PolicyId::new(name)), cedar).unwrap())
                .unwrap();
        }
        for rule in ["fresh-touch", "owners-approve-gov"] {
            let meron = file(&format!("rules/{rule}.json"));
            noi_gov::check_rule(&meron["spec"]).unwrap();
            let cedar = meron["spec"]["cedar"].as_str().unwrap();
            policies
                .add(Policy::parse(Some(PolicyId::new(rule)), cedar).unwrap())
                .unwrap();
        }
        // Who holds what, and where. You are maintainer and owner in all of NOI. `steward` is a
        // maintainer who is not an owner. design-agent holds the role made later, only in Eidos.
        // `signed-out` holds nothing.
        let grants = [
            ("hiddenstack", "maintainer", "noi"),
            ("hiddenstack", "owner", "noi"),
            ("steward", "maintainer", "noi"),
            ("design-agent", "eidos-proposer", "noi.eio"),
        ];
        for (i, (account, role, scope)) in grants.iter().enumerate() {
            let fill = HashMap::from([
                (
                    SlotId::principal(),
                    uid(&format!(r#"Account::"{account}""#)),
                ),
                (SlotId::resource(), uid(&format!(r#"Scope::"{scope}""#))),
            ]);
            policies
                .link(
                    PolicyId::new(*role),
                    PolicyId::new(format!("grant-{i}")),
                    fill,
                )
                .unwrap();
        }
        // An account is in the roles it holds where the request acts; here only you are an owner.
        let entities = Entities::from_entities(
            [
                entity(r#"Scope::"noi""#, &[]),
                entity(r#"Scope::"noi.eio""#, &[r#"Scope::"noi""#]),
                entity(r#"Scope::"noi.gov""#, &[r#"Scope::"noi""#]),
                entity(
                    r#"Scope::"noi.eio.motion.duration.ms100""#,
                    &[r#"Scope::"noi.eio""#],
                ),
                entity(r#"Scope::"noi.gov.roles.owner""#, &[r#"Scope::"noi.gov""#]),
                entity(r#"Role::"owner""#, &[]),
                entity(
                    r#"Account::"hiddenstack""#,
                    &[r#"Role::"owner""#, r#"Scope::"noi""#],
                ),
                entity(r#"Account::"design-agent""#, &[r#"Scope::"noi""#]),
                entity(r#"Account::"signed-out""#, &[r#"Scope::"noi""#]),
                entity(r#"Account::"steward""#, &[r#"Scope::"noi""#]),
            ],
            Some(&schema),
        )
        .unwrap();
        World {
            schema,
            policies,
            entities,
        }
    }
    fn may(&self, account: &str, action: &str, resource: &str, touch: bool) -> bool {
        let action = uid(&format!(r#"Action::"{action}""#));
        let context = Context::from_json_value(
            json!({"fresh_signature": touch}),
            Some((&self.schema, &action)),
        )
        .unwrap();
        let request = Request::new(
            uid(&format!(r#"Account::"{account}""#)),
            action,
            uid(resource),
            context,
            Some(&self.schema),
        )
        .unwrap();
        Authorizer::new()
            .is_authorized(&request, &self.policies, &self.entities)
            .decision()
            == Decision::Allow
    }
}

const MS100: &str = r#"Scope::"noi.eio.motion.duration.ms100""#;
const OWNER_ROLE: &str = r#"Scope::"noi.gov.roles.owner""#;
const AGENT: &str = r#"Account::"design-agent""#;

#[test]
fn nothing_without_a_grant() {
    let w = World::new();
    // Proving who you are is not permission: no grant, no action, not even reading.
    assert!(!w.may("signed-out", "read", MS100, false));
    assert!(!w.may("signed-out", "propose", MS100, true));
}

#[test]
fn a_role_works_only_where_it_is_granted() {
    let w = World::new();
    assert!(w.may("design-agent", "read", MS100, false));
    assert!(w.may("design-agent", "propose", MS100, false));
    // Outside Eidos, and anything the role does not name, even with a touch.
    assert!(!w.may("design-agent", "propose", OWNER_ROLE, false));
    assert!(!w.may("design-agent", "review", MS100, true));
    assert!(!w.may("design-agent", "grant", AGENT, true));
}

#[test]
fn approving_and_changing_access_need_a_fresh_touch() {
    let w = World::new();
    assert!(w.may("hiddenstack", "review", MS100, true));
    // A session alone, such as a stolen one, cannot approve or change access.
    assert!(!w.may("hiddenstack", "review", MS100, false));
    assert!(!w.may("hiddenstack", "grant", AGENT, false));
    assert!(w.may("hiddenstack", "grant", AGENT, true));
    // Reading and proposing need no touch.
    assert!(w.may("hiddenstack", "propose", MS100, false));
}

#[test]
fn only_owners_approve_roles_and_rules() {
    let w = World::new();
    assert!(w.may("steward", "review", MS100, true));
    assert!(!w.may("steward", "review", OWNER_ROLE, true));
    assert!(w.may("hiddenstack", "review", OWNER_ROLE, true));
    // A maintainer holds no Governance action.
    assert!(!w.may("steward", "grant", AGENT, true));
}
