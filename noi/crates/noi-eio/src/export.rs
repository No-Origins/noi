//! The token export: active Eidos merons in, the three `@noi/eio-tokens` files out.
//! Colors resolve with the same code the color-role check uses, so an exported value is the value
//! whose contrast was checked. The output is deterministic: the same merons give the same files.
use crate::{Case, FontSpec, Oklch, RoleSpec, StyleSpec};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};

const PREFIX: &str = "noi.eio.";

/// One active Eidos meron: its path, subtype and checked spec.
pub struct TokenSource<'a> {
    pub path: &'a str,
    pub subtype: &'a str,
    pub spec: &'a Value,
    /// Deprecated in Mero: it stays in every file, marked, so what reads it keeps working while it
    /// moves off (18 Nov). A retired value is not given at all.
    pub deprecated: bool,
}

/// What a deprecated value says, in each file that can say it.
const DEPRECATED: &str = "deprecated in Mero: move off it before it retires";

/// tokens.ts is the JSON tree as a TypeScript object; each deprecated value's property gets its
/// own `@deprecated` line, so editors strike it through where code reads it. Reads the pretty
/// JSON line by line, keeping the path of keys it is inside.
fn mark_deprecated_in_ts(json: &str, deprecated: &BTreeSet<String>) -> String {
    if deprecated.is_empty() {
        return json.to_string();
    }
    let mut out = vec![];
    let mut inside: Vec<String> = vec![];
    for line in json.lines() {
        let t = line.trim_start();
        if t.starts_with('}') || t.starts_with(']') {
            inside.pop();
        }
        if let Some(rest) = t.strip_prefix('"') {
            if let Some((name, after)) = rest.split_once("\": ") {
                let mut here = inside.clone();
                here.push(name.to_string());
                if deprecated.contains(&here.join(".")) {
                    let pad = &line[..line.len() - t.len()];
                    out.push(format!("{pad}/** @deprecated Move off it before it retires: it is deprecated in Mero. */"));
                }
                if after.ends_with('{') || after.ends_with('[') {
                    inside.push(name.to_string());
                }
            }
        } else if (t == "{" || t == "[") && !out.is_empty() {
            inside.push(String::new());
        }
        out.push(line.to_string());
    }
    out.join("\n")
}

/// The generated package files.
pub struct TokenFiles {
    pub css: String,
    pub ts: String,
    pub json: String,
}

/// `noi.eio.color.text.primary` → `color.text.primary`.
fn key(path: &str) -> &str {
    path.strip_prefix(PREFIX).unwrap_or(path)
}

/// `noi.eio.color.text.primary` → `--eio-color-text-primary`.
fn var(path: &str) -> String {
    format!("--eio-{}", key(path).replace('.', "-"))
}

/// Whole pixel values stay integers in JSON and TypeScript.
fn num(v: f64) -> Value {
    if v.fract() == 0.0 {
        json!(v as i64)
    } else {
        json!(v)
    }
}

fn px(path: &str, spec: &Value) -> Result<f64, String> {
    spec["px"]
        .as_f64()
        .ok_or_else(|| format!("{path} has no px value"))
}

/// Puts `value` into `tree` at the meron's path segments after `noi.eio`.
fn insert(tree: &mut Map<String, Value>, path: &str, value: Value) {
    let mut parts: Vec<&str> = key(path).split('.').collect();
    let last = parts.pop().unwrap_or_default();
    let mut node = tree;
    for part in parts {
        node = node
            .entry(part)
            .or_insert_with(|| Value::Object(Map::new()))
            .as_object_mut()
            .expect("a token path segment is never also a value");
    }
    node.insert(last.into(), value);
}

/// Turns the active Eidos merons into `tokens.css`, `tokens.ts` and `tokens.json`.
/// Roles become CSS variables in both themes; palette colors are only in the typed object, so
/// components cannot reach past a role to a palette color. Window classes become media queries that
/// switch the `--eio-window-*` variables. Motion durations and curves become variables, and every
/// duration drops to 0 when the system asks for reduced motion. The 3D world's lengths, times and
/// speeds are only in the typed object and the JSON.
pub fn export_tokens(sources: &[TokenSource]) -> Result<TokenFiles, String> {
    let mut sources: Vec<&TokenSource> = sources.iter().collect();
    sources.sort_by_key(|s| s.path);
    let by_path: BTreeMap<&str, &TokenSource> = sources.iter().map(|s| (s.path, *s)).collect();
    let spec_of = |path: &str, subtype: &str| {
        by_path
            .get(path)
            .filter(|s| s.subtype == subtype)
            .map(|s| s.spec)
            .ok_or_else(|| format!("{path} is not an active {subtype}"))
    };
    let palette = |path: &str| {
        by_path
            .get(path)
            .filter(|s| s.subtype == "color")
            .and_then(|s| Oklch::from_palette_spec(s.spec).ok())
    };
    let family = |path: &str| -> Result<String, String> {
        Ok(FontSpec::parse(spec_of(path, "font-family")?)?.family)
    };

    let mut tree = Map::new();
    let (mut root, mut light, mut dark, mut classes) = (vec![], vec![], vec![], vec![]);
    let mut windows: Vec<(u64, &str, u64)> = vec![];
    let mut durations = vec![];
    let mut deprecated = BTreeSet::new();
    for s in &sources {
        let (path, spec) = (s.path, s.spec);
        let marks = (root.len(), light.len(), dark.len(), classes.len());
        if s.deprecated {
            deprecated.insert(key(path).to_string());
        }
        match s.subtype {
            "color" => insert(
                &mut tree,
                path,
                json!(Oklch::from_palette_spec(spec)?.hex()),
            ),
            "color-role" => {
                let (l, d) = RoleSpec::parse(spec)?
                    .colors(&palette)
                    .map_err(|e| format!("{path}: {e}"))?;
                let (l, d) = (l.hex(), d.hex());
                light.push(format!("  {}: {l};", var(path)));
                dark.push(format!("  {}: {d};", var(path)));
                insert(&mut tree, path, json!({ "light": l, "dark": d }));
            }
            "font-family" => {
                let f = FontSpec::parse(spec)?;
                insert(
                    &mut tree,
                    path,
                    json!({ "family": f.family, "weights": f.weights, "italic": f.italic }),
                );
            }
            "font-size" | "space" | "size" | "border-width" => {
                let v = px(path, spec)?;
                root.push(format!("  {}: {v}px;", var(path)));
                insert(&mut tree, path, num(v));
            }
            "space-role" => {
                let target = spec["ref"]
                    .as_str()
                    .ok_or_else(|| format!("{path} has no space ref"))?;
                let v = px(target, spec_of(target, "space")?)?;
                root.push(format!("  {}: {v}px;", var(path)));
                insert(&mut tree, path, num(v));
            }
            "radius" => {
                if spec["full"] == json!(true) {
                    root.push(format!("  {}: 9999px;", var(path)));
                    insert(&mut tree, path, json!("full"));
                } else {
                    let v = px(path, spec)?;
                    root.push(format!("  {}: {v}px;", var(path)));
                    insert(&mut tree, path, num(v));
                }
            }
            "duration" => {
                let ms = spec["ms"]
                    .as_u64()
                    .ok_or_else(|| format!("{path} has no ms"))?;
                root.push(format!("  {}: {ms}ms;", var(path)));
                durations.push(var(path));
                insert(&mut tree, path, json!(ms));
            }
            "easing" => {
                let points = spec["bezier"]
                    .as_array()
                    .filter(|b| b.len() == 4 && b.iter().all(Value::is_number))
                    .ok_or_else(|| format!("{path} has no four-number bezier"))?;
                let numbers: Vec<String> = points
                    .iter()
                    .map(|v| num(v.as_f64().unwrap_or_default()).to_string())
                    .collect();
                root.push(format!(
                    "  {}: cubic-bezier({});",
                    var(path),
                    numbers.join(", ")
                ));
                insert(
                    &mut tree,
                    path,
                    Value::Array(
                        points
                            .iter()
                            .map(|v| num(v.as_f64().unwrap_or_default()))
                            .collect(),
                    ),
                );
            }
            "window" => {
                let min = spec["minWidth"]
                    .as_u64()
                    .ok_or_else(|| format!("{path} has no minWidth"))?;
                let panes = spec["panes"]
                    .as_u64()
                    .ok_or_else(|| format!("{path} has no panes"))?;
                windows.push((min, key(path).rsplit('.').next().unwrap_or_default(), panes));
                insert(
                    &mut tree,
                    path,
                    json!({ "minWidth": spec["minWidth"], "panes": spec["panes"] }),
                );
            }
            "text-style" => {
                let st = StyleSpec::parse(spec)?;
                let main = family(&st.font)?;
                let mut stack = vec![main.clone()];
                if let Some(f) = &st.fallback {
                    stack.push(family(f)?);
                }
                let generic = if main.contains("Mono") {
                    "monospace"
                } else {
                    "sans-serif"
                };
                let size = px(&st.size, spec_of(&st.size, "font-size")?)?;
                let case = match st.case {
                    Case::None => "none",
                    Case::Upper => "uppercase",
                };
                let font = stack
                    .iter()
                    .map(|f| format!("'{f}'"))
                    .chain([generic.to_string()])
                    .collect::<Vec<_>>()
                    .join(", ");
                let v = var(path);
                root.extend([
                    format!("  {v}-font: {font};"),
                    format!("  {v}-size: {size}px;"),
                    format!("  {v}-line-height: {}px;", st.line_height),
                    format!("  {v}-weight: {};", st.weight),
                    format!("  {v}-tracking: {}em;", st.tracking),
                    format!("  {v}-case: {case};"),
                ]);
                classes.push(format!(
                    ".eio-{} {{\n  font-family: var({v}-font);\n  font-size: var({v}-size);\n  line-height: var({v}-line-height);\n  font-weight: var({v}-weight);\n  letter-spacing: var({v}-tracking);\n  text-transform: var({v}-case);\n}}",
                    key(path).replace('.', "-")
                ));
                let mut fonts: Vec<Value> = stack.into_iter().map(Value::from).collect();
                fonts.push(generic.into());
                insert(
                    &mut tree,
                    path,
                    json!({
                        "font": fonts, "size": num(size), "lineHeight": num(st.line_height),
                        "weight": st.weight, "tracking": st.tracking,
                        "case": if st.case == Case::Upper { "upper" } else { "none" },
                        "reading": st.reading,
                    }),
                );
            }
            // The 3D world's values (17 Nov): a length in metres, a time in seconds, a speed in
            // metres a second. Code that draws in 3D reads them, CSS never does, so they go into
            // tokens.ts and tokens.json only.
            "length" | "time" | "speed" => {
                let field = match s.subtype {
                    "length" => "m",
                    "time" => "s",
                    _ => "m_per_s",
                };
                let v = spec[field]
                    .as_f64()
                    .ok_or_else(|| format!("{path} has no {field} value"))?;
                insert(&mut tree, path, num(v));
            }
            // The system meron and its invariants are not tokens.
            _ => {}
        }
        // A deprecated value's lines say so (18 Nov).
        if s.deprecated {
            let note = format!(" /* {DEPRECATED} */");
            for line in root[marks.0..]
                .iter_mut()
                .chain(&mut light[marks.1..])
                .chain(&mut dark[marks.2..])
            {
                line.push_str(&note);
            }
            for class in &mut classes[marks.3..] {
                class.insert_str(0, &format!("/* {path}: {DEPRECATED} */\n"));
            }
        }
    }

    // Window classes are the only place a window width is written. Each class sets the page margin
    // (the margin role named after it) and whether one pane fills the window or two sit beside each
    // other; stylesheets read these variables and never write a width of their own.
    windows.sort();
    let mut blocks = vec![];
    for (i, (min, name, panes)) in windows.iter().enumerate() {
        let margin = format!("{PREFIX}space.margin.{name}");
        spec_of(&margin, "space-role")
            .map_err(|_| format!("window class {name} needs the margin role {margin}"))?;
        let (one, two) = if *panes > 1 {
            ("none", "contents")
        } else {
            ("contents", "none")
        };
        let vars = format!(
            "--eio-window-margin: var({});\n--eio-window-panes: {panes};\n--eio-window-one-pane: {one};\n--eio-window-two-panes: {two};",
            var(&margin)
        );
        let block = |pad: &str| {
            vars.lines()
                .map(|l| format!("{pad}{l}"))
                .collect::<Vec<_>>()
                .join("\n")
        };
        blocks.push(if i == 0 {
            format!("/* {name}: {min} px and up */\n:root {{\n{}\n}}\n", block("  "))
        } else {
            format!("/* {name}: {min} px and up */\n@media (width >= {min}px) {{\n  :root {{\n{}\n  }}\n}}\n", block("    "))
        });
    }
    let window_css = if blocks.is_empty() {
        String::new()
    } else {
        format!(
            "\n/* Window classes. Layout follows the width of the window, not the device.\n   --eio-window-one-pane and --eio-window-two-panes are display values: `contents` shows an\n   element's children as if it were not there, `none` hides it. */\n{}",
            blocks.join("\n")
        )
    };

    // With reduced motion asked for, every duration is 0: nothing moves and nothing fades.
    let motion_css = if durations.is_empty() {
        String::new()
    } else {
        format!(
            "\n/* Reduced motion: with the system setting on, every motion is instant. */\n@media (prefers-reduced-motion: reduce) {{\n  :root {{\n{}\n  }}\n}}\n",
            durations.iter().map(|d| format!("    {d}: 0ms;")).collect::<Vec<_>>().join("\n")
        )
    };

    const HEAD: &str = "@noi/eio-tokens: Eidos tokens for No Origins apps.\nWritten by Mero's writer (pnpm eio:write) from Eidos's merons: the active ones, and the deprecated ones marked. Do not edit by hand.";
    let indent = |lines: &[String]| {
        lines
            .iter()
            .map(|l| format!("  {l}"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let css = format!(
        "/* {} */\n@import \"./fonts.css\";\n\n:root {{\n  color-scheme: light;\n{}\n{}\n}}\n\n/* Themes. Without a data-theme the page follows the system; data-theme on any element\n   chooses that element's theme, so a light section can sit inside a dark page and back. */\n@media (prefers-color-scheme: dark) {{\n  :root:not([data-theme=\"light\"]) {{\n    color-scheme: dark;\n{}\n  }}\n}}\n[data-theme=\"light\"] {{\n  color-scheme: light;\n{}\n}}\n[data-theme=\"dark\"] {{\n  color-scheme: dark;\n{}\n}}\n{window_css}{motion_css}\n/* Text styles. Color comes from a color role, never from the style. */\n{}\n",
        HEAD.replace('\n', "\n   "),
        root.join("\n"),
        light.join("\n"),
        indent(&dark),
        light.join("\n"),
        dark.join("\n"),
        classes.join("\n\n"),
    );
    let tree = Value::Object(tree);
    let pretty = serde_json::to_string_pretty(&tree).map_err(|e| e.to_string())?;
    // tokens.json keeps every value's shape; the deprecated ones are listed beside them.
    let json = if deprecated.is_empty() {
        format!("{pretty}\n")
    } else {
        let mut listed = tree.clone();
        listed
            .as_object_mut()
            .expect("the tree is an object")
            .insert(
                "$deprecated".into(),
                json!(deprecated.iter().collect::<Vec<_>>()),
            );
        format!(
            "{}\n",
            serde_json::to_string_pretty(&listed).map_err(|e| e.to_string())?
        )
    };
    let windows = if tree.pointer("/layout/window").is_some() {
        "\nexport type WindowClass = keyof typeof tokens.layout.window\n\n/** The window class for a width in CSS pixels: the widest class whose minimum width fits. */\nexport function windowClass(width: number): WindowClass {\n  const classes = Object.entries(tokens.layout.window) as [WindowClass, { minWidth: number }][]\n  return classes.filter(([, w]) => width >= w.minWidth).sort((a, b) => b[1].minWidth - a[1].minWidth)[0][0]\n}\n"
    } else {
        ""
    };
    let ts = format!(
        "// {}\n\nexport const tokens = {} as const\n\nexport type Tokens = typeof tokens\n{windows}\nexport default tokens\n",
        HEAD.replace('\n', "\n// "),
        mark_deprecated_in_ts(&pretty, &deprecated),
    );
    Ok(TokenFiles { css, ts, json })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_deprecated_value_stays_marked_in_every_file() {
        let lime = json!({"family":"brand","value":{"colorSpace":"oklch","components":[0.896,0.196,119.552],"hex":"#CEEE38"}});
        let role = json!({"light":{"ref":"noi.eio.color.palette.lime"},"dark":{"ref":"noi.eio.color.palette.lime"}});
        let (small, large) = (json!({"px":16}), json!({"px":24}));
        let source = |path, subtype, spec, deprecated| TokenSource {
            path,
            subtype,
            spec,
            deprecated,
        };
        let files = export_tokens(&[
            source("noi.eio.color.palette.lime", "color", &lime, false),
            source("noi.eio.color.action.primary", "color-role", &role, true),
            source("noi.eio.size.icon.small", "size", &small, true),
            source("noi.eio.size.icon.large", "size", &large, false),
        ])
        .unwrap();
        let note = "/* deprecated in Mero: move off it before it retires */";
        assert!(files
            .css
            .contains(&format!("  --eio-size-icon-small: 16px; {note}\n")));
        assert!(
            files.css.contains("  --eio-size-icon-large: 24px;\n"),
            "the others say nothing"
        );
        assert!(files
            .css
            .contains(&format!("  --eio-color-action-primary: #CEEE38; {note}\n")));
        let tag = "/** @deprecated Move off it before it retires: it is deprecated in Mero. */";
        assert!(
            files
                .ts
                .contains(&format!("      {tag}\n      \"small\": 16")),
            "{}",
            files.ts
        );
        assert!(
            files
                .ts
                .contains(&format!("      {tag}\n      \"primary\": {{\n")),
            "{}",
            files.ts
        );
        assert_eq!(
            files.ts.matches("@deprecated").count(),
            2,
            "a role's own lines are not marked again"
        );
        assert!(!files.ts.contains("$deprecated"));
        let json: Value = serde_json::from_str(&files.json).unwrap();
        assert_eq!(
            json["size"]["icon"]["small"],
            json!(16),
            "its value keeps its shape"
        );
        assert_eq!(
            json["$deprecated"],
            json!(["color.action.primary", "size.icon.small"])
        );
        // Nothing deprecated: the files are as they always were.
        let plain =
            export_tokens(&[source("noi.eio.size.icon.small", "size", &small, false)]).unwrap();
        assert!(
            !plain.css.contains("deprecated in Mero")
                && !plain.ts.contains("@deprecated")
                && !plain.json.contains("$deprecated")
        );
    }

    #[test]
    fn exports_roles_in_both_themes_and_styles_as_classes() {
        let lime = json!({"family":"brand","value":{"colorSpace":"oklch","components":[0.896,0.196,119.552],"hex":"#CEEE38"}});
        let white = json!({"family":"neutral","value":{"colorSpace":"oklch","components":[1,0,0]}});
        let black =
            json!({"family":"neutral","value":{"colorSpace":"oklch","components":[0.145,0,0]}});
        let role = json!({"light":{"ref":"noi.eio.color.palette.black"},"dark":{"ref":"noi.eio.color.palette.white"}});
        let hover = json!({"light":{"mix":{"color":"noi.eio.color.palette.lime","percent":14,"over":"noi.eio.color.palette.white"}},"dark":{"ref":"noi.eio.color.palette.black"}});
        let font = json!({"family":"Geist Mono","weights":[400,500],"italic":false,"scripts":["latin"],"license":"OFL-1.1","source":"https://fonts.google.com/specimen/Geist+Mono"});
        let size = json!({"px":12});
        let style = json!({"font":"noi.eio.type.font.geist-mono","size":"noi.eio.type.size.px12","lineHeight":16,"weight":500,"tracking":0.08,"case":"upper","reading":false});
        let full = json!({"full":true});
        let scale = json!({"px":24});
        let gap = json!({"ref":"noi.eio.space.scale.px24"});
        let sources = [
            TokenSource {
                path: "noi.eio.color.palette.lime",
                subtype: "color",
                spec: &lime,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.color.palette.white",
                subtype: "color",
                spec: &white,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.color.palette.black",
                subtype: "color",
                spec: &black,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.color.text.primary",
                subtype: "color-role",
                spec: &role,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.color.state.hover",
                subtype: "color-role",
                spec: &hover,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.type.font.geist-mono",
                subtype: "font-family",
                spec: &font,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.type.size.px12",
                subtype: "font-size",
                spec: &size,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.type.style.label",
                subtype: "text-style",
                spec: &style,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.radius.button",
                subtype: "radius",
                spec: &full,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.space.scale.px24",
                subtype: "space",
                spec: &scale,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.space.gap.group",
                subtype: "space-role",
                spec: &gap,
                deprecated: false,
            },
        ];
        let files = export_tokens(&sources).unwrap();
        assert!(files.css.contains("  --eio-color-text-primary: #0A0A0A;"));
        assert!(files.css.contains("[data-theme=\"dark\"] {\n  color-scheme: dark;\n  --eio-color-state-hover: #0A0A0A;\n  --eio-color-text-primary: #FFFFFF;"));
        assert!(
            files.css.contains("  --eio-color-state-hover: #F8FDE9;"),
            "lime 14% over white, as checked"
        );
        assert!(
            files.css.contains("[data-theme=\"light\"] {\n  color-scheme: light;\n  --eio-color-state-hover: #F8FDE9;"),
            "a light section can sit inside a dark page"
        );
        assert!(
            !files.css.contains("--eio-color-palette"),
            "components read roles, never palette colors"
        );
        assert!(files
            .css
            .contains("  --eio-type-style-label-font: 'Geist Mono', monospace;"));
        assert!(files
            .css
            .contains("  --eio-type-style-label-case: uppercase;"));
        assert!(files.css.contains(".eio-type-style-label {"));
        assert!(files.css.contains("  --eio-radius-button: 9999px;"));
        assert!(files.css.contains("  --eio-space-gap-group: 24px;"));
        let tree: Value = serde_json::from_str(&files.json).unwrap();
        assert_eq!(tree["color"]["palette"]["lime"], "#CEEE38");
        assert_eq!(tree["space"]["gap"]["group"], 24);
        assert_eq!(
            tree["type"]["style"]["label"]["font"],
            json!(["Geist Mono", "monospace"])
        );
        assert!(files.ts.starts_with("// @noi/eio-tokens"));
        assert_eq!(
            export_tokens(&sources).unwrap().css,
            files.css,
            "deterministic"
        );
    }

    #[test]
    fn window_classes_switch_the_window_variables() {
        let (s16, s24) = (json!({"px":16}), json!({"px":24}));
        let (m16, m24) = (
            json!({"ref":"noi.eio.space.scale.px16"}),
            json!({"ref":"noi.eio.space.scale.px24"}),
        );
        let compact = json!({"minWidth":0,"panes":1});
        let medium = json!({"minWidth":600,"panes":1});
        let expanded = json!({"minWidth":840,"panes":2});
        let mut sources = vec![
            TokenSource {
                path: "noi.eio.space.scale.px16",
                subtype: "space",
                spec: &s16,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.space.scale.px24",
                subtype: "space",
                spec: &s24,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.space.margin.compact",
                subtype: "space-role",
                spec: &m16,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.space.margin.medium",
                subtype: "space-role",
                spec: &m24,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.space.margin.expanded",
                subtype: "space-role",
                spec: &m24,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.layout.window.expanded",
                subtype: "window",
                spec: &expanded,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.layout.window.compact",
                subtype: "window",
                spec: &compact,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.layout.window.medium",
                subtype: "window",
                spec: &medium,
                deprecated: false,
            },
        ];
        let css = export_tokens(&sources).unwrap().css;
        // The narrowest class needs no query; the others start at their own width, narrowest first.
        assert!(css.contains("/* compact: 0 px and up */\n:root {\n  --eio-window-margin: var(--eio-space-margin-compact);\n  --eio-window-panes: 1;\n  --eio-window-one-pane: contents;\n  --eio-window-two-panes: none;\n}"));
        assert!(css.contains("@media (width >= 600px) {\n  :root {\n    --eio-window-margin: var(--eio-space-margin-medium);"));
        assert!(css.contains("@media (width >= 840px) {\n  :root {\n    --eio-window-margin: var(--eio-space-margin-expanded);\n    --eio-window-panes: 2;\n    --eio-window-one-pane: none;\n    --eio-window-two-panes: contents;"));
        assert!(css.find("width >= 600px").unwrap() < css.find("width >= 840px").unwrap());
        assert_eq!(
            css.matches("@media (width").count(),
            2,
            "widths appear only in the window queries"
        );
        // A window class without its margin role cannot be exported.
        sources.retain(|s| s.path != "noi.eio.space.margin.medium");
        assert!(export_tokens(&sources)
            .err()
            .is_some_and(|e| e.contains("noi.eio.space.margin.medium")));
    }

    #[test]
    fn motion_exports_durations_and_curves_and_stops_for_reduced_motion() {
        let (ms100, ms300) = (json!({"ms":100}), json!({"ms":300}));
        let standard = json!({"bezier":[0.2,0,0,1]});
        let sources = [
            TokenSource {
                path: "noi.eio.motion.duration.ms300",
                subtype: "duration",
                spec: &ms300,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.motion.duration.ms100",
                subtype: "duration",
                spec: &ms100,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.motion.easing.standard",
                subtype: "easing",
                spec: &standard,
                deprecated: false,
            },
        ];
        let files = export_tokens(&sources).unwrap();
        assert!(files.css.contains("  --eio-motion-duration-ms100: 100ms;"));
        assert!(files
            .css
            .contains("  --eio-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);"));
        assert!(files.css.contains("@media (prefers-reduced-motion: reduce) {\n  :root {\n    --eio-motion-duration-ms100: 0ms;\n    --eio-motion-duration-ms300: 0ms;\n  }\n}"));
        let tree: Value = serde_json::from_str(&files.json).unwrap();
        assert_eq!(tree["motion"]["duration"]["ms300"], 300);
        assert_eq!(tree["motion"]["easing"]["standard"], json!([0.2, 0, 0, 1]));
        let bad = json!({"bezier":[0.2,0,1]});
        assert!(export_tokens(&[TokenSource {
            path: "noi.eio.motion.easing.bad",
            subtype: "easing",
            spec: &bad,
            deprecated: false,
        }])
        .is_err());
    }

    #[test]
    fn world_lengths_times_and_speeds_are_typed_values_only() {
        let (tall, gap, fast) = (json!({"m":56}), json!({"s":0.6}), json!({"m_per_s":1.4}));
        let sources = [
            TokenSource {
                path: "noi.eio.world.arch.height",
                subtype: "length",
                spec: &tall,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.world.flight.jump",
                subtype: "time",
                spec: &gap,
                deprecated: false,
            },
            TokenSource {
                path: "noi.eio.world.character.walk",
                subtype: "speed",
                spec: &fast,
                deprecated: false,
            },
        ];
        let files = export_tokens(&sources).unwrap();
        assert!(
            !files.css.contains("world"),
            "no CSS for the 3D world's values"
        );
        let tree: Value = serde_json::from_str(&files.json).unwrap();
        assert_eq!(tree["world"]["arch"]["height"], 56);
        assert_eq!(tree["world"]["flight"]["jump"], 0.6);
        assert_eq!(tree["world"]["character"]["walk"], 1.4);
        assert!(files.ts.contains("\"height\": 56"));
        let wrong = json!({"px":56});
        assert!(export_tokens(&[TokenSource {
            path: "noi.eio.world.arch.height",
            subtype: "length",
            spec: &wrong,
            deprecated: false,
        }])
        .err()
        .is_some_and(|e| e.contains("has no m value")));
    }

    #[test]
    fn a_role_reading_a_missing_color_fails() {
        let role = json!({"light":{"ref":"noi.eio.color.palette.gone"},"dark":{"ref":"noi.eio.color.palette.gone"}});
        let sources = [TokenSource {
            path: "noi.eio.color.text.primary",
            subtype: "color-role",
            spec: &role,
            deprecated: false,
        }];
        assert!(export_tokens(&sources).is_err());
    }
}
