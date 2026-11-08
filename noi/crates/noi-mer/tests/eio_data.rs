//! The Eidos proposal files in `data/eio` pass their invariants before anyone proposes them.
//! No database: invariants and checks run directly on the files.
use serde_json::{json, Value};
use std::{collections::HashMap, fs, path::Path};
use noi_inv::{InvariantSpec, NewMeron};
use noi_eio::{export_tokens, FontSpec, Oklch, Resolved, RoleSpec, SizeSpec, TokenSource, TypeResolved};

fn data(dir: &str) -> Vec<NewMeron> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/eio")
        .join(dir);
    let mut files: Vec<_> = fs::read_dir(path)
        .unwrap()
        .map(|f| f.unwrap().path())
        .collect();
    files.sort();
    files
        .iter()
        .map(|f| serde_json::from_str(&fs::read_to_string(f).unwrap()).unwrap())
        .collect()
}
fn invariant(file: &str) -> InvariantSpec {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data/eio")
        .join(file);
    let meron: NewMeron = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    meron.validate().unwrap();
    InvariantSpec::parse(&meron.spec).unwrap()
}

#[test]
fn eio_palette_and_roles_pass_their_invariants() {
    let token = invariant("color-token-invariant.json");
    let role = invariant("color-role-invariant.json");
    let lime: NewMeron =
        serde_json::from_str(include_str!("../../../data/eio/lime.json")).unwrap();
    let mut palette = data("palette");
    palette.push(lime);
    let mut colors = HashMap::new();
    for color in &palette {
        color.validate().unwrap();
        assert!(
            token.applies_to.covers(&color.classification),
            "{}",
            color.path
        );
        token
            .check(&color.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", color.path));
        colors.insert(
            color.path.clone(),
            Oklch::from_palette_spec(&color.spec).unwrap(),
        );
    }
    assert_eq!(colors.len(), 17, "lime, violet, 9 greys and 6 status colors");

    let roles = data("roles");
    assert_eq!(roles.len(), 19);
    let mut resolved: HashMap<String, Resolved> = colors
        .iter()
        .map(|(path, c)| (path.clone(), Resolved::Palette(*c)))
        .collect();
    for r in &roles {
        r.validate().unwrap();
        assert!(role.applies_to.covers(&r.classification), "{}", r.path);
        role.check(&r.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", r.path));
        let (light, dark) = RoleSpec::parse(&r.spec)
            .unwrap()
            .colors(&|p| colors.get(p).copied())
            .unwrap();
        resolved.insert(r.path.clone(), Resolved::Role { light, dark });
    }
    let params: &Value = &role.checks[0].params;
    for r in &roles {
        noi_eio::check_role(&r.spec, params, &|p| resolved.get(p).copied())
            .unwrap_or_else(|e| panic!("{}: {e}", r.path));
    }
}

#[test]
fn eio_fonts_sizes_and_styles_pass_their_invariants() {
    let font = invariant("font-family-invariant.json");
    let size = invariant("font-size-invariant.json");
    let style = invariant("text-style-invariant.json");
    let mut lookup = HashMap::new();
    for (dir, c) in [("type/fonts", &font), ("type/sizes", &size)] {
        for e in data(dir) {
            e.validate().unwrap();
            assert!(c.applies_to.covers(&e.classification), "{}", e.path);
            c.check(&e.spec)
                .unwrap_or_else(|err| panic!("{}: {err}", e.path));
            let resolved = if dir == "type/fonts" {
                TypeResolved::Font(FontSpec::parse(&e.spec).unwrap())
            } else {
                TypeResolved::Size(SizeSpec::parse(&e.spec).unwrap())
            };
            lookup.insert(e.path.clone(), resolved);
        }
    }
    assert_eq!(lookup.len(), 10, "four fonts and six size steps");
    let styles = data("type/styles");
    assert_eq!(styles.len(), 8);
    let params: &Value = &style.checks[0].params;
    for s in &styles {
        s.validate().unwrap();
        assert!(style.applies_to.covers(&s.classification), "{}", s.path);
        style
            .check(&s.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", s.path));
        noi_eio::check_text_style(&s.spec, params, &|p| lookup.get(p).cloned())
            .unwrap_or_else(|e| panic!("{}: {e}", s.path));
    }
    // What the schemas alone refuse: an unlisted license, a size off the ladder, a color in a style.
    let mut geist = data("type/fonts")
        .into_iter()
        .find(|e| e.path.ends_with(".geist"))
        .unwrap();
    geist.spec["license"] = json!("Proprietary");
    assert!(font.check(&geist.spec).is_err());
    assert!(size.check(&json!({"px": 13})).is_err());
    let mut colored = styles[0].spec.clone();
    colored["color"] = json!("noi.eio.color.text.primary");
    assert!(style.check(&colored).is_err());
}

#[test]
fn eio_spacing_and_sizes_pass_their_invariants() {
    let step = invariant("space-invariant.json");
    let role = invariant("space-role-invariant.json");
    let size = invariant("size-invariant.json");
    let steps = data("space/scale");
    assert_eq!(
        steps.len(),
        4,
        "only the steps the roles use: 8, 16, 24, 48"
    );
    for s in &steps {
        s.validate().unwrap();
        assert!(step.applies_to.covers(&s.classification), "{}", s.path);
        step.check(&s.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", s.path));
    }
    let roles = data("space/roles");
    assert_eq!(
        roles.len(),
        10,
        "six spacing roles, three margins and the pane gap"
    );
    let params: &Value = &role.checks[0].params;
    let used: std::collections::BTreeSet<&str> = roles
        .iter()
        .map(|r| r.spec["ref"].as_str().unwrap())
        .collect();
    for r in &roles {
        r.validate().unwrap();
        assert!(role.applies_to.covers(&r.classification), "{}", r.path);
        role.check(&r.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", r.path));
        noi_eio::check_reference(&r.spec, params, &|p| steps.iter().any(|s| s.path == p))
            .unwrap_or_else(|e| panic!("{}: {e}", r.path));
    }
    // Every registered step is used by a role.
    assert_eq!(used.len(), steps.len());
    let sizes = data("size");
    assert_eq!(
        sizes.len(),
        10,
        "three control heights, the touch target, three icons, the dot, two content widths"
    );
    for s in &sizes {
        s.validate().unwrap();
        assert!(size.applies_to.covers(&s.classification), "{}", s.path);
        size.check(&s.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", s.path));
    }
    // What the schemas alone refuse: a step off the scale, a size off the grid, a role holding a value.
    assert!(step.check(&json!({"px": 20})).is_err());
    assert!(size.check(&json!({"px": 42})).is_err());
    assert!(role.check(&json!({"px": 16})).is_err());
    // Text sits on the grid: every style passes the text-style invariant's multiple-of-4 rule.
    let text = invariant("text-style-invariant.json");
    for s in data("type/styles") {
        text.check(&s.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", s.path));
    }
    let mut off_grid = data("type/styles")[0].spec.clone();
    off_grid["lineHeight"] = json!(30);
    assert!(text.check(&off_grid).is_err());
}

#[test]
fn eio_window_classes_pass_their_invariant() {
    let window = invariant("window-invariant.json");
    let windows = data("layout/window");
    assert_eq!(windows.len(), 3);
    let mut found: Vec<(i64, i64)> = vec![];
    for w in &windows {
        w.validate().unwrap();
        assert!(window.applies_to.covers(&w.classification), "{}", w.path);
        window
            .check(&w.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", w.path));
        found.push((
            w.spec["minWidth"].as_i64().unwrap(),
            w.spec["panes"].as_i64().unwrap(),
        ));
    }
    found.sort();
    assert_eq!(found, [(0, 1), (600, 1), (840, 2)]);
    // What the schema refuses: a fourth boundary, three panes.
    assert!(window
        .check(&json!({"minWidth": 1200, "panes": 2}))
        .is_err());
    assert!(window.check(&json!({"minWidth": 840, "panes": 3})).is_err());
    // The widths are sizes: on the grid, and within the raised limit.
    let size = invariant("size-invariant.json");
    assert!(size.check(&json!({"px": 1200})).is_ok());
    assert!(size.check(&json!({"px": 1210})).is_err());
    assert!(size.check(&json!({"px": 1700})).is_err());
}

#[test]
fn eio_corners_and_border_widths_pass_their_invariants() {
    let radius = invariant("radius-invariant.json");
    let width = invariant("border-width-invariant.json");
    for (dir, c, count) in [("radius", &radius, 4), ("border", &width, 2)] {
        let merons = data(dir);
        assert_eq!(merons.len(), count, "{dir}");
        for e in &merons {
            e.validate().unwrap();
            assert!(c.applies_to.covers(&e.classification), "{}", e.path);
            c.check(&e.spec)
                .unwrap_or_else(|err| panic!("{}: {err}", e.path));
        }
    }
    // What the schemas refuse: a corner off the scale, a corner that is both, no corner at all,
    // and a border width off the two.
    assert!(radius.check(&json!({"px": 10})).is_err());
    assert!(radius.check(&json!({"px": 16, "full": true})).is_err());
    assert!(radius.check(&json!({})).is_err());
    assert!(radius.check(&json!({"full": false})).is_err());
    assert!(width.check(&json!({"px": 3})).is_err());
}

#[test]
fn eio_motion_passes_its_invariants() {
    let duration = invariant("duration-invariant.json");
    let easing = invariant("easing-invariant.json");
    let durations = data("motion/duration");
    let mut found = vec![];
    for d in &durations {
        d.validate().unwrap();
        assert!(duration.applies_to.covers(&d.classification), "{}", d.path);
        duration.check(&d.spec).unwrap_or_else(|e| panic!("{}: {e}", d.path));
        found.push(d.spec["ms"].as_i64().unwrap());
    }
    found.sort();
    assert_eq!(found, [100, 200, 300]);
    let curves = data("motion/easing");
    assert_eq!(curves.len(), 1, "one curve, standard, for everything");
    for c in &curves {
        c.validate().unwrap();
        assert!(easing.applies_to.covers(&c.classification), "{}", c.path);
        easing.check(&c.spec).unwrap_or_else(|e| panic!("{}: {e}", c.path));
    }
    // What the schemas refuse: longer than 300 ms, off the 50 ms step, a curve that overshoots.
    assert!(duration.check(&json!({"ms": 400})).is_err());
    assert!(duration.check(&json!({"ms": 120})).is_err());
    assert!(duration.check(&json!({"ms": 0})).is_err());
    assert!(easing.check(&json!({"bezier": [0.3, 1.4, 0.6, 1]})).is_err());
    assert!(easing.check(&json!({"bezier": [0.2, 0, 1]})).is_err());
}

#[test]
fn eio_files_export_to_tokens() {
    let mut merons = vec![];
    for dir in ["palette", "roles", "type/fonts", "type/sizes", "type/styles", "space/scale", "space/roles", "size", "layout/window", "radius", "border", "motion/duration", "motion/easing"] {
        merons.extend(data(dir));
    }
    let lime = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data/eio/lime.json");
    merons.push(serde_json::from_str(&fs::read_to_string(lime).unwrap()).unwrap());
    let sources: Vec<TokenSource> = merons
        .iter()
        .map(|m| TokenSource {
            path: &m.path,
            subtype: m.classification.subtype.as_deref().unwrap_or(""),
            spec: &m.spec,
        })
        .collect();
    let files = export_tokens(&sources).unwrap();
    assert_eq!(files.css.matches("--eio-color-").count(), 19 * 4, "every role: the default, the system dark, and both chosen themes");
    assert_eq!(files.css.matches(".eio-type-style-").count(), 8);
    let tree: Value = serde_json::from_str(&files.json).unwrap();
    assert_eq!(tree["color"]["palette"].as_object().unwrap().len(), 17);
    assert_eq!(tree["layout"]["window"].as_object().unwrap().len(), 3);
    assert_eq!(tree["color"]["text"]["danger"], json!({"light": "#E7000B", "dark": "#FF6467"}));
    assert!(files.css.contains("  --eio-motion-duration-ms300: 300ms;"));
    assert!(files.css.contains("  --eio-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);"));
    assert_eq!(tree["motion"]["easing"]["standard"], json!([0.2, 0, 0, 1]));
}
