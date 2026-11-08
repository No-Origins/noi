//! Typography: fonts and size steps are primitives, and a text style points at them.
//! The text-style check holds every style to the typography rules agreed on 3 Nov 2026.
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeSet;

/// The check Eidos text-style invariants ask the registry to run.
pub const TEXT_STYLE_CHECK: &str = "eio.text-style";

/// Writing systems a font can draw. Some need taller lines than Latin.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Script {
    Latin,
    Cyrillic,
    Vietnamese,
    Devanagari,
}

/// A font family's checked spec: what the font file actually provides.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FontSpec {
    /// The family name apps load, such as `Geist Mono`.
    pub family: String,
    /// The weights the font has. A one-weight font lists one.
    pub weights: BTreeSet<u16>,
    pub italic: bool,
    pub scripts: BTreeSet<Script>,
    pub license: String,
    pub source: String,
    /// The smallest size, in px, a style may set this font at.
    #[serde(default)]
    pub min_size: Option<f64>,
}
impl FontSpec {
    pub fn parse(spec: &Value) -> Result<Self, String> {
        serde_json::from_value(spec.clone()).map_err(|e| format!("invalid font family: {e}"))
    }
}

/// A size step's checked spec: one step of the ladder, in px against a 16 px base.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SizeSpec {
    pub px: f64,
}
impl SizeSpec {
    pub fn parse(spec: &Value) -> Result<Self, String> {
        serde_json::from_value(spec.clone()).map_err(|e| format!("invalid font size: {e}"))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Case {
    None,
    Upper,
}

/// A text style's checked spec. It names everything about the text except its color, which comes
/// from the color roles.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StyleSpec {
    /// The font family, by path.
    pub font: String,
    /// A second font for scripts the first cannot draw, by path.
    #[serde(default)]
    pub fallback: Option<String>,
    /// The size step, by path.
    pub size: String,
    /// Line height in px. It belongs to the style, not the size step.
    pub line_height: f64,
    pub weight: u16,
    /// Letter spacing in em.
    pub tracking: f64,
    pub case: Case,
    /// Paragraph text people read at length, held to the reading minimums.
    pub reading: bool,
}

/// Paths a style reads: its fonts and its size step.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct TypeReferences {
    pub fonts: BTreeSet<String>,
    pub size: String,
}

impl StyleSpec {
    pub fn parse(spec: &Value) -> Result<Self, String> {
        serde_json::from_value(spec.clone()).map_err(|e| format!("invalid text style: {e}"))
    }
    pub fn references(&self) -> TypeReferences {
        TypeReferences {
            fonts: self.fallback.iter().chain([&self.font]).cloned().collect(),
            size: self.size.clone(),
        }
    }
}

/// Minimums carried by the text-style invariant, so only a maintainer can change them.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TypeMinimums {
    /// No style below this size, in px.
    pub size: f64,
    /// Reading styles: at least this size, in px.
    pub reading_size: f64,
    /// Reading styles: line height at least this many times the size.
    pub reading_line_height: f64,
    /// Styles that can show Devanagari: line height at least this many times the size, so one
    /// line's marks clear the next.
    pub devanagari_line_height: f64,
}
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TypeParams {
    pub minimums: TypeMinimums,
}
impl TypeParams {
    pub fn parse(params: &Value) -> Result<Self, String> {
        let p: Self = serde_json::from_value(params.clone())
            .map_err(|e| format!("invalid {TEXT_STYLE_CHECK} parameters: {e}"))?;
        let m = p.minimums;
        for (name, value) in [("size", m.size), ("readingSize", m.reading_size)] {
            if !(1.0..=96.0).contains(&value) {
                return Err(format!("minimum {name} must be between 1 and 96 px"));
            }
        }
        for (name, value) in [
            ("readingLineHeight", m.reading_line_height),
            ("devanagariLineHeight", m.devanagari_line_height),
        ] {
            if !(1.0..=3.0).contains(&value) {
                return Err(format!("minimum {name} must be between 1 and 3"));
            }
        }
        Ok(p)
    }
}

/// What a referenced path stands for: a usable font family or size step.
#[derive(Debug, Clone, PartialEq)]
pub enum TypeResolved {
    Font(FontSpec),
    Size(SizeSpec),
}

/// The text-style check: the style's fonts and size step resolve to usable primitives, its weight
/// is one the font has, and it meets the size and line-height minimums. Reports every problem at once.
pub fn check_text_style(
    spec: &Value,
    params: &Value,
    lookup: &dyn Fn(&str) -> Option<TypeResolved>,
) -> Result<(), String> {
    let minimums = TypeParams::parse(params)?.minimums;
    let style = StyleSpec::parse(spec)?;
    let mut problems = vec![];
    let font = |path: &str| match lookup(path) {
        Some(TypeResolved::Font(f)) => Some(f),
        _ => None,
    };
    let primary = font(&style.font);
    if primary.is_none() {
        problems.push(format!("{} is not a usable font family", style.font));
    }
    let fallback = style.fallback.as_deref().and_then(|path| {
        let f = font(path);
        if f.is_none() {
            problems.push(format!("{path} is not a usable font family"));
        }
        f
    });
    let size = match lookup(&style.size) {
        Some(TypeResolved::Size(s)) => Some(s.px),
        _ => {
            problems.push(format!("{} is not a usable size step", style.size));
            None
        }
    };
    if let (Some(f), Some(fb)) = (&primary, &fallback) {
        if fb.scripts.is_subset(&f.scripts) {
            problems.push(format!(
                "fallback {} adds no script {} lacks",
                fb.family, f.family
            ));
        }
    }
    if let Some(f) = &primary {
        if !f.weights.contains(&style.weight) {
            let has: Vec<String> = f.weights.iter().map(u16::to_string).collect();
            problems.push(format!(
                "{} has no {} weight (it has {})",
                f.family,
                style.weight,
                has.join(", ")
            ));
        }
    }
    if let Some(px) = size {
        let ratio = style.line_height / px;
        if px < minimums.size {
            problems.push(format!("{px} px is below the {} px minimum", minimums.size));
        }
        for f in primary.iter().chain(&fallback) {
            if let Some(min) = f.min_size.filter(|min| px < *min) {
                problems.push(format!(
                    "{} is only set at {min} px and up, not {px} px",
                    f.family
                ));
            }
        }
        if style.reading {
            if px < minimums.reading_size {
                problems.push(format!(
                    "reading text must be at least {} px, not {px} px",
                    minimums.reading_size
                ));
            }
            if ratio < minimums.reading_line_height {
                problems.push(format!(
                    "reading text needs line height at least {} × size ({} px), not {} px",
                    minimums.reading_line_height,
                    minimums.reading_line_height * px,
                    style.line_height
                ));
            }
        }
        let devanagari = primary
            .iter()
            .chain(&fallback)
            .any(|f| f.scripts.contains(&Script::Devanagari));
        if devanagari && ratio < minimums.devanagari_line_height {
            problems.push(format!(
                "it can show Devanagari, so line height must be at least {} × size ({} px), not {} px",
                minimums.devanagari_line_height,
                minimums.devanagari_line_height * px,
                style.line_height
            ));
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
    const F: &str = "noi.eio.type.font.";
    const S: &str = "noi.eio.type.size.";
    fn fonts() -> Value {
        let all: Vec<u16> = (1..=9).map(|w| w * 100).collect();
        json!({
            "yatra-one": {"family":"Yatra One","weights":[400],"italic":false,"scripts":["latin","devanagari"],"license":"OFL-1.1","source":"https://fonts.google.com/specimen/Yatra+One"},
            "tenor-sans": {"family":"Tenor Sans","weights":[400],"italic":false,"scripts":["latin","cyrillic"],"license":"OFL-1.1","source":"https://fonts.google.com/specimen/Tenor+Sans","minSize":24},
            "geist": {"family":"Geist","weights":all,"italic":true,"scripts":["latin","cyrillic","vietnamese"],"license":"OFL-1.1","source":"https://fonts.google.com/specimen/Geist"},
        })
    }
    fn lookup(path: &str) -> Option<TypeResolved> {
        if let Some(name) = path.strip_prefix(F) {
            let spec = fonts().get(name)?.clone();
            return Some(TypeResolved::Font(FontSpec::parse(&spec).unwrap()));
        }
        let px = path.strip_prefix(S)?.strip_prefix("px")?.parse().ok()?;
        Some(TypeResolved::Size(SizeSpec { px }))
    }
    fn params() -> Value {
        json!({"minimums":{"size":12,"readingSize":16,"readingLineHeight":1.5,"devanagariLineHeight":1.25}})
    }
    fn style(font: &str, px: u32, line_height: u32, weight: u16) -> Value {
        json!({"font":format!("{F}{font}"),"size":format!("{S}px{px}"),"lineHeight":line_height,
            "weight":weight,"tracking":0,"case":"none","reading":false})
    }
    fn check(spec: &Value) -> Result<(), String> {
        check_text_style(spec, &params(), &lookup)
    }
    #[test]
    fn the_locked_styles_pass() {
        check(&style("yatra-one", 48, 60, 400)).unwrap();
        check(&style("yatra-one", 36, 48, 400)).unwrap();
        let mut title = style("tenor-sans", 30, 40, 400);
        title["fallback"] = json!(format!("{F}yatra-one"));
        check(&title).unwrap();
        // The fallback draws Devanagari at heading weight 600 too: only the font's own weights count.
        let mut heading = style("geist", 20, 28, 600);
        heading["fallback"] = json!(format!("{F}yatra-one"));
        check(&heading).unwrap();
        let mut body = style("geist", 16, 24, 400);
        body["reading"] = json!(true);
        check(&body).unwrap();
        check(&style("geist", 12, 16, 400)).unwrap();
    }
    #[test]
    fn weights_must_exist_in_the_font() {
        let error = check(&style("yatra-one", 48, 60, 700)).unwrap_err();
        assert_eq!(error, "Yatra One has no 700 weight (it has 400)");
    }
    #[test]
    fn sizes_and_line_heights_meet_the_minimums() {
        let error = check(&style("tenor-sans", 20, 28, 400)).unwrap_err();
        assert_eq!(error, "Tenor Sans is only set at 24 px and up, not 20 px");
        let mut body = style("geist", 14, 20, 400);
        body["reading"] = json!(true);
        let error = check(&body).unwrap_err();
        assert!(
            error.contains("reading text must be at least 16 px, not 14 px"),
            "{error}"
        );
        assert!(
            error.contains("line height at least 1.5 × size (21 px), not 20 px"),
            "{error}"
        );
        let error = check(&style("geist", 10, 16, 400)).unwrap_err();
        assert_eq!(error, "10 px is below the 12 px minimum");
        // A line height of 1.0 cannot hold Devanagari.
        let error = check(&style("yatra-one", 48, 48, 400)).unwrap_err();
        assert_eq!(
            error,
            "it can show Devanagari, so line height must be at least 1.25 × size (60 px), not 48 px"
        );
        // A Devanagari fallback counts: Tenor Sans titles at 30 / 36 would be too tight for it.
        let mut title = style("tenor-sans", 30, 36, 400);
        title["fallback"] = json!(format!("{F}yatra-one"));
        assert!(check(&title).unwrap_err().contains("(37.5 px), not 36 px"));
        check(&style("tenor-sans", 30, 36, 400)).unwrap();
    }
    #[test]
    fn references_must_resolve_and_fallbacks_must_add_a_script() {
        let error = check(&style("inter", 16, 24, 400)).unwrap_err();
        assert_eq!(
            error,
            "noi.eio.type.font.inter is not a usable font family"
        );
        let mut odd = style("geist", 16, 24, 400);
        odd["size"] = json!(format!("{S}huge"));
        assert!(check(&odd)
            .unwrap_err()
            .contains("is not a usable size step"));
        let mut pointless = style("geist", 16, 24, 400);
        pointless["fallback"] = json!(format!("{F}tenor-sans"));
        let error = check(&pointless).unwrap_err();
        assert!(
            error.contains("fallback Tenor Sans adds no script Geist lacks"),
            "{error}"
        );
        // The fallback's own minimum size applies too.
        assert!(
            error.contains("Tenor Sans is only set at 24 px and up"),
            "{error}"
        );
        let mut colored = style("geist", 16, 24, 400);
        colored["color"] = json!("noi.eio.color.text.primary");
        assert!(check(&colored).is_err());
        let mut both = style("geist", 20, 28, 600);
        both["fallback"] = json!(format!("{F}yatra-one"));
        let refs = StyleSpec::parse(&both).unwrap().references();
        assert_eq!(
            refs.fonts.into_iter().collect::<Vec<_>>(),
            [format!("{F}geist"), format!("{F}yatra-one")]
        );
        assert_eq!(refs.size, format!("{S}px20"));
    }
    #[test]
    fn minimums_are_bounded() {
        TypeParams::parse(&params()).unwrap();
        let mut p = params();
        p["minimums"]["devanagariLineHeight"] = json!(0.9);
        assert!(TypeParams::parse(&p).is_err());
        assert!(TypeParams::parse(&json!({"minimums":{"size":12}})).is_err());
    }
}
