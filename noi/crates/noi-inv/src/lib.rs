//! Invariants invariants: structure and conformance, without governance decisions.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fmt, str::FromStr};
use uuid::Uuid;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
#[error("{0}")]
pub struct ValidationError(pub String);
pub type Result<T> = std::result::Result<T, ValidationError>;

macro_rules! vocabulary {
    ($name:ident { $($variant:ident => $value:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        pub enum $name { $(#[serde(rename=$value)] $variant),+ }
        impl $name { pub fn as_str(self) -> &'static str { match self { $(Self::$variant => $value),+ } } }
        impl fmt::Display for $name { fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { f.write_str(self.as_str()) } }
        impl FromStr for $name { type Err = ValidationError; fn from_str(s: &str) -> Result<Self> { match s { $($value => Ok(Self::$variant),)+ _ => Err(ValidationError(format!("unknown {}: {s}", stringify!($name)))) } } }
    }
}
vocabulary!(MeronType { System => "system", Agent => "agent", Component => "component", Token => "token", Rule => "rule", Invariant => "invariant", Document => "document" });
vocabulary!(MeronState { Proposed => "proposed", Registered => "registered", Active => "active", Deprecated => "deprecated", Retired => "retired" });
vocabulary!(ReleaseState { Planned => "planned", Experimental => "experimental", Stable => "stable", Deprecated => "deprecated", Unsupported => "unsupported" });
vocabulary!(ReleaseMode { Inherited => "inherited", Independent => "independent" });
vocabulary!(Predicate { Contains => "contains", DependsOn => "depends-on", Implements => "implements", Represents => "represents", GovernedBy => "governed-by" });
vocabulary!(Impact { NonBreaking => "non-breaking", Breaking => "breaking", Unknown => "unknown" });

impl MeronState {
    /// Forward one step at a time, and one way back: a deprecated meron may be reinstated to
    /// active (agreed 8 Nov; the first design's "reinstatement"). Retired stays final.
    pub fn can_transition(self, next: Self) -> bool {
        matches!(
            (self, next),
            (Self::Proposed, Self::Registered)
                | (Self::Registered, Self::Active)
                | (Self::Active, Self::Deprecated)
                | (Self::Deprecated, Self::Retired)
                | (Self::Deprecated, Self::Active)
        )
    }
}
impl ReleaseState {
    pub fn can_transition(self, next: Self) -> bool {
        matches!(
            (self, next),
            (Self::Planned, Self::Experimental)
                | (Self::Experimental, Self::Stable)
                | (Self::Stable, Self::Deprecated)
                | (Self::Deprecated, Self::Unsupported)
        )
    }
}
pub fn validate_path(path: &str) -> Result<()> {
    if path.len() > 240 || !(path == "noi" || path.starts_with("noi.")) {
        return Err(ValidationError(
            "canonical path must be in noi and at most 240 bytes".into(),
        ));
    }
    for part in path.split('.') {
        if part.is_empty()
            || part.len() > 63
            || !part.as_bytes()[0].is_ascii_lowercase()
            || !part
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
            || part.ends_with('-')
            || part.contains("--")
        {
            return Err(ValidationError(format!(
                "invalid namespace segment: {part}"
            )));
        }
    }
    Ok(())
}
pub fn nonblank(label: &str, text: &str, max: usize) -> Result<()> {
    if text.trim().is_empty() || text.len() > max || text.contains('\0') {
        Err(ValidationError(format!(
            "{label} must contain 1..{max} bytes of nonblank text"
        )))
    } else {
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Classification {
    #[serde(rename = "type")]
    pub kind: MeronType,
    pub subtype: Option<String>,
    #[serde(default)]
    pub roles: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Semantics {
    pub definition: String,
    pub responsibility: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewMeron {
    pub path: String,
    pub name: String,
    pub classification: Classification,
    pub semantics: Semantics,
    #[serde(default = "inherited")]
    pub release_mode: ReleaseMode,
    /// Structural reference only. Governance interprets the scope and resolves authority.
    pub authority_scope: Option<Uuid>,
    /// Free-form notes. Invariants never checks their meaning and products never rely on them.
    #[serde(default = "empty_object")]
    pub metadata: Value,
    /// Checked content, shaped by every invariant that applies to the meron.
    #[serde(default = "empty_object")]
    pub spec: Value,
}
fn inherited() -> ReleaseMode {
    ReleaseMode::Inherited
}
fn empty_object() -> Value {
    serde_json::json!({})
}
impl NewMeron {
    pub fn validate(&self) -> Result<()> {
        validate_path(&self.path)?;
        nonblank("name", &self.name, 200)?;
        nonblank("definition", &self.semantics.definition, 8000)?;
        nonblank("responsibility", &self.semantics.responsibility, 8000)?;
        if let Some(s) = &self.classification.subtype {
            nonblank("subtype", s, 80)?;
        }
        if self.classification.roles.len() > 32 {
            return Err(ValidationError("too many roles".into()));
        }
        let mut seen = std::collections::HashSet::new();
        for role in &self.classification.roles {
            nonblank("role", role, 80)?;
            if !seen.insert(role) {
                return Err(ValidationError("duplicate role".into()));
            }
        }
        if !self.metadata.is_object() || self.metadata.to_string().len() > 65536 {
            return Err(ValidationError(
                "metadata must be an object <=64 KiB".into(),
            ));
        }
        if !self.spec.is_object() || self.spec.to_string().len() > 65536 {
            return Err(ValidationError("spec must be an object <=64 KiB".into()));
        }
        Ok(())
    }
}

const SCHEMA_DIALECT: &str = "https://json-schema.org/draft/2020-12/schema";
/// An invariant meron's own `spec`. These rules are built into Invariants: invariants never govern invariants.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct InvariantSpec {
    pub applies_to: Applicability,
    /// JSON Schema (2020-12) that the `spec` of every covered meron must satisfy.
    pub schema: Value,
    /// Further checks a schema cannot express, such as Eidos contrast. Invariants stores only their
    /// names and parameters; the registry runs them and refuses names it does not know.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub checks: Vec<NamedCheck>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct NamedCheck {
    pub name: String,
    #[serde(default = "empty_object")]
    pub params: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Applicability {
    #[serde(rename = "type")]
    pub kind: MeronType,
    /// None covers every subtype of the type.
    pub subtype: Option<String>,
}
impl Applicability {
    pub fn covers(&self, classification: &Classification) -> bool {
        self.kind == classification.kind
            && self
                .subtype
                .as_ref()
                .is_none_or(|s| classification.subtype.as_ref() == Some(s))
    }
}
impl InvariantSpec {
    pub fn parse(spec: &Value) -> Result<Self> {
        let invariant: Self = serde_json::from_value(spec.clone())
            .map_err(|e| ValidationError(format!("invalid invariant spec: {e}")))?;
        if invariant.applies_to.kind == MeronType::Invariant {
            return Err(ValidationError(
                "invariants cannot apply to invariants; Invariants defines invariant rules".into(),
            ));
        }
        if let Some(subtype) = &invariant.applies_to.subtype {
            nonblank("applies_to subtype", subtype, 80)?;
        }
        if !invariant.schema.is_object() {
            return Err(ValidationError(
                "invariant schema must be a JSON Schema object".into(),
            ));
        }
        self_contained(&invariant.schema)?;
        invariant.validator()?;
        if invariant.checks.len() > 16 {
            return Err(ValidationError("too many invariant checks".into()));
        }
        let mut names = std::collections::HashSet::new();
        for check in &invariant.checks {
            nonblank("check name", &check.name, 80)?;
            if !check.params.is_object() || !names.insert(&check.name) {
                return Err(ValidationError(format!(
                    "check {} needs object parameters and may appear once",
                    check.name
                )));
            }
        }
        Ok(invariant)
    }
    fn validator(&self) -> Result<jsonschema::Validator> {
        jsonschema::validator_for(&self.schema)
            .map_err(|e| ValidationError(format!("invalid invariant schema: {e}")))
    }
    /// Reports every violation at once, so one check lists everything a meron must fix.
    pub fn check(&self, spec: &Value) -> Result<()> {
        let validator = self.validator()?;
        let problems: Vec<String> = validator
            .iter_errors(spec)
            .map(|e| format!("spec{}: {e}", e.instance_path()))
            .collect();
        if problems.is_empty() {
            Ok(())
        } else {
            Err(ValidationError(problems.join("; ")))
        }
    }
}
/// A check reads only the meron and the invariant, so re-running it always gives the same answer.
/// Schemas therefore cannot reach outside themselves.
fn self_contained(schema: &Value) -> Result<()> {
    match schema {
        Value::Object(map) => map.iter().try_for_each(|(key, value)| match key.as_str() {
            "$ref" | "$dynamicRef" if !value.as_str().is_some_and(|r| r.starts_with('#')) => {
                Err(ValidationError(format!(
                    "invariant schema {key} must be local (start with #)"
                )))
            }
            "$schema" if value.as_str() != Some(SCHEMA_DIALECT) => Err(ValidationError(format!(
                "invariant schema $schema must be {SCHEMA_DIALECT}"
            ))),
            _ => self_contained(value),
        }),
        Value::Array(items) => items.iter().try_for_each(self_contained),
        _ => Ok(()),
    }
}
/// One meron revision, recorded in history when it is checked or checked against.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RevisionRef {
    pub uid: Uuid,
    pub revision: i64,
}
/// `spec` must pass every applicable invariant. With none, it must stay empty.
pub fn conform(spec: &Value, invariants: &[Meron]) -> Result<Vec<RevisionRef>> {
    if invariants.is_empty() {
        return if spec.as_object().is_some_and(|o| o.is_empty()) {
            Ok(vec![])
        } else {
            Err(ValidationError(
                "spec must be empty: no registered invariant applies to this type".into(),
            ))
        };
    }
    invariants
        .iter()
        .map(|c| {
            InvariantSpec::parse(&c.spec)?.check(spec).map_err(|e| {
                ValidationError(format!(
                    "{} (revision {}): {}",
                    c.identity.path, c.revision, e.0
                ))
            })?;
            Ok(RevisionRef {
                uid: c.identity.uid,
                revision: c.revision,
            })
        })
        .collect()
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Identity {
    pub uid: Uuid,
    pub path: String,
    pub name: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lifecycle {
    pub state: MeronState,
    pub release_mode: ReleaseMode,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meron {
    pub identity: Identity,
    pub classification: Classification,
    pub semantics: Semantics,
    pub lifecycle: Lifecycle,
    pub authority_scope: Uuid,
    pub metadata: Value,
    /// Absent from events recorded before merons had a spec.
    #[serde(default = "empty_object")]
    pub spec: Value,
    pub revision: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relationship {
    pub uid: Uuid,
    pub source: Uuid,
    pub predicate: Predicate,
    pub target: Uuid,
    pub created_at: DateTime<Utc>,
}
pub fn validate_relationship(source: &Meron, predicate: Predicate, target: &Meron) -> Result<()> {
    if source.identity.uid == target.identity.uid {
        return Err(ValidationError("self relationships are forbidden".into()));
    }
    if source.lifecycle.state == MeronState::Retired
        || target.lifecycle.state == MeronState::Retired
    {
        return Err(ValidationError(
            "retired merons cannot acquire relationships".into(),
        ));
    }
    let valid = match predicate {
        Predicate::Contains => source.classification.kind == MeronType::System,
        Predicate::Implements => target.classification.kind == MeronType::Invariant,
        Predicate::Represents => {
            source.classification.kind == MeronType::Document
                && target.classification.kind == MeronType::Invariant
        }
        Predicate::GovernedBy => {
            target.classification.kind == MeronType::System && target.identity.path == "noi.gov"
        }
        Predicate::DependsOn => true,
    };
    if !valid {
        return Err(ValidationError(format!(
            "invalid endpoint types for {predicate}"
        )));
    }
    Ok(())
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Release {
    pub uid: Uuid,
    pub meron_uid: Uuid,
    pub generation: i32,
    pub version: String,
    pub state: ReleaseState,
    pub justification: String,
    pub revision: i64,
    pub created_at: DateTime<Utc>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompatibilityEvidence {
    pub impact: Impact,
    pub rationale: String,
    /// Invariant evaluations supplied by a caller, never an automatic compatibility claim.
    pub invariant_checks: Vec<String>,
    /// Explicit consumer migration consideration, including a justified no-migration decision.
    #[serde(default)]
    pub migration_plan: Option<String>,
}
impl CompatibilityEvidence {
    pub fn validate(&self) -> Result<()> {
        nonblank("compatibility rationale", &self.rationale, 8000)?;
        if self.impact != Impact::NonBreaking && self.migration_plan.is_none() {
            return Err(ValidationError(
                "breaking or unknown impact requires an explicit migration plan".into(),
            ));
        }
        if let Some(plan) = &self.migration_plan {
            nonblank("migration plan", plan, 8000)?;
        }
        if self.impact == Impact::NonBreaking && self.invariant_checks.is_empty() {
            return Err(ValidationError(
                "non-breaking claims require explicit invariant check evidence".into(),
            ));
        }
        if self.invariant_checks.len() > 64 {
            return Err(ValidationError("too many invariant checks".into()));
        }
        for check in &self.invariant_checks {
            nonblank("invariant check", check, 1000)?;
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub sequence: i64,
    pub meron_uid: Uuid,
    pub action: String,
    pub actor: String,
    pub authorization: Value,
    pub payload: Value,
    pub occurred_at: DateTime<Utc>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub schema_version: String,
    pub generated_at: DateTime<Utc>,
    pub merons: Vec<Meron>,
    pub relationships: Vec<Relationship>,
    pub releases: Vec<Release>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn namespace_grammar() {
        for path in [
            "noi",
            "noi.inv",
            "noi.tokens.color.text.primary",
            "noi.agents.design-evaluator",
        ] {
            validate_path(path).unwrap();
        }
        for path in [
            "no", "noivil", "noi.", "noi.Inv", "noi.a--b", "noi.a-", "noi._a", "noi.1a",
        ] {
            assert!(validate_path(path).is_err(), "{path}");
        }
    }
    #[test]
    fn lifecycle_is_forward_and_independent() {
        let states = [
            MeronState::Proposed,
            MeronState::Registered,
            MeronState::Active,
            MeronState::Deprecated,
            MeronState::Retired,
        ];
        for (i, a) in states.iter().enumerate() {
            for (j, b) in states.iter().enumerate() {
                // The one way back: reinstating a deprecated meron.
                let reinstate = *a == MeronState::Deprecated && *b == MeronState::Active;
                assert_eq!(a.can_transition(*b), j == i + 1 || reinstate);
            }
        }
        assert!(!MeronState::Retired.can_transition(MeronState::Active));
        let states = [
            ReleaseState::Planned,
            ReleaseState::Experimental,
            ReleaseState::Stable,
            ReleaseState::Deprecated,
            ReleaseState::Unsupported,
        ];
        for (i, a) in states.iter().enumerate() {
            for (j, b) in states.iter().enumerate() {
                assert_eq!(a.can_transition(*b), j == i + 1);
            }
        }
    }
    #[test]
    fn compatibility_is_never_assumed() {
        let mut evidence = CompatibilityEvidence {
            impact: Impact::NonBreaking,
            rationale: "Reviewed".into(),
            invariant_checks: vec![],
            migration_plan: None,
        };
        assert!(evidence.validate().is_err());
        evidence
            .invariant_checks
            .push("INV-001 shape preserved".into());
        evidence.validate().unwrap();
        for impact in [Impact::Breaking, Impact::Unknown] {
            evidence.impact = impact;
            evidence.migration_plan = None;
            assert!(evidence.validate().is_err());
            evidence.migration_plan = Some(" ".into());
            assert!(evidence.validate().is_err());
            evidence.migration_plan =
                Some("Review consumers before rollout; retain prior release until migrated".into());
            evidence.validate().unwrap();
        }
    }
    #[test]
    fn policy_is_a_rule_subtype() {
        assert!("policy".parse::<MeronType>().is_err());
        assert_eq!("rule".parse::<MeronType>().unwrap(), MeronType::Rule);
    }
    fn color_invariant() -> Value {
        json!({"applies_to":{"type":"token","subtype":"color"},"schema":{
            "type":"object","required":["value"],"additionalProperties":false,
            "properties":{"value":{"type":"object","required":["colorSpace","components"],"additionalProperties":false,
                "properties":{"colorSpace":{"const":"oklch"},
                    "components":{"type":"array","minItems":3,"maxItems":3,"items":{"type":"number"}},
                    "hex":{"type":"string","pattern":"^#[0-9A-Fa-f]{6}$"}}}}}})
    }
    fn invariant_meron(spec: Value) -> Meron {
        Meron {
            identity: Identity {
                uid: Uuid::new_v4(),
                path: "noi.tests.invariant".into(),
                name: "Invariant".into(),
            },
            classification: Classification {
                kind: MeronType::Invariant,
                subtype: None,
                roles: vec![],
            },
            semantics: Semantics {
                definition: "Test invariant".into(),
                responsibility: "Check token specs".into(),
            },
            lifecycle: Lifecycle {
                state: MeronState::Registered,
                release_mode: ReleaseMode::Inherited,
            },
            authority_scope: Uuid::new_v4(),
            metadata: json!({}),
            spec,
            revision: 1,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }
    #[test]
    fn invariants_are_self_contained_and_never_govern_invariants() {
        InvariantSpec::parse(&color_invariant()).unwrap();
        let mut c = color_invariant();
        c["applies_to"]["type"] = json!("invariant");
        assert!(InvariantSpec::parse(&c).is_err());
        let mut c = color_invariant();
        c["schema"]["$ref"] = json!("https://example.com/remote.json");
        assert!(InvariantSpec::parse(&c).is_err());
        let mut c = color_invariant();
        c["schema"]["$defs"] = json!({"number":{"type":"number"}});
        c["schema"]["properties"]["value"]["properties"]["components"]["items"] =
            json!({"$ref":"#/$defs/number"});
        InvariantSpec::parse(&c).unwrap();
        let mut c = color_invariant();
        c["schema"]["type"] = json!("invalid_type");
        assert!(InvariantSpec::parse(&c).is_err());
        let mut c = color_invariant();
        c["extra"] = json!(true);
        assert!(InvariantSpec::parse(&c).is_err());
    }
    #[test]
    fn invariants_can_name_further_checks() {
        assert!(InvariantSpec::parse(&color_invariant())
            .unwrap()
            .checks
            .is_empty());
        let mut c = color_invariant();
        c["checks"] = json!([{"name":"eio.color-role","params":{"minimums":{"text":4.5,"ui":3}}}]);
        let parsed = InvariantSpec::parse(&c).unwrap();
        assert_eq!(parsed.checks[0].name, "eio.color-role");
        c["checks"] = json!([{"name":"a"},{"name":"a"}]);
        assert!(InvariantSpec::parse(&c).is_err());
        c["checks"] = json!([{"name":" "}]);
        assert!(InvariantSpec::parse(&c).is_err());
        c["checks"] = json!([{"name":"a","params":[]}]);
        assert!(InvariantSpec::parse(&c).is_err());
        c["checks"] = json!([{"name":"a","extra":1}]);
        assert!(InvariantSpec::parse(&c).is_err());
    }
    #[test]
    fn spec_must_pass_every_applicable_invariant() {
        let lime = json!({"value":{"colorSpace":"oklch","components":[0.896,0.196,119.552],"hex":"#CEEE38"}});
        let color = invariant_meron(color_invariant());
        assert_eq!(
            conform(&lime, std::slice::from_ref(&color)).unwrap(),
            vec![RevisionRef {
                uid: color.identity.uid,
                revision: 1
            }]
        );
        assert!(conform(&json!({}), std::slice::from_ref(&color)).is_err());
        let srgb = json!({"value":{"colorSpace":"srgb","components":[1,1,1]}});
        assert!(conform(&srgb, std::slice::from_ref(&color)).is_err());
        // Without an applicable invariant nothing can be checked, so nothing may be stored.
        assert!(conform(&lime, &[]).is_err());
        conform(&json!({}), &[]).unwrap();
        let described = invariant_meron(
            json!({"applies_to":{"type":"token"},"schema":{"required":["description"]}}),
        );
        let error = conform(&lime, &[color, described]).unwrap_err();
        assert!(error.0.contains("description"), "{}", error.0);
        let applies = InvariantSpec::parse(&color_invariant()).unwrap().applies_to;
        let mut token = Classification {
            kind: MeronType::Token,
            subtype: Some("color".into()),
            roles: vec![],
        };
        assert!(applies.covers(&token));
        token.subtype = None;
        assert!(!applies.covers(&token));
    }
}
