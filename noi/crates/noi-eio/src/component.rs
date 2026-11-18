//! The component check (agreed 17 Nov, "Components in Mero", decisions 1 to 3): a component's meron
//! holds its contract and the fingerprints of the files you approved, never the code. Git keeps the
//! code. The check holds what a JSON Schema cannot: every Eidos value the component reads and every
//! component it uses is admitted in Mero, and no file is listed by two merons. Where the rule asks it
//! (`folders`, from 18 Nov), each file of a component or a shared part sits in a folder named for it.
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

/// The check the component invariant asks the registry to run.
pub const COMPONENT_CHECK: &str = "eio.component";

/// Where components live in Mero: the components a meron uses must sit under this path.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentParams {
    pub under: String,
    /// Each file of a component or a shared part sits in a folder named for it, as the code names it:
    /// src/Button/ for noi.eio.components.button, src/character-drawing/ for
    /// noi.eio.components.world.character-drawing (the user, 18 Nov: "Yes, after this one"). Off in the
    /// rule's earlier versions.
    #[serde(default)]
    pub folders: bool,
}
impl ComponentParams {
    pub fn parse(params: &Value) -> Result<Self, String> {
        let p: Self = serde_json::from_value(params.clone())
            .map_err(|e| format!("invalid {COMPONENT_CHECK} parameters: {e}"))?;
        if !p.under.starts_with("noi.") || p.under.ends_with('.') {
            return Err(format!("{COMPONENT_CHECK} needs `under`, a path in noi"));
        }
        Ok(p)
    }
}

/// Whether a file sits in the folder named for its meron. The folder is named as the code names it, so
/// letters' case and hyphens do not count: Button and MenuIcon, arch and character-drawing.
fn in_its_folder(file: &str, name: &str) -> bool {
    let plain = |s: &str| {
        s.chars()
            .filter(|c| *c != '-')
            .flat_map(char::to_lowercase)
            .collect::<String>()
    };
    let folder = file.rsplit('/').nth(1).unwrap_or("");
    !folder.is_empty() && plain(folder) == plain(name)
}

/// What a component's meron is: one component, a part several components share, or the package's
/// own files (the export list, the settings, the tests), which belong to no one component.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Part {
    Component,
    SharedPart,
    Package,
}

/// One file of the meron, as the package's folder has it, with the fingerprint you approved.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ComponentFile {
    pub path: String,
    pub sha256: String,
}

/// A component's states, by key (agreed 18 Nov, "Component States", decisions 1 and 2): groups of what
/// varies, group → key → your words. Each key is named as in the code; the group `interaction` holds
/// what happens to the component (hovered, focused, disabled …), every other group an option the code
/// is given. The first shape, a list of sentences (17 Nov), was dropped from the rule on 18 Nov: older
/// revisions in Mero's history still hold it, but no admitted component does, and Mero reads none.
pub type States = BTreeMap<String, BTreeMap<String, String>>;

/// The group that holds what happens to a component, rather than an option its code is given.
pub const INTERACTION: &str = "interaction";

/// The parts of a component's spec the check reads. The invariant's schema holds the rest.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ComponentSpec {
    pub package: String,
    pub part: Part,
    #[serde(default)]
    pub states: States,
    #[serde(default)]
    pub reads: Vec<String>,
    #[serde(default)]
    pub uses: Vec<String>,
    pub files: Vec<ComponentFile>,
}
impl ComponentSpec {
    pub fn parse(spec: &Value) -> Result<Self, String> {
        serde_json::from_value(spec.clone()).map_err(|e| format!("invalid component: {e}"))
    }
}

/// What the registry found for the check.
pub trait ComponentLookup {
    /// An admitted Eidos value (a token) at this path.
    fn is_value(&self, path: &str) -> bool;
    /// An admitted component meron at this path.
    fn is_component(&self, path: &str) -> bool;
    /// The path of another admitted component meron of the same package that lists this file.
    fn listed_by(&self, file: &str) -> Option<String>;
    /// The path of another admitted component meron, of either package, whose states already give
    /// this type name in `components.ts`.
    fn type_given_by(&self, name: &str) -> Option<String>;
    /// The components another admitted component meron uses.
    fn uses_of(&self, path: &str) -> Vec<String>;
}

/// The component check on the meron at `path`. `lookup` answers only for admitted merons; the meron
/// being checked is never one of the others that list a file or give a type.
pub fn check_component(
    path: &str,
    spec: &Value,
    params: &Value,
    lookup: &dyn ComponentLookup,
) -> Result<(), String> {
    let p = ComponentParams::parse(params)?;
    let c = ComponentSpec::parse(spec)?;
    if c.part == Part::Component && c.states.is_empty() {
        return Err("a component names its states".into());
    }
    if let Some((g, _)) = c.states.iter().find(|(_, keys)| keys.is_empty()) {
        return Err(format!("the group {g} names no state"));
    }
    if c.part == Part::Package && !c.states.is_empty() {
        return Err("the package's own files have no states".into());
    }
    if p.folders && c.part != Part::Package {
        let name = path.rsplit('.').next().unwrap_or(path);
        if let Some(f) = c.files.iter().find(|f| !in_its_folder(&f.path, name)) {
            return Err(format!(
                "its file {} is not in its folder: each file sits in a folder named for it, {name}",
                f.path
            ));
        }
    }
    // Two components giving one type name would stop Mero writing components.ts, and with it every
    // Eidos file, after the approval: refuse it before.
    for group in c.states.keys() {
        let name = state_type_name(path, group);
        if let Some(other) = lookup.type_given_by(&name) {
            return Err(format!(
                "its group {group} gives the type {name}, which {other} gives already: name the group differently"
            ));
        }
    }
    let mut seen = BTreeSet::new();
    for f in &c.files {
        if !seen.insert(f.path.as_str()) {
            return Err(format!("{} is listed twice", f.path));
        }
        if let Some(other) = lookup.listed_by(&f.path) {
            return Err(format!(
                "{} of {} is already listed by {other}: every file belongs to exactly one meron",
                f.path, c.package
            ));
        }
    }
    let missing: Vec<&str> = c
        .reads
        .iter()
        .filter(|r| !lookup.is_value(r))
        .map(String::as_str)
        .collect();
    if !missing.is_empty() {
        return Err(format!(
            "it reads values Eidos does not have: {}",
            missing.join(", ")
        ));
    }
    let under = format!("{}.", p.under);
    for u in &c.uses {
        if !u.starts_with(&under) || !lookup.is_component(u) {
            return Err(format!("{u} is not a component in Mero"));
        }
    }
    // Uses go one way: a circle would tie its components so that none could ever retire.
    let mut seen = BTreeSet::new();
    let mut next: Vec<(String, String)> = c.uses.iter().map(|u| (u.clone(), u.clone())).collect();
    while let Some((at, first)) = next.pop() {
        if at == path {
            return Err(format!(
                "{first} uses {path} already, so using it makes a circle"
            ));
        }
        if seen.insert(at.clone()) {
            next.extend(lookup.uses_of(&at).into_iter().map(|u| (u, first.clone())));
        }
    }
    Ok(())
}

/// One active component meron, for the types Mero writes for the code.
pub struct ComponentSource<'a> {
    pub path: &'a str,
    pub spec: &'a Value,
    /// Deprecated in Mero: its types stay, marked, so the code that uses it still builds while it
    /// moves off (18 Nov). A retired component is not given at all.
    pub deprecated: bool,
}

/// `noi.eio.components.world.fairy-bot` and `measure` → `FairyBotMeasure`: the component's name after
/// its group (`world.` left out), then the group's.
pub fn state_type_name(path: &str, group: &str) -> String {
    let name = path
        .strip_prefix("noi.eio.components.")
        .unwrap_or(path)
        .trim_start_matches("world.");
    let pascal = |s: &str| {
        s.split(['.', '-'])
            .filter(|w| !w.is_empty())
            .map(|w| {
                let mut c = w.chars();
                c.next()
                    .map(|f| f.to_ascii_uppercase().to_string() + c.as_str())
                    .unwrap_or_default()
            })
            .collect::<String>()
    };
    pascal(name) + &pascal(group)
}

fn quoted(s: &str) -> String {
    format!("'{}'", s.replace('\\', "\\\\").replace('\'', "\\'"))
}
fn comment(s: &str) -> String {
    s.replace("*/", "* /")
}

/// `components.ts`: every component's states by key, as types the code must use (agreed 18 Nov,
/// "Component States", decision 3). Deterministic: the same merons give the same file. The package's own
/// files give no types; a meron still in the first shape (a list of sentences) is refused.
pub fn export_component_types(sources: &[ComponentSource]) -> Result<String, String> {
    let mut sources: Vec<&ComponentSource> = sources.iter().collect();
    sources.sort_by_key(|s| s.path);
    let mut out = String::from(
        "// Eidos's components and their states, by key, as you approved them in Mero (agreed 18 Nov,\n\
         // \"Component States\"). Mero writes this file after each approval that changes Eidos; nobody\n\
         // edits it. To change a state, change the component's meron and approve it in Review.\n\
         // A component's code reads each option through a table that names every key, so a key missing\n\
         // from the code, or one Mero never approved, fails the type check.\n",
    );
    let mut names = BTreeMap::new();
    let mut table = String::new();
    for src in sources {
        let c = ComponentSpec::parse(src.spec).map_err(|e| format!("{}: {e}", src.path))?;
        let groups = &c.states;
        if groups.is_empty() {
            continue;
        }
        let deprecated = format!(
            "@deprecated {} is deprecated in Mero: move off it before it retires.",
            src.path
        );
        if src.deprecated {
            out.push_str(&format!("\n// {} (deprecated)\n", src.path));
            table.push_str(&format!("  /** {deprecated} */\n"));
        } else {
            out.push_str(&format!("\n// {}\n", src.path));
        }
        table.push_str(&format!("  {}: {{\n", quoted(src.path)));
        for (group, keys) in groups {
            let name = state_type_name(src.path, group);
            if let Some(other) = names.insert(name.clone(), src.path) {
                return Err(format!(
                    "{} and {other} both give the type {name}",
                    src.path
                ));
            }
            let words: Vec<String> = keys
                .iter()
                .map(|(k, w)| format!("{k}: {}", comment(w)))
                .collect();
            if src.deprecated {
                // A tag starts its own line, so editors strike the type through where it is used.
                out.push_str(&format!(
                    "/**\n * {}\n * {deprecated}\n */\n",
                    words.join(" · ")
                ));
            } else {
                out.push_str(&format!("/** {} */\n", words.join(" · ")));
            }
            let union: Vec<String> = keys.keys().map(|k| quoted(k)).collect();
            out.push_str(&format!("export type {name} = {}\n", union.join(" | ")));
            table.push_str(&format!("    {group}: [{}],\n", union.join(", ")));
        }
        table.push_str("  },\n");
    }
    out.push_str(&format!(
        "\n/** Every component's states by key: each group and its keys. */\nexport const states = {{\n{table}}} as const\n"
    ));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    struct Found {
        values: Vec<&'static str>,
        components: Vec<&'static str>,
        files: HashMap<&'static str, &'static str>,
    }
    impl ComponentLookup for Found {
        fn is_value(&self, path: &str) -> bool {
            self.values.contains(&path)
        }
        fn is_component(&self, path: &str) -> bool {
            self.components.contains(&path)
        }
        fn listed_by(&self, file: &str) -> Option<String> {
            self.files.get(file).map(|p| p.to_string())
        }
        fn type_given_by(&self, name: &str) -> Option<String> {
            (name == "CheckboxSize").then(|| "noi.eio.components.world.checkbox".to_string())
        }
        fn uses_of(&self, path: &str) -> Vec<String> {
            match path {
                "noi.eio.components.icon" => vec!["noi.eio.components.choice".into()],
                "noi.eio.components.choice" => vec!["noi.eio.components.radio".into()],
                _ => vec![],
            }
        }
    }
    fn found() -> Found {
        Found {
            values: vec!["noi.eio.color.action.primary", "noi.eio.radius.check"],
            components: vec!["noi.eio.components.choice", "noi.eio.components.icon"],
            files: HashMap::from([("src/Icon.tsx", "noi.eio.components.icon")]),
        }
    }
    fn params() -> Value {
        json!({"under": "noi.eio.components"})
    }
    const CHECKBOX: &str = "noi.eio.components.checkbox";
    fn checkbox() -> Value {
        json!({
            "package": "@noi/eio-react",
            "part": "component",
            "job": "A yes or no, with its words.",
            "states": {
                "checked": {"off": "not ticked", "on": "ticked"},
                "interaction": {"disabled": "locked"}
            },
            "reads": ["noi.eio.color.action.primary"],
            "uses": ["noi.eio.components.choice", "noi.eio.components.icon"],
            "files": [{"path": "src/Checkbox.tsx", "sha256": "0".repeat(64)}]
        })
    }

    #[test]
    fn a_component_reads_values_and_uses_components_mero_has() {
        check_component(CHECKBOX, &checkbox(), &params(), &found()).unwrap();
        let mut c = checkbox();
        c["reads"] = json!(["noi.eio.color.action.primary", "noi.eio.color.nowhere"]);
        assert_eq!(
            check_component(CHECKBOX, &c, &params(), &found()).unwrap_err(),
            "it reads values Eidos does not have: noi.eio.color.nowhere"
        );
        let mut c = checkbox();
        c["uses"] = json!(["noi.eio.components.sidebar"]);
        assert!(check_component(CHECKBOX, &c, &params(), &found())
            .unwrap_err()
            .contains("not a component in Mero"));
        // A component elsewhere in the tree is not one of Eidos's.
        let mut c = checkbox();
        c["uses"] = json!(["noi.eio.radius.check"]);
        assert!(check_component(CHECKBOX, &c, &params(), &found()).is_err());
    }

    #[test]
    fn every_file_belongs_to_exactly_one_meron() {
        let mut c = checkbox();
        c["files"] = json!([{"path": "src/Icon.tsx", "sha256": "0".repeat(64)}]);
        assert_eq!(
            check_component(CHECKBOX, &c, &params(), &found()).unwrap_err(),
            "src/Icon.tsx of @noi/eio-react is already listed by noi.eio.components.icon: every file belongs to exactly one meron"
        );
        let mut c = checkbox();
        let f = json!({"path": "src/Checkbox.tsx", "sha256": "0".repeat(64)});
        c["files"] = json!([f, f]);
        assert!(check_component(CHECKBOX, &c, &params(), &found())
            .unwrap_err()
            .contains("listed twice"));
    }

    #[test]
    fn components_have_states_and_the_package_has_none() {
        let mut c = checkbox();
        c["states"] = json!({});
        assert_eq!(
            check_component(CHECKBOX, &c, &params(), &found()).unwrap_err(),
            "a component names its states"
        );
        c["part"] = json!("shared-part");
        check_component(CHECKBOX, &c, &params(), &found()).unwrap();
        c["part"] = json!("package");
        check_component(CHECKBOX, &c, &params(), &found()).unwrap();
        c["states"] = json!({"checked": {"on": "ticked"}});
        assert!(check_component(CHECKBOX, &c, &params(), &found()).is_err());
    }

    #[test]
    fn states_by_key_in_groups() {
        let mut c = checkbox();
        c["states"] = json!({"variant": {"list": "in a list", "tile": "a tile"}, "interaction": {"focus": "focused"}});
        check_component(CHECKBOX, &c, &params(), &found()).unwrap();
        c["states"] = json!({"variant": {}});
        assert_eq!(
            check_component(CHECKBOX, &c, &params(), &found()).unwrap_err(),
            "the group variant names no state"
        );
        c["states"] = json!({"variant": {"list": "in a list"}, "size": {}});
        assert_eq!(
            check_component(CHECKBOX, &c, &params(), &found()).unwrap_err(),
            "the group size names no state"
        );
        c["part"] = json!("package");
        c["states"] = json!({});
        check_component(CHECKBOX, &c, &params(), &found()).unwrap();
    }

    #[test]
    fn uses_go_one_way() {
        // icon uses choice, which uses radio: radio may use neither.
        let radio = "noi.eio.components.radio";
        let mut c = checkbox();
        c["uses"] = json!(["noi.eio.components.icon"]);
        assert_eq!(
            check_component(radio, &c, &params(), &found()).unwrap_err(),
            "noi.eio.components.icon uses noi.eio.components.radio already, so using it makes a circle"
        );
        check_component(CHECKBOX, &c, &params(), &found()).unwrap();
    }

    #[test]
    fn two_components_never_give_one_type() {
        let mut c = checkbox();
        c["states"] = json!({"checked": {"on": "ticked"}, "size": {"small": "small"}});
        assert_eq!(
            check_component(CHECKBOX, &c, &params(), &found()).unwrap_err(),
            "its group size gives the type CheckboxSize, which noi.eio.components.world.checkbox gives already: name the group differently"
        );
    }

    #[test]
    fn a_deprecated_components_types_stay_marked() {
        let chip = json!({"package": "@noi/eio-react", "part": "component", "states": {
            "link": {"inside": "opens here", "outside": "in a new tab"}
        }, "files": []});
        let ts = export_component_types(&[ComponentSource {
            path: "noi.eio.components.chip",
            spec: &chip,
            deprecated: true,
        }])
        .unwrap();
        assert!(ts.contains("// noi.eio.components.chip (deprecated)\n"));
        assert!(ts.contains(
            "/**\n * inside: opens here · outside: in a new tab\n * @deprecated noi.eio.components.chip is deprecated in Mero: move off it before it retires.\n */\nexport type ChipLink = 'inside' | 'outside'\n"
        ));
        assert!(ts.contains("  /** @deprecated noi.eio.components.chip is deprecated in Mero: move off it before it retires. */\n  'noi.eio.components.chip': {\n    link: ['inside', 'outside'],\n  },\n"));
    }

    #[test]
    fn the_types_mero_writes() {
        assert_eq!(
            state_type_name("noi.eio.components.button", "variant"),
            "ButtonVariant"
        );
        assert_eq!(
            state_type_name("noi.eio.components.world.fairy-bot", "motion"),
            "FairyBotMotion"
        );
        assert_eq!(
            state_type_name("noi.eio.components.text-area", "interaction"),
            "TextAreaInteraction"
        );
        let button = json!({"package": "@noi/eio-react", "part": "component", "states": {
            "variant": {"primary": "for the one main action", "plain": "for the rest"},
            "interaction": {"hover": "hovered"}
        }, "files": []});
        let package =
            json!({"package": "@noi/eio-react", "part": "package", "states": {}, "files": []});
        let ts = export_component_types(&[
            ComponentSource {
                path: "noi.eio.components.button",
                spec: &button,
                deprecated: false,
            },
            ComponentSource {
                path: "noi.eio.components.package",
                spec: &package,
                deprecated: false,
            },
        ])
        .unwrap();
        assert!(ts.contains("/** plain: for the rest · primary: for the one main action */\nexport type ButtonVariant = 'plain' | 'primary'\n"));
        assert!(ts.contains("export type ButtonInteraction = 'hover'\n"));
        assert!(ts.contains("  'noi.eio.components.button': {\n    interaction: ['hover'],\n    variant: ['plain', 'primary'],\n  },\n"));
        assert!(
            !ts.contains("package"),
            "the package's own files give no types"
        );
        // The first shape, a list of sentences, was dropped from the rule (18 Nov).
        let old = json!({"package": "@noi/eio-react", "part": "component", "states": ["on"], "files": []});
        assert!(export_component_types(&[ComponentSource {
            path: "noi.eio.components.radio",
            spec: &old,
            deprecated: false,
        }])
        .unwrap_err()
        .starts_with("noi.eio.components.radio: invalid component"));
        assert!(check_component(CHECKBOX, &old, &params(), &found()).is_err());
        // Two components may not give one type name.
        let twin = ComponentSource {
            path: "noi.eio.components.world.button",
            spec: &button,
            deprecated: false,
        };
        assert!(export_component_types(&[
            ComponentSource {
                path: "noi.eio.components.button",
                spec: &button,
                deprecated: false,
            },
            twin,
        ])
        .unwrap_err()
        .contains("both give the type"));
    }

    #[test]
    fn parameters_name_where_components_live() {
        assert!(ComponentParams::parse(&json!({})).is_err());
        assert!(ComponentParams::parse(&json!({"under": "eio.components"})).is_err());
        assert!(ComponentParams::parse(&json!({"under": "noi.eio.components", "x": 1})).is_err());
        assert!(
            !ComponentParams::parse(&params()).unwrap().folders,
            "off unless the rule asks it"
        );
    }

    #[test]
    fn where_the_rule_asks_it_each_file_sits_in_its_folder() {
        let folders = json!({"under": "noi.eio.components", "folders": true});
        let with = |c: &mut Value, files: &[&str]| {
            c["files"] = json!(files
                .iter()
                .map(|f| json!({"path": f, "sha256": "0".repeat(64)}))
                .collect::<Vec<_>>());
        };
        let mut c = checkbox();
        // The rule's earlier versions do not ask it.
        check_component(CHECKBOX, &c, &params(), &found()).unwrap();
        assert_eq!(
            check_component(CHECKBOX, &c, &folders, &found()).unwrap_err(),
            "its file src/Checkbox.tsx is not in its folder: each file sits in a folder named for it, checkbox"
        );
        with(
            &mut c,
            &[
                "src/Checkbox/Checkbox.module.css",
                "src/Checkbox/Checkbox.tsx",
            ],
        );
        check_component(CHECKBOX, &c, &folders, &found()).unwrap();
        with(
            &mut c,
            &[
                "src/Checkbox/Checkbox.tsx",
                "src/Button/Checkbox.module.css",
            ],
        );
        assert!(
            check_component(CHECKBOX, &c, &folders, &found()).is_err(),
            "one file astray is enough"
        );
        // Named as the code names it: case and hyphens do not count, a shared part too.
        with(&mut c, &["src/MenuIcon/MenuIcon.tsx"]);
        check_component("noi.eio.components.menu-icon", &c, &folders, &found()).unwrap();
        with(&mut c, &["src/character-drawing/characters.ts"]);
        c["part"] = json!("shared-part");
        check_component(
            "noi.eio.components.world.character-drawing",
            &c,
            &folders,
            &found(),
        )
        .unwrap();
        with(&mut c, &["src/characters.ts"]);
        assert!(check_component(
            "noi.eio.components.world.character-drawing",
            &c,
            &folders,
            &found()
        )
        .is_err());
        // The package's own files sit where the package keeps them.
        c["part"] = json!("package");
        c["states"] = json!({});
        with(
            &mut c,
            &["package.json", "src/index.ts", "test/rules.test.mjs"],
        );
        check_component("noi.eio.components.package", &c, &folders, &found()).unwrap();
    }
}
