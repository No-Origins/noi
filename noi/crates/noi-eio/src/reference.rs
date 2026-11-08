//! The reference check: a role-layer token points at one token of a given kind, such as a spacing
//! role at a scale step. Later groups (shape, motion, layout) reuse it with their own parameters.
use serde::Deserialize;
use serde_json::Value;

/// The check Eidos role invariants ask the registry to run when a role is a plain reference.
pub const REFERENCE_CHECK: &str = "eio.reference";

/// Which spec field holds the path, and which token subtype it must point at.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReferenceParams {
    pub field: String,
    pub subtype: String,
}
impl ReferenceParams {
    pub fn parse(params: &Value) -> Result<Self, String> {
        let p: Self = serde_json::from_value(params.clone())
            .map_err(|e| format!("invalid {REFERENCE_CHECK} parameters: {e}"))?;
        let word = |s: &str| {
            s.starts_with(|c: char| c.is_ascii_lowercase())
                && s.len() <= 80
                && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        };
        if !word(&p.field) || !word(&p.subtype) {
            return Err(format!(
                "{REFERENCE_CHECK} needs a field and a subtype, each a lowercase word"
            ));
        }
        Ok(p)
    }
    /// The path the spec points at.
    pub fn path<'a>(&self, spec: &'a Value) -> Result<&'a str, String> {
        spec[&self.field]
            .as_str()
            .ok_or_else(|| format!("{} must be a path", self.field))
    }
}

/// The reference check: the path in the spec's field names a usable token of the given subtype.
/// `usable` answers only for admitted tokens of that subtype.
pub fn check_reference(
    spec: &Value,
    params: &Value,
    usable: &dyn Fn(&str) -> bool,
) -> Result<(), String> {
    let p = ReferenceParams::parse(params)?;
    let path = p.path(spec)?;
    if usable(path) {
        Ok(())
    } else {
        Err(format!("{path} is not a usable {} token", p.subtype))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn params() -> Value {
        json!({"field":"ref","subtype":"space"})
    }
    fn steps(path: &str) -> bool {
        path == "noi.eio.space.scale.px16"
    }
    #[test]
    fn a_role_must_point_at_a_usable_token() {
        check_reference(
            &json!({"ref":"noi.eio.space.scale.px16"}),
            &params(),
            &steps,
        )
        .unwrap();
        let error = check_reference(
            &json!({"ref":"noi.eio.space.scale.px20"}),
            &params(),
            &steps,
        )
        .unwrap_err();
        assert_eq!(
            error,
            "noi.eio.space.scale.px20 is not a usable space token"
        );
        let error = check_reference(&json!({"ref":16}), &params(), &steps).unwrap_err();
        assert_eq!(error, "ref must be a path");
    }
    #[test]
    fn parameters_name_a_field_and_a_subtype() {
        assert_eq!(ReferenceParams::parse(&params()).unwrap().subtype, "space");
        assert!(ReferenceParams::parse(&json!({"field":"ref"})).is_err());
        assert!(ReferenceParams::parse(&json!({"field":"ref","subtype":""})).is_err());
        assert!(ReferenceParams::parse(&json!({"field":"Ref","subtype":"space"})).is_err());
        assert!(
            ReferenceParams::parse(&json!({"field":"ref","subtype":"space","extra":1})).is_err()
        );
    }
}
