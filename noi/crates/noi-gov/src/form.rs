//! Roles and rules as a form (agreed 8 Nov): nobody types Cedar. A rule is one sentence in five
//! parts: it forbids or permits · who · doing what · where · unless. A role is one system and its
//! verbs. Cedar stays what is stored and checked; this module writes it from the form and reads it
//! back.
//!
//! Reading is strict and then proven: anything the five parts can't say is "written by hand", and
//! a rule only counts as read when the Cedar written from the form means exactly what was stored
//! (the Cedar library's own JSON form of both, compared). Every role and rule in `data/gov` goes to
//! the form and back to the same text.
use crate::cedar::{check_role, check_rule, declared};
use crate::SYSTEMS;
use cedar_policy::{Policy, PolicyId, Template};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

/// A rule: forbids or permits · who · doing what · where · unless.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuleForm {
    pub effect: Effect,
    pub who: Who,
    /// What it is about: for each system, every action (but some) or some of them. Never empty.
    pub doing: Vec<Doing>,
    #[serde(rename = "where")]
    pub place: Where,
    /// Any of these, and the rule does not apply. An action excepted under `doing` is one too.
    #[serde(default)]
    pub unless: Vec<Condition>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Effect {
    Forbid,
    Permit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Who {
    Anyone,
    /// Whoever holds this role where the request acts, such as `owner`.
    Role(String),
    /// One account, by its ID.
    Account(String),
}

/// One system's part in what a rule or role is about.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Doing {
    pub system: String,
    #[serde(flatten)]
    pub pick: Pick,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "pick", rename_all = "kebab-case")]
pub enum Pick {
    /// Every action the system declares, now and later, except these.
    Every {
        #[serde(default)]
        except: Vec<String>,
    },
    /// Only these.
    These { verbs: Vec<String> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Where {
    Everywhere,
    /// One place in Mero and everything under it, such as `noi.gov`.
    Place(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Condition {
    /// The request was signed with a fresh touch.
    FreshTouch,
    /// They hold this role where the request acts.
    Holds(String),
}

/// A role: one system, and every one of its actions or some of them. Who and where come when it
/// is granted.
pub type RoleForm = Doing;

/// Each system and the verbs it declares, for the form's checkboxes.
pub fn verbs() -> Vec<(&'static str, Vec<&'static str>)> {
    SYSTEMS.iter().map(|s| (*s, declared(s).unwrap_or_default())).collect()
}

fn system_of(verb: &str) -> Option<&'static str> {
    SYSTEMS.into_iter().find(|s| declared(s).is_some_and(|v| v.contains(&verb)))
}

/// A role's, place's or account's name goes inside Cedar quotes, so only plain names pass.
fn plain(what: &str, name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 200
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-')
        && !name.starts_with(['.', '-'])
        && !name.ends_with('.')
        && !name.contains("..");
    if ok {
        Ok(())
    } else {
        Err(format!("{what} \"{name}\" is not a plain name: lowercase letters, digits, dots and dashes"))
    }
}

/// The action entries, in order: a system's name for every action, else its verbs. Excepted
/// verbs, in order, for the conditions.
fn actions(doing: &[Doing], role: bool) -> Result<(Vec<String>, Vec<String>), String> {
    if doing.is_empty() {
        return Err("pick what it is about: at least one action".into());
    }
    let (mut entries, mut excepted) = (vec![], vec![]);
    for (i, d) in doing.iter().enumerate() {
        let declared = declared(&d.system)
            .ok_or_else(|| format!("{} is not a system that declares actions; use {}", d.system, SYSTEMS.join(" or ")))?;
        if doing[..i].iter().any(|e| e.system == d.system) {
            return Err(format!("{} appears twice; pick its actions once", d.system));
        }
        let known = |v: &String| -> Result<(), String> {
            if declared.contains(&v.as_str()) {
                Ok(())
            } else {
                Err(format!("{v} is not an action {} declares", d.system))
            }
        };
        match &d.pick {
            Pick::Every { except } => {
                if role && !except.is_empty() {
                    return Err("a role grants every action or some of them; untick the ones it should not have".into());
                }
                for (j, v) in except.iter().enumerate() {
                    known(v)?;
                    if except[..j].contains(v) {
                        return Err(format!("{v} is excepted twice"));
                    }
                }
                if except.len() >= declared.len() {
                    return Err(format!("every {} action is excepted, so nothing is left", d.system));
                }
                entries.push(d.system.clone());
                excepted.extend(except.iter().cloned());
            }
            Pick::These { verbs } => {
                if verbs.is_empty() {
                    return Err(format!("tick at least one {} action, or leave {} out", d.system, d.system));
                }
                for (j, v) in verbs.iter().enumerate() {
                    known(v)?;
                    if verbs[..j].contains(v) {
                        return Err(format!("{v} is ticked twice"));
                    }
                }
                entries.extend(verbs.iter().cloned());
            }
        }
    }
    Ok((entries, excepted))
}

/// `action == …` for one verb, `action in …` for one system, else a list, one per line.
fn action_scope(entries: &[String]) -> String {
    let quoted = |a: &String| format!("Action::\"{a}\"");
    match entries {
        [one] if SYSTEMS.contains(&one.as_str()) => format!("action in {}", quoted(one)),
        [one] => format!("action == {}", quoted(one)),
        many => format!("action in [{}]", many.iter().map(quoted).collect::<Vec<_>>().join(",\n             ")),
    }
}

/// The Cedar for a rule, checked against the schema as Mero will check it.
pub fn write_rule(form: &RuleForm) -> Result<String, String> {
    let principal = match &form.who {
        Who::Anyone => "principal".to_string(),
        Who::Role(r) => {
            plain("the role", r)?;
            format!("principal in Role::\"{r}\"")
        }
        Who::Account(a) => {
            let id = Uuid::parse_str(a).map_err(|_| format!("\"{a}\" is not an account's ID"))?;
            format!("principal == Account::\"{id}\"")
        }
    };
    let (entries, excepted) = actions(&form.doing, false)?;
    let resource = match &form.place {
        Where::Everywhere => "resource".to_string(),
        Where::Place(p) => {
            plain("the place", p)?;
            format!("resource in Scope::\"{p}\"")
        }
    };
    let mut conditions = vec![];
    for (i, c) in form.unless.iter().enumerate() {
        if form.unless[..i].contains(c) {
            return Err("the same \"unless\" is there twice".into());
        }
        conditions.push(match c {
            Condition::FreshTouch => "context.fresh_signature".to_string(),
            Condition::Holds(r) => {
                plain("the role", r)?;
                format!("principal in Role::\"{r}\"")
            }
        });
    }
    conditions.extend(excepted.iter().map(|v| format!("action == Action::\"{v}\"")));
    let effect = match form.effect {
        Effect::Forbid => "forbid",
        Effect::Permit => "permit",
    };
    let unless = if conditions.is_empty() { String::new() } else { format!(" unless {{ {} }}", conditions.join(" || ")) };
    let cedar = format!("{effect} (\n  {principal},\n  {},\n  {resource}\n){unless};", action_scope(&entries));
    check_rule(&json!({ "cedar": cedar }))?;
    Ok(cedar)
}

/// The Cedar for a role, checked as Mero checks roles.
pub fn write_role(form: &RoleForm) -> Result<String, String> {
    let (entries, _) = actions(std::slice::from_ref(form), true)?;
    let cedar = format!("permit (\n  principal == ?principal,\n  {},\n  resource in ?resource\n);", action_scope(&entries));
    check_role(&json!({ "system": form.system, "cedar": cedar }))?;
    Ok(cedar)
}

// ——— Reading ———

fn entity<'a>(v: &'a Value, kind: &str) -> Option<&'a str> {
    (v["type"] == kind).then(|| v["id"].as_str()).flatten()
}

/// The action entries a policy names, in order.
fn named_actions(est: &Value) -> Result<Vec<String>, String> {
    let a = &est["action"];
    let list: Vec<&Value> = match (a["op"].as_str(), a.get("entity"), a.get("entities")) {
        (Some("==" | "in"), Some(e), _) => vec![e],
        (Some("in"), _, Some(Value::Array(es))) => es.iter().collect(),
        (Some("All"), ..) => return Err("it names no actions, so it is about every action there is".into()),
        _ => return Err("its actions are not a plain list".into()),
    };
    list.into_iter()
        .map(|e| entity(e, "Action").map(String::from).ok_or_else(|| "it names something other than an action".to_string()))
        .collect()
}

/// `a || b || c`, as its parts.
fn ors(v: &Value, out: &mut Vec<Value>) {
    match v.get("||") {
        Some(or) => {
            ors(&or["left"], out);
            ors(&or["right"], out);
        }
        None => out.push(v.clone()),
    }
}

/// The library's JSON form, with what does not change the meaning set aside: the order of a list
/// of actions, a one-action list, `in` one action that holds no others (only a system's name
/// does), and the order of `||`.
fn canonical(mut est: Value) -> Value {
    if let Some(a) = est.get_mut("action") {
        if let Some(Value::Array(es)) = a.get("entities").cloned() {
            let mut es = es;
            es.sort_by_key(|e| e.to_string());
            *a = if es.len() == 1 { json!({"op": "in", "entity": es[0]}) } else { json!({"op": "in", "entities": es}) };
        }
        let leaf = a.get("entity").and_then(|e| entity(e, "Action")).is_some_and(|id| !SYSTEMS.contains(&id));
        if a["op"] == "in" && leaf {
            a["op"] = json!("==");
        }
    }
    if let Some(Value::Array(cs)) = est.get_mut("conditions") {
        for c in cs.iter_mut() {
            let mut parts = vec![];
            ors(&c["body"], &mut parts);
            parts.sort_by_key(|p| p.to_string());
            c["body"] = Value::Array(parts);
        }
    }
    est
}

fn est_of_policy(cedar: &str) -> Result<Value, String> {
    let policy = Policy::parse(Some(PolicyId::new("rule")), cedar).map_err(|e| format!("it is not one Cedar policy: {e}"))?;
    policy.to_json().map_err(|e| e.to_string())
}

/// Reads a rule into the form. `Err` says why it is written by hand.
pub fn read_rule(cedar: &str) -> Result<RuleForm, String> {
    if Template::parse(None, cedar).is_ok() {
        return Err("it has blanks, like a role".into());
    }
    let est = est_of_policy(cedar)?;
    if est.get("annotations").is_some_and(|a| a.as_object().is_some_and(|o| !o.is_empty())) {
        return Err("it has annotations, which the form doesn't show".into());
    }
    let effect = match est["effect"].as_str() {
        Some("forbid") => Effect::Forbid,
        Some("permit") => Effect::Permit,
        _ => return Err("it neither forbids nor permits".into()),
    };
    let p = &est["principal"];
    let who = match (p["op"].as_str(), p.get("entity")) {
        (Some("All"), _) => Who::Anyone,
        (Some("in"), Some(e)) if entity(e, "Role").is_some() => Who::Role(entity(e, "Role").unwrap().into()),
        (Some("=="), Some(e)) if entity(e, "Account").is_some() => Who::Account(entity(e, "Account").unwrap().into()),
        _ => return Err("its who is not anyone, a role's holders or one account".into()),
    };
    let r = &est["resource"];
    let place = match (r["op"].as_str(), r.get("entity")) {
        (Some("All"), _) => Where::Everywhere,
        (Some("in"), Some(e)) if entity(e, "Scope").is_some() => Where::Place(entity(e, "Scope").unwrap().into()),
        _ => return Err("its where is not everywhere or one place".into()),
    };
    // What it is about, grouped by system in the order first named.
    let mut doing: Vec<Doing> = vec![];
    for a in named_actions(&est)? {
        let (system, every) = if SYSTEMS.contains(&a.as_str()) {
            (a.clone(), true)
        } else {
            (system_of(&a).ok_or_else(|| format!("{a} is not an action any system declares"))?.to_string(), false)
        };
        match (doing.iter_mut().find(|d| d.system == system), every) {
            (None, true) => doing.push(Doing { system, pick: Pick::Every { except: vec![] } }),
            (None, false) => doing.push(Doing { system, pick: Pick::These { verbs: vec![a] } }),
            (Some(Doing { pick: Pick::These { verbs }, .. }), false) => verbs.push(a),
            (Some(_), _) => return Err(format!("it names every {system} action and some of them as well")),
        }
    }
    let mut unless = vec![];
    let conditions = est["conditions"].as_array().cloned().unwrap_or_default();
    match conditions.as_slice() {
        [] => {}
        [c] if c["kind"] == "unless" => {
            let mut parts = vec![];
            ors(&c["body"], &mut parts);
            for part in parts {
                let context_field = part.get(".").filter(|d| d["left"]["Var"] == "context").and_then(|d| d["attr"].as_str());
                let principal_in = part.get("in").filter(|d| d["left"]["Var"] == "principal").and_then(|d| entity(&d["right"]["Value"]["__entity"], "Role"));
                let action_is = part.get("==").filter(|d| d["left"]["Var"] == "action").and_then(|d| entity(&d["right"]["Value"]["__entity"], "Action"));
                match (context_field, principal_in, action_is) {
                    (Some("fresh_signature"), ..) => unless.push(Condition::FreshTouch),
                    (_, Some(role), _) => unless.push(Condition::Holds(role.into())),
                    (_, _, Some(verb)) => {
                        let system = system_of(verb).ok_or_else(|| format!("{verb} is not an action any system declares"))?;
                        match doing.iter_mut().find(|d| d.system == system) {
                            Some(Doing { pick: Pick::Every { except }, .. }) => except.push(verb.into()),
                            _ => return Err(format!("it excepts {verb}, but is not about every {system} action")),
                        }
                    }
                    _ => return Err("its \"unless\" says something the form can't: only a fresh touch, holding a role, or one action".into()),
                }
            }
        }
        [_] => return Err("it has a \"when\", which the form doesn't show".into()),
        _ => return Err("it has more than one condition".into()),
    }
    let form = RuleForm { effect, who, doing, place, unless };
    // The proof: the Cedar written from the form means exactly what is stored.
    let written = write_rule(&form).map_err(|e| format!("the form can't write it again: {e}"))?;
    if canonical(est_of_policy(&written)?) != canonical(est) {
        return Err("the form would change what it means".into());
    }
    Ok(form)
}

/// Reads a role into the form. `Err` says why it is written by hand.
pub fn read_role(system: &str, cedar: &str) -> Result<RoleForm, String> {
    let template = Template::parse(Some(PolicyId::new("role")), cedar).map_err(|e| format!("it is not one Cedar template: {e}"))?;
    let est = template.to_json().map_err(|e| e.to_string())?;
    let plain_role = est["effect"] == "permit"
        && est["principal"] == json!({"op": "==", "slot": "?principal"})
        && est["resource"] == json!({"op": "in", "slot": "?resource"})
        && est["conditions"].as_array().is_none_or(|c| c.is_empty())
        && est.get("annotations").is_none_or(|a| a.as_object().is_some_and(|o| o.is_empty()));
    if !plain_role {
        return Err("it is more than a list of actions with blanks for who and where".into());
    }
    let named = named_actions(&est)?;
    let pick = if named == [system] {
        Pick::Every { except: vec![] }
    } else {
        Pick::These { verbs: named }
    };
    let form = Doing { system: system.into(), pick };
    let written = write_role(&form).map_err(|e| format!("the form can't write it again: {e}"))?;
    let again = Template::parse(Some(PolicyId::new("role")), &written).map_err(|e| e.to_string())?.to_json().map_err(|e| e.to_string())?;
    if canonical(again) != canonical(est) {
        return Err("the form would change what it means".into());
    }
    Ok(form)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data(path: &str) -> Value {
        let file = format!("{}/../../data/gov/{path}", env!("CARGO_MANIFEST_DIR"));
        serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap()
    }

    #[test]
    fn every_rule_and_role_today_goes_to_the_form_and_back_unchanged() {
        for rule in ["rules/fresh-touch.json", "rules/owners-approve-gov.json"] {
            let cedar = data(rule)["spec"]["cedar"].as_str().unwrap().to_string();
            let form = read_rule(&cedar).unwrap_or_else(|e| panic!("{rule}: {e}"));
            assert_eq!(write_rule(&form).unwrap(), cedar, "{rule}");
        }
        for role in ["roles/maintainer.json", "roles/owner.json"] {
            let spec = data(role)["spec"].clone();
            let (system, cedar) = (spec["system"].as_str().unwrap(), spec["cedar"].as_str().unwrap());
            let form = read_role(system, cedar).unwrap_or_else(|e| panic!("{role}: {e}"));
            assert_eq!(form.pick, Pick::Every { except: vec![] });
            assert_eq!(write_role(&form).unwrap(), cedar, "{role}");
        }
    }

    #[test]
    fn the_fresh_touch_rule_reads_as_its_five_parts() {
        let form = read_rule(data("rules/fresh-touch.json")["spec"]["cedar"].as_str().unwrap()).unwrap();
        assert_eq!(
            serde_json::to_value(&form).unwrap(),
            json!({
                "effect": "forbid",
                "who": "anyone",
                "doing": [
                    {"system": "mero", "pick": "these", "verbs": ["review"]},
                    {"system": "governance", "pick": "every", "except": ["view"]},
                ],
                "where": "everywhere",
                "unless": ["fresh-touch"],
            })
        );
        let owners = read_rule(data("rules/owners-approve-gov.json")["spec"]["cedar"].as_str().unwrap()).unwrap();
        assert_eq!(owners.place, Where::Place("noi.gov".into()));
        assert_eq!(owners.unless, vec![Condition::Holds("owner".into())]);
    }

    #[test]
    fn the_same_meaning_written_differently_still_reads() {
        let form = read_rule(
            r#"forbid (principal, action in [Action::"governance", Action::"review"], resource)
               unless { action == Action::"view" || context.fresh_signature };"#,
        )
        .unwrap();
        assert_eq!(form.unless, vec![Condition::FreshTouch]);
        assert!(form.doing.contains(&Doing { system: "governance".into(), pick: Pick::Every { except: vec!["view".into()] } }));
        let one = read_rule(r#"permit (principal in Role::"owner", action in [Action::"read"], resource in Scope::"noi.eio");"#).unwrap();
        assert_eq!(one.doing, vec![Doing { system: "mero".into(), pick: Pick::These { verbs: vec!["read".into()] } }]);
        assert_eq!(one.who, Who::Role("owner".into()));
    }

    #[test]
    fn what_the_form_cannot_say_is_written_by_hand() {
        for (cedar, why) in [
            (r#"forbid (principal, action, resource);"#, "names no actions"),
            (r#"forbid (principal, action == Action::"review", resource) when { context.fresh_signature };"#, "when"),
            (r#"forbid (principal, action == Action::"review", resource) unless { !context.fresh_signature };"#, "can't"),
            (r#"forbid (principal, action == Action::"review", resource) unless { action == Action::"read" };"#, "not about every mero action"),
            (r#"@id("x") forbid (principal, action == Action::"review", resource);"#, "annotations"),
            (r#"forbid (principal is Account, action == Action::"review", resource);"#, "who"),
            (r#"permit (principal == ?principal, action == Action::"read", resource in ?resource);"#, "blanks"),
            ("not cedar", "not one Cedar policy"),
        ] {
            let e = read_rule(cedar).unwrap_err();
            assert!(e.contains(why), "{cedar}: {e}");
        }
        assert!(read_role("mero", r#"permit (principal == ?principal, action in Action::"mero", resource in ?resource) when { context.fresh_signature };"#).is_err());
    }

    #[test]
    fn the_form_refuses_what_makes_no_sense() {
        let rule = |doing: Vec<Doing>, who: Who, place: Where| RuleForm { effect: Effect::Forbid, who, doing, place, unless: vec![] };
        let review = || Doing { system: "mero".into(), pick: Pick::These { verbs: vec!["review".into()] } };
        assert!(write_rule(&rule(vec![], Who::Anyone, Where::Everywhere)).unwrap_err().contains("at least one action"));
        let made_up = Doing { system: "mero".into(), pick: Pick::These { verbs: vec!["fly".into()] } };
        assert!(write_rule(&rule(vec![made_up], Who::Anyone, Where::Everywhere)).unwrap_err().contains("fly is not an action mero declares"));
        assert!(write_rule(&rule(vec![review()], Who::Role("owner\" || true".into()), Where::Everywhere)).unwrap_err().contains("plain name"));
        assert!(write_rule(&rule(vec![review()], Who::Anyone, Where::Place("noi\"".into()))).unwrap_err().contains("plain name"));
        assert!(write_rule(&rule(vec![review()], Who::Account("hiddenstack".into()), Where::Everywhere)).unwrap_err().contains("account's ID"));
        assert!(write_rule(&rule(vec![review(), review()], Who::Anyone, Where::Everywhere)).unwrap_err().contains("twice"));
        let all_but_nothing = Doing { system: "governance".into(), pick: Pick::Every { except: crate::GOVERNANCE_ACTIONS.iter().map(|s| s.to_string()).collect() } };
        assert!(write_rule(&rule(vec![all_but_nothing], Who::Anyone, Where::Everywhere)).unwrap_err().contains("nothing is left"));
        let role = Doing { system: "governance".into(), pick: Pick::Every { except: vec!["view".into()] } };
        assert!(write_role(&role).unwrap_err().contains("untick"));
        let some = Doing { system: "mero".into(), pick: Pick::These { verbs: vec!["read".into(), "propose".into()] } };
        assert_eq!(
            write_role(&some).unwrap(),
            "permit (\n  principal == ?principal,\n  action in [Action::\"read\",\n             Action::\"propose\"],\n  resource in ?resource\n);"
        );
        let account = Uuid::new_v4().to_string();
        let one = write_rule(&rule(vec![review()], Who::Account(account.clone()), Where::Everywhere)).unwrap();
        assert_eq!(read_rule(&one).unwrap().who, Who::Account(account));
    }

    #[test]
    fn no_verb_belongs_to_two_systems() {
        let all: Vec<&str> = verbs().into_iter().flat_map(|(_, v)| v).collect();
        let mut unique = all.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(all.len(), unique.len(), "a verb in two systems would make reading a rule ambiguous");
        assert!(SYSTEMS.iter().all(|s| !all.contains(s)), "a system's name is not a verb");
    }
}
