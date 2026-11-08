//! Named invariant checks. Invariants stores each check's name and parameters; the registry runs it.
//! Today there are five, all pure functions: in `noi-eio`, the Eidos color-role check, the Eidos
//! text-style check, and the reference check that role tokens such as spacing roles use; in
//! `noi-gov`, the role and rule checks, which read Cedar against the actions each system declares.
use crate::{admitted, applicable_invariants, load, resolve, Error, Result};
use noi_eio::{
    FontSpec, Oklch, ReferenceParams, Resolved, RoleParams, RoleSpec, SizeSpec, StyleSpec,
    TypeParams, TypeResolved, COLOR_ROLE_CHECK, REFERENCE_CHECK, TEXT_STYLE_CHECK,
};
use noi_gov::{ROLE_CHECK, RULE_CHECK};
use noi_inv::{InvariantSpec, Meron, MeronType, RevisionRef, ValidationError};
use serde_json::{json, Value};
use sqlx::PgConnection;
use std::collections::{BTreeMap, HashMap};
use uuid::Uuid;

/// The Governance checks need nothing but the meron's own spec.
fn no_params(check: &str, params: &Value) -> std::result::Result<(), String> {
    if params.as_object().is_some_and(|p| p.is_empty()) {
        Ok(())
    } else {
        Err(format!("{check} takes no parameters"))
    }
}

/// Refuses an invariant naming a check this registry cannot run, or giving it bad parameters.
pub(crate) fn validate(invariant: &InvariantSpec) -> Result<()> {
    for check in &invariant.checks {
        match check.name.as_str() {
            COLOR_ROLE_CHECK => RoleParams::parse(&check.params).map(|_| ()),
            TEXT_STYLE_CHECK => TypeParams::parse(&check.params).map(|_| ()),
            REFERENCE_CHECK => ReferenceParams::parse(&check.params).map(|_| ()),
            ROLE_CHECK | RULE_CHECK => no_params(&check.name, &check.params),
            other => Err(format!("unknown invariant check {other}")),
        }
        .map_err(ValidationError)?;
    }
    Ok(())
}

/// What running a meron's named checks found.
#[derive(Default)]
pub(crate) struct Outcome {
    /// For history: each check with its invariant revision and every meron revision it read,
    /// so any past check can be re-run.
    pub records: Vec<Value>,
    /// Merons the checked spec refers to directly. The meron depends on exactly these.
    pub references: BTreeMap<Uuid, Meron>,
}
impl Outcome {
    pub fn ran(&self) -> bool {
        !self.records.is_empty()
    }
}

fn failed(invariant: &Meron, error: String) -> Error {
    ValidationError(format!(
        "{} (revision {}): {error}",
        invariant.identity.path, invariant.revision
    ))
    .into()
}

/// Runs the named checks of `invariants` on `spec`. `overrides` stands a proposed spec in for an
/// meron's stored one, so a change is checked before it is written.
pub(crate) async fn run(
    conn: &mut PgConnection,
    spec: &Value,
    invariants: &[Meron],
    overrides: &HashMap<Uuid, Value>,
) -> Result<Outcome> {
    let mut outcome = Outcome::default();
    for invariant in invariants {
        for check in InvariantSpec::parse(&invariant.spec)?.checks {
            let mut read = BTreeMap::new();
            match check.name.as_str() {
                COLOR_ROLE_CHECK => {
                    color_role(
                        conn,
                        spec,
                        &check.params,
                        overrides,
                        &mut read,
                        &mut outcome,
                    )
                    .await?
                }
                TEXT_STYLE_CHECK => {
                    text_style(
                        conn,
                        spec,
                        &check.params,
                        overrides,
                        &mut read,
                        &mut outcome,
                    )
                    .await?
                }
                REFERENCE_CHECK => {
                    reference(conn, spec, &check.params, &mut read, &mut outcome).await?
                }
                ROLE_CHECK => noi_gov::check_role(spec),
                RULE_CHECK => noi_gov::check_rule(spec),
                other => Err(format!("unknown invariant check {other}")),
            }
            .map_err(|e| failed(invariant, e))?;
            let read: Vec<RevisionRef> = read
                .into_iter()
                .map(|(uid, revision)| RevisionRef { uid, revision })
                .collect();
            outcome.records.push(json!({
                "check": check.name,
                "invariant": RevisionRef { uid: invariant.identity.uid, revision: invariant.revision },
                "read": read,
            }));
        }
    }
    Ok(outcome)
}

/// The color-role check: resolves the role's palette colors and the surfaces it is read on.
/// The outer error is the registry's; the inner one is the check's verdict.
async fn color_role(
    conn: &mut PgConnection,
    spec: &Value,
    params: &Value,
    overrides: &HashMap<Uuid, Value>,
    read: &mut BTreeMap<Uuid, i64>,
    outcome: &mut Outcome,
) -> Result<std::result::Result<(), String>> {
    let refs = match RoleSpec::parse(spec) {
        Ok(role) => role.references(),
        Err(e) => return Ok(Err(e)),
    };
    let mut lookup = HashMap::new();
    for path in &refs.palette {
        if let Some((e, color)) = palette(conn, path, overrides).await? {
            lookup.insert(path.clone(), Resolved::Palette(color));
            read.insert(e.identity.uid, e.revision);
            outcome.references.insert(e.identity.uid, e);
        }
    }
    for path in &refs.against {
        if let Some((e, resolved, used)) = surface(conn, path, overrides).await? {
            lookup.insert(path.clone(), resolved);
            read.extend(used.iter().map(|u| (u.identity.uid, u.revision)));
            read.insert(e.identity.uid, e.revision);
            outcome.references.insert(e.identity.uid, e);
        }
    }
    Ok(noi_eio::check_role(spec, params, &|p| {
        lookup.get(p).copied()
    }))
}
/// The text-style check: resolves the style's fonts and size step.
async fn text_style(
    conn: &mut PgConnection,
    spec: &Value,
    params: &Value,
    overrides: &HashMap<Uuid, Value>,
    read: &mut BTreeMap<Uuid, i64>,
    outcome: &mut Outcome,
) -> Result<std::result::Result<(), String>> {
    let refs = match StyleSpec::parse(spec) {
        Ok(style) => style.references(),
        Err(e) => return Ok(Err(e)),
    };
    let mut lookup = HashMap::new();
    for path in &refs.fonts {
        if let Some(e) = typed(conn, path, "font-family").await? {
            let font = FontSpec::parse(spec_of(&e, overrides))
                .map_err(|error| ValidationError(format!("{path}: {error}")))?;
            lookup.insert(path.clone(), TypeResolved::Font(font));
            read.insert(e.identity.uid, e.revision);
            outcome.references.insert(e.identity.uid, e);
        }
    }
    if let Some(e) = typed(conn, &refs.size, "font-size").await? {
        let size = SizeSpec::parse(spec_of(&e, overrides))
            .map_err(|error| ValidationError(format!("{}: {error}", refs.size)))?;
        lookup.insert(refs.size.clone(), TypeResolved::Size(size));
        read.insert(e.identity.uid, e.revision);
        outcome.references.insert(e.identity.uid, e);
    }
    Ok(noi_eio::check_text_style(spec, params, &|p| {
        lookup.get(p).cloned()
    }))
}

/// The reference check: resolves the one path the role points at.
async fn reference(
    conn: &mut PgConnection,
    spec: &Value,
    params: &Value,
    read: &mut BTreeMap<Uuid, i64>,
    outcome: &mut Outcome,
) -> Result<std::result::Result<(), String>> {
    let p = match ReferenceParams::parse(params) {
        Ok(p) => p,
        Err(e) => return Ok(Err(e)),
    };
    let target = match p.path(spec) {
        Ok(path) => typed(conn, path, &p.subtype).await?,
        Err(e) => return Ok(Err(e)),
    };
    let found = target.is_some();
    if let Some(e) = target {
        read.insert(e.identity.uid, e.revision);
        outcome.references.insert(e.identity.uid, e);
    }
    Ok(noi_eio::check_reference(spec, params, &|_| found))
}

/// Re-runs the named checks of admitted merons that read a changed meron, with its proposed spec.
pub(crate) async fn recheck(
    conn: &mut PgConnection,
    dependents: &[Uuid],
    overrides: &HashMap<Uuid, Value>,
) -> Result<Vec<RevisionRef>> {
    let mut rechecked = vec![];
    for uid in dependents {
        let e = load(conn, *uid).await?;
        if !admitted(e.lifecycle.state) || e.classification.kind == MeronType::Invariant {
            continue;
        }
        let invariants = applicable_invariants(conn, &e.classification).await?;
        let outcome = run(conn, spec_of(&e, overrides), &invariants, overrides)
            .await
            .map_err(|error| match error {
                Error::Validation(v) => {
                    ValidationError(format!("{} would fail: {}", e.identity.path, v.0)).into()
                }
                other => other,
            })?;
        if outcome.ran() {
            rechecked.push(RevisionRef {
                uid: e.identity.uid,
                revision: e.revision,
            });
        }
    }
    Ok(rechecked)
}

fn spec_of<'a>(e: &'a Meron, overrides: &'a HashMap<Uuid, Value>) -> &'a Value {
    overrides.get(&e.identity.uid).unwrap_or(&e.spec)
}
fn is_token(e: &Meron, subtype: &str) -> bool {
    e.classification.kind == MeronType::Token
        && e.classification.subtype.as_deref() == Some(subtype)
}
/// Only admitted merons can be relied on; a draft or retired one reads as missing.
async fn usable(conn: &mut PgConnection, path: &str) -> Result<Option<Meron>> {
    match resolve(conn, path).await {
        Ok(e) if admitted(e.lifecycle.state) => Ok(Some(e)),
        Ok(_) | Err(Error::NotFound) => Ok(None),
        Err(e) => Err(e),
    }
}
/// A usable token of one subtype; anything else at the path reads as missing.
async fn typed(conn: &mut PgConnection, path: &str, subtype: &str) -> Result<Option<Meron>> {
    Ok(usable(conn, path).await?.filter(|e| is_token(e, subtype)))
}
async fn palette(
    conn: &mut PgConnection,
    path: &str,
    overrides: &HashMap<Uuid, Value>,
) -> Result<Option<(Meron, Oklch)>> {
    let Some(e) = typed(conn, path, "color").await? else {
        return Ok(None);
    };
    let color = Oklch::from_palette_spec(spec_of(&e, overrides))
        .map_err(|error| ValidationError(format!("{path}: {error}")))?;
    Ok(Some((e, color)))
}
/// A surface is a palette color or another color role, resolved in both themes. Also returns
/// the palette colors a role surface was resolved through.
async fn surface(
    conn: &mut PgConnection,
    path: &str,
    overrides: &HashMap<Uuid, Value>,
) -> Result<Option<(Meron, Resolved, Vec<Meron>)>> {
    if let Some((e, color)) = palette(conn, path, overrides).await? {
        return Ok(Some((e, Resolved::Palette(color), vec![])));
    }
    let Some(e) = usable(conn, path).await? else {
        return Ok(None);
    };
    if !is_token(&e, "color-role") {
        return Ok(None);
    }
    let role = RoleSpec::parse(spec_of(&e, overrides))
        .map_err(|error| ValidationError(format!("{path}: {error}")))?;
    let (mut colors, mut used) = (HashMap::new(), vec![]);
    for p in role.references().palette {
        if let Some((pe, color)) = palette(conn, &p, overrides).await? {
            colors.insert(p, color);
            used.push(pe);
        }
    }
    let (light, dark) = role
        .colors(&|p| colors.get(p).copied())
        .map_err(|error| ValidationError(format!("{path}: {error}")))?;
    Ok(Some((e, Resolved::Role { light, dark }, used)))
}
