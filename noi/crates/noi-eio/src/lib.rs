//! Eidos design rules as pure functions. No dependency on Invariants, Governance or storage:
//! the registry runs these when an invariant names one of their checks.
//! Color lives here; typography in `typography.rs`; the reference check in `reference.rs`;
//! the component check in `component.rs`; the token export for apps in `export.rs`.
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeSet;

mod component;
mod export;
mod reference;
mod typography;
mod write;
pub use component::*;
pub use export::*;
pub use reference::*;
pub use typography::*;
pub use write::*;

/// The check Eidos color-role invariants ask the registry to run.
pub const COLOR_ROLE_CHECK: &str = "eio.color-role";

/// A color in OKLCH: lightness 0–1, chroma 0 or more, hue in degrees.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Oklch {
    pub l: f64,
    pub c: f64,
    pub h: f64,
}
impl Oklch {
    /// Reads a palette color's checked spec: `{"value": {"colorSpace": "oklch", "components": [l, c, h]}}`.
    pub fn from_palette_spec(spec: &Value) -> Result<Self, String> {
        let value = &spec["value"];
        if value["colorSpace"] != "oklch" {
            return Err("palette color value must be OKLCH".into());
        }
        let components = value["components"]
            .as_array()
            .and_then(|c| c.iter().map(Value::as_f64).collect::<Option<Vec<_>>>());
        match components.as_deref() {
            Some(&[l, c, h]) => Ok(Self { l, c, h }),
            _ => Err("palette color needs three numeric OKLCH components".into()),
        }
    }
    /// Linear-light sRGB, clipped to the sRGB gamut (OKLab matrices by Björn Ottosson).
    fn linear_srgb(self) -> [f64; 3] {
        let (a, b) = (
            self.c * self.h.to_radians().cos(),
            self.c * self.h.to_radians().sin(),
        );
        let l = (self.l + 0.3963377774 * a + 0.2158037573 * b).powi(3);
        let m = (self.l - 0.1055613458 * a - 0.0638541728 * b).powi(3);
        let s = (self.l - 0.0894841775 * a - 1.2914855480 * b).powi(3);
        [
            4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
        ]
        .map(|v| v.clamp(0.0, 1.0))
    }
    /// WCAG 2 relative luminance.
    pub fn luminance(self) -> f64 {
        let [r, g, b] = self.linear_srgb();
        0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    /// `#RRGGBB` as normal screens show it: the same clipped sRGB value the contrast checks use.
    pub fn hex(self) -> String {
        let [r, g, b] = self.linear_srgb().map(|v| {
            let encoded = if v <= 0.0031308 {
                12.92 * v
            } else {
                1.055 * v.powf(1.0 / 2.4) - 0.055
            };
            (encoded.clamp(0.0, 1.0) * 255.0).round() as u8
        });
        format!("#{r:02X}{g:02X}{b:02X}")
    }
}

/// WCAG 2 contrast ratio: 1 for identical colors, 21 for black on white.
pub fn contrast(a: Oklch, b: Oklch) -> f64 {
    let (x, y) = (a.luminance(), b.luminance());
    (x.max(y) + 0.05) / (x.min(y) + 0.05)
}

/// `color-mix(in oklch, color percent%, over)`. A grey has no hue of its own, so the mix keeps
/// the other color's hue: lime mixed into white stays a lime tint, as in Circles.
pub fn mix(color: Oklch, percent: f64, over: Oklch) -> Oklch {
    let p = percent / 100.0;
    let h = if over.c <= 0.0 {
        color.h
    } else if color.c <= 0.0 {
        over.h
    } else {
        // Shorter way round the hue circle.
        let d = (color.h - over.h + 540.0).rem_euclid(360.0) - 180.0;
        (over.h + p * d).rem_euclid(360.0)
    };
    Oklch {
        l: over.l + p * (color.l - over.l),
        c: over.c + p * (color.c - over.c),
        h,
    }
}

/// A color role's checked spec: one value per theme, and the surfaces it must stand out from.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoleSpec {
    pub light: RoleValue,
    pub dark: RoleValue,
    #[serde(default)]
    pub contrast: Vec<Pair>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoleValue {
    /// A palette color, by path.
    Ref(String),
    /// A palette color mixed into another, like Circles' hover and highlight tints.
    Mix(Mix),
}
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Mix {
    pub color: String,
    pub percent: f64,
    pub over: String,
}
/// A surface this role is read on, in the same theme.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pair {
    pub against: String,
    pub kind: PairKind,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PairKind {
    /// Readable text and icons.
    Text,
    /// Borders and focus indicators that show where a control is.
    Ui,
}

/// Paths a role reads: palette colors for its values, and the surfaces it is checked against.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct References {
    pub palette: BTreeSet<String>,
    pub against: BTreeSet<String>,
}

impl RoleSpec {
    pub fn parse(spec: &Value) -> Result<Self, String> {
        let role: Self =
            serde_json::from_value(spec.clone()).map_err(|e| format!("invalid color role: {e}"))?;
        for value in [&role.light, &role.dark] {
            if let RoleValue::Mix(m) = value {
                if m.percent <= 0.0 || m.percent >= 100.0 {
                    return Err("a mix percent must be between 0 and 100".into());
                }
            }
        }
        Ok(role)
    }
    pub fn references(&self) -> References {
        let mut refs = References::default();
        for value in [&self.light, &self.dark] {
            match value {
                RoleValue::Ref(path) => {
                    refs.palette.insert(path.clone());
                }
                RoleValue::Mix(m) => {
                    refs.palette.insert(m.color.clone());
                    refs.palette.insert(m.over.clone());
                }
            }
        }
        refs.against = self.contrast.iter().map(|p| p.against.clone()).collect();
        refs
    }
    /// The role's color in light and dark. `palette` answers only for usable palette colors.
    pub fn colors(
        &self,
        palette: &dyn Fn(&str) -> Option<Oklch>,
    ) -> Result<(Oklch, Oklch), String> {
        let mut problems = vec![];
        let mut color = |path: &str| {
            palette(path)
                .ok_or_else(|| problems.push(format!("{path} is not a usable palette color")))
        };
        let mut resolve = |value: &RoleValue| match value {
            RoleValue::Ref(path) => color(path).ok(),
            RoleValue::Mix(m) => match (color(&m.color), color(&m.over)) {
                (Ok(c), Ok(o)) => Some(mix(c, m.percent, o)),
                _ => None,
            },
        };
        match (resolve(&self.light), resolve(&self.dark)) {
            (Some(light), Some(dark)) => Ok((light, dark)),
            _ => Err(problems.join("; ")),
        }
    }
}

/// Minimum contrast ratios, carried by the color-role invariant so only a maintainer can change them.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Minimums {
    pub text: f64,
    pub ui: f64,
}
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoleParams {
    pub minimums: Minimums,
}
impl RoleParams {
    pub fn parse(params: &Value) -> Result<Self, String> {
        let p: Self = serde_json::from_value(params.clone())
            .map_err(|e| format!("invalid {COLOR_ROLE_CHECK} parameters: {e}"))?;
        for (name, value) in [("text", p.minimums.text), ("ui", p.minimums.ui)] {
            if !(1.0..=21.0).contains(&value) {
                return Err(format!("minimum {name} contrast must be between 1 and 21"));
            }
        }
        Ok(p)
    }
}

/// What a referenced path stands for: a palette color, or another role's two theme values.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Resolved {
    Palette(Oklch),
    Role { light: Oklch, dark: Oklch },
}

/// The color-role check: every value resolves to a usable palette color, and every declared pair
/// meets its minimum in both themes. Reports every problem at once.
pub fn check_role(
    spec: &Value,
    params: &Value,
    lookup: &dyn Fn(&str) -> Option<Resolved>,
) -> Result<(), String> {
    let minimums = RoleParams::parse(params)?.minimums;
    let role = RoleSpec::parse(spec)?;
    let palette = |path: &str| match lookup(path) {
        Some(Resolved::Palette(c)) => Some(c),
        _ => None,
    };
    let (light, dark) = role.colors(&palette)?;
    let mut problems = vec![];
    for pair in &role.contrast {
        let (on_light, on_dark) = match lookup(&pair.against) {
            Some(Resolved::Palette(c)) => (c, c),
            Some(Resolved::Role { light, dark }) => (light, dark),
            None => {
                problems.push(format!(
                    "{} is not a usable color or color role",
                    pair.against
                ));
                continue;
            }
        };
        let minimum = match pair.kind {
            PairKind::Text => minimums.text,
            PairKind::Ui => minimums.ui,
        };
        for (theme, color, surface) in [("light", light, on_light), ("dark", dark, on_dark)] {
            let ratio = contrast(color, surface);
            if ratio < minimum {
                problems.push(format!(
                    "{theme}: {ratio:.2} : 1 against {}, needs {minimum} : 1",
                    pair.against
                ));
            }
        }
    }
    if problems.is_empty() {
        Ok(())
    } else {
        Err(problems.join("; "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    const LIME: Oklch = Oklch {
        l: 0.896,
        c: 0.196,
        h: 119.552,
    };
    const VIOLET: Oklch = Oklch {
        l: 0.619,
        c: 0.208,
        h: 294.842,
    };
    const fn grey(l: f64) -> Oklch {
        Oklch { l, c: 0.0, h: 0.0 }
    }
    fn near(actual: f64, expected: f64) {
        assert!((actual - expected).abs() < 0.01, "{actual} != {expected}");
    }
    #[test]
    fn contrast_matches_the_board() {
        near(contrast(LIME, grey(1.0)), 1.32);
        near(contrast(grey(0.145), LIME), 15.0);
        near(contrast(grey(0.145), VIOLET), 4.96);
        near(contrast(grey(0.985), VIOLET), 3.82);
        near(contrast(grey(0.556), grey(1.0)), 4.74);
        near(contrast(grey(0.0), grey(1.0)), 21.0);
        assert_eq!(contrast(LIME, grey(1.0)), contrast(grey(1.0), LIME));
    }
    #[test]
    fn mixing_keeps_the_brand_hue() {
        let hover = mix(LIME, 14.0, grey(1.0));
        near(hover.l, 0.9854);
        near(hover.c, 0.0274);
        assert_eq!(hover.h, LIME.h);
        // Between two hues the mix takes the shorter way round.
        let a = Oklch { h: 350.0, ..VIOLET };
        let b = Oklch { h: 10.0, ..VIOLET };
        near(mix(a, 50.0, b).h, 0.0);
    }
    #[test]
    fn palette_values_are_read_from_the_spec() {
        let lime = json!({"value":{"colorSpace":"oklch","components":[0.896,0.196,119.552],"hex":"#CEEE38"}});
        assert_eq!(Oklch::from_palette_spec(&lime).unwrap(), LIME);
        assert!(Oklch::from_palette_spec(
            &json!({"value":{"colorSpace":"srgb","components":[1,1,1]}})
        )
        .is_err());
        assert!(Oklch::from_palette_spec(
            &json!({"value":{"colorSpace":"oklch","components":[1,0]}})
        )
        .is_err());
    }

    const P: &str = "noi.eio.color.palette.";
    fn lookup(path: &str) -> Option<Resolved> {
        let palette = |name: &str| {
            Some(Resolved::Palette(match name {
                "white" => grey(1.0),
                "neutral-950" => grey(0.145),
                "neutral-500" => grey(0.556),
                "neutral-400" => grey(0.708),
                "lime" => LIME,
                _ => return None,
            }))
        };
        match path {
            "noi.eio.color.surface.page" => Some(Resolved::Role {
                light: grey(1.0),
                dark: grey(0.145),
            }),
            _ => palette(path.strip_prefix(P)?),
        }
    }
    fn params() -> Value {
        json!({"minimums":{"text":4.5,"ui":3}})
    }
    fn role(light: &str, dark: &str, kind: &str) -> Value {
        json!({"light":{"ref":format!("{P}{light}")},"dark":{"ref":format!("{P}{dark}")},
            "contrast":[{"against":"noi.eio.color.surface.page","kind":kind}]})
    }
    #[test]
    fn roles_pass_or_name_every_failure() {
        check_role(&role("neutral-950", "white", "text"), &params(), &lookup).unwrap();
        check_role(
            &role("neutral-500", "neutral-400", "text"),
            &params(),
            &lookup,
        )
        .unwrap();
        // Grey 400 on white is 2.6 : 1, short of the 3 : 1 a field border needs.
        let error = check_role(
            &role("neutral-400", "neutral-500", "ui"),
            &params(),
            &lookup,
        )
        .unwrap_err();
        assert!(error.starts_with("light: 2.59 : 1"), "{error}");
        // Lime text fails on white but passes on the dark page.
        let error = check_role(&role("lime", "lime", "text"), &params(), &lookup).unwrap_err();
        assert!(
            error.contains("light: 1.32 : 1") && !error.contains("dark:"),
            "{error}"
        );
        let tint = json!({"light":{"mix":{"color":format!("{P}lime"),"percent":14,"over":format!("{P}white")}},
            "dark":{"mix":{"color":format!("{P}lime"),"percent":14,"over":format!("{P}neutral-950")}}});
        check_role(&tint, &params(), &lookup).unwrap();
    }
    #[test]
    fn references_must_resolve_and_specs_must_be_exact() {
        let missing = role("neutral-123", "neutral-950", "text");
        let error = check_role(&missing, &params(), &lookup).unwrap_err();
        assert!(
            error.contains("neutral-123 is not a usable palette color"),
            "{error}"
        );
        let mut unknown_surface = role("neutral-950", "white", "text");
        unknown_surface["contrast"][0]["against"] = json!("noi.eio.color.surface.nowhere");
        assert!(check_role(&unknown_surface, &params(), &lookup).is_err());
        // A role's value must be a palette color, never another role.
        let mut role_value = role("neutral-950", "white", "text");
        role_value["light"] = json!({"ref":"noi.eio.color.surface.page"});
        assert!(check_role(&role_value, &params(), &lookup).is_err());
        let mut extra = role("neutral-950", "white", "text");
        extra["note"] = json!("free text belongs in metadata");
        assert!(check_role(&extra, &params(), &lookup).is_err());
        let mut bad_mix =
            json!({"light":{"mix":{"color":"a","percent":100,"over":"b"}},"dark":{"ref":"c"}});
        assert!(RoleSpec::parse(&bad_mix).is_err());
        bad_mix["light"]["mix"]["percent"] = json!(14);
        let refs = RoleSpec::parse(&bad_mix).unwrap().references();
        assert_eq!(
            refs.palette.into_iter().collect::<Vec<_>>(),
            ["a", "b", "c"]
        );
        assert!(refs.against.is_empty());
    }
    #[test]
    fn minimums_are_bounded() {
        RoleParams::parse(&params()).unwrap();
        assert!(RoleParams::parse(&json!({"minimums":{"text":0.5,"ui":3}})).is_err());
        assert!(RoleParams::parse(&json!({"minimums":{"text":4.5}})).is_err());
    }
}
