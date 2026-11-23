//! The Eidos component merons in `data/eio/components` ("Components in Mero", agreed 17 Nov 2026)
//! pass the component invariant and its check before anyone proposes them, and every file of the
//! two Eidos packages is listed by exactly one of them (decision 3). No database: the invariant and
//! the check run directly on the files, with what `data/eio` holds standing in for Mero.
//!
//! That the fingerprints, reads and uses match the code is said by `scripts/eio-components.mjs
//! --check`; comparing the code with what Mero approved is the check of part B, not this test.
use noi_eio::{
    check_component, export_component_types, ComponentLookup, ComponentSource, ComponentSpec, Part,
};
use noi_inv::{InvariantSpec, MeronType, NewMeron};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs,
    path::{Path, PathBuf},
};

const PACKAGES: [(&str, &str); 2] = [
    ("@noi/eio-react", "ui/packages/eio-react"),
    ("@noi/eio-3d", "ui/packages/eio-3d"),
];

fn noi() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn walk(dir: &Path, keep: &dyn Fn(&Path) -> bool) -> Vec<PathBuf> {
    let mut out = vec![];
    for entry in fs::read_dir(dir).unwrap() {
        let p = entry.unwrap().path();
        let name = p.file_name().unwrap().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" {
            continue;
        }
        if p.is_dir() {
            out.extend(walk(&p, keep));
        } else if keep(&p) {
            out.push(p);
        }
    }
    out.sort();
    out
}
fn json_files(dir: &Path) -> Vec<NewMeron> {
    walk(dir, &|p| p.extension().is_some_and(|e| e == "json"))
        .iter()
        .map(|f| serde_json::from_str(&fs::read_to_string(f).unwrap()).unwrap())
        .collect()
}
fn components() -> Vec<NewMeron> {
    json_files(&noi().join("data/eio/components"))
}
fn invariant() -> InvariantSpec {
    let file = noi().join("data/eio/component-invariant.json");
    let meron: NewMeron = serde_json::from_str(&fs::read_to_string(file).unwrap()).unwrap();
    meron.validate().unwrap();
    assert_eq!(meron.path, "noi.eio.inv.component");
    InvariantSpec::parse(&meron.spec).unwrap()
}

/// What `data/eio` holds, standing in for Mero: its values, the component merons, and which of
/// them lists each file.
struct Data {
    values: BTreeSet<String>,
    components: BTreeSet<String>,
    files: HashMap<(String, String), Vec<String>>,
    types: HashMap<String, Vec<String>>,
    uses: HashMap<String, Vec<String>>,
}
fn data() -> Data {
    let all = json_files(&noi().join("data/eio"));
    let mut files: HashMap<(String, String), Vec<String>> = HashMap::new();
    let mut types: HashMap<String, Vec<String>> = HashMap::new();
    for c in components() {
        let spec = ComponentSpec::parse(&c.spec).unwrap();
        for group in spec.states.keys() {
            types
                .entry(noi_eio::state_type_name(&c.path, group))
                .or_default()
                .push(c.path.clone());
        }
        for f in spec.files {
            files
                .entry((spec.package.clone(), f.path))
                .or_default()
                .push(c.path.clone());
        }
    }
    Data {
        values: all
            .iter()
            .filter(|m| m.classification.kind == MeronType::Token)
            .map(|m| m.path.clone())
            .collect(),
        components: components().into_iter().map(|m| m.path).collect(),
        files,
        types,
        uses: components()
            .into_iter()
            .map(|m| (m.path, ComponentSpec::parse(&m.spec).unwrap().uses))
            .collect(),
    }
}
/// The lookup for one meron: the others are what lists a file.
struct For<'a> {
    data: &'a Data,
    package: String,
    path: String,
}
impl ComponentLookup for For<'_> {
    fn is_value(&self, path: &str) -> bool {
        self.data.values.contains(path)
    }
    fn is_component(&self, path: &str) -> bool {
        self.data.components.contains(path)
    }
    fn listed_by(&self, file: &str) -> Option<String> {
        self.data
            .files
            .get(&(self.package.clone(), file.to_string()))?
            .iter()
            .find(|p| **p != self.path)
            .cloned()
    }
    fn uses_of(&self, path: &str) -> Vec<String> {
        self.data.uses.get(path).cloned().unwrap_or_default()
    }
    fn type_given_by(&self, name: &str) -> Option<String> {
        self.data
            .types
            .get(name)?
            .iter()
            .find(|p| **p != self.path)
            .cloned()
    }
}

#[test]
fn the_component_invariant_covers_every_component() {
    let inv = invariant();
    assert_eq!(inv.applies_to.kind, MeronType::Component);
    assert_eq!(inv.applies_to.subtype, None, "one rule for every component");
    assert_eq!(inv.checks.len(), 1);
    assert_eq!(inv.checks[0].name, noi_eio::COMPONENT_CHECK);
    noi_eio::ComponentParams::parse(&inv.checks[0].params).unwrap();
}

#[test]
fn eio_components_pass_their_invariant() {
    let inv = invariant();
    let data = data();
    let mut count: BTreeMap<(String, &str), usize> = BTreeMap::new();
    for c in components() {
        c.validate().unwrap_or_else(|e| panic!("{}: {e}", c.path));
        assert!(
            c.path.starts_with("noi.eio.components."),
            "{}: components live under noi.eio.components",
            c.path
        );
        assert!(inv.applies_to.covers(&c.classification), "{}", c.path);
        inv.check(&c.spec)
            .unwrap_or_else(|e| panic!("{}: {e}", c.path));
        let spec = ComponentSpec::parse(&c.spec).unwrap();
        let lookup = For {
            data: &data,
            package: spec.package.clone(),
            path: c.path.clone(),
        };
        check_component(&c.path, &c.spec, &inv.checks[0].params, &lookup)
            .unwrap_or_else(|e| panic!("{}: {e}", c.path));
        let part = match spec.part {
            Part::Component => "components",
            Part::SharedPart => "shared parts",
            Part::Package => "the package's own",
        };
        *count.entry((spec.package, part)).or_default() += 1;
        // Fingerprints are filled in by scripts/eio-components.mjs, never left out.
        assert!(
            spec.files.iter().all(|f| f.sha256.len() == 64),
            "{}",
            c.path
        );
    }
    let n = |p: &str, part| count.get(&(p.to_string(), part)).copied().unwrap_or(0);
    // Today's components (decision 7): the 17 in @noi/eio-react (the icon set is one), the Chip (Links
    // Drawn by Eidos, agreed 18 Nov), the Sidebar (its own batch, 18 Nov) and the Toggle (agreed 22
    // Nov), the box Checkbox and Radio share, where a link leads (Button's and Chip's, its own part
    // since each component got a folder, 18 Nov), and the package's own files; in @noi/eio-3d, the
    // three characters and the new world's eight elements (the base tile, the astroid, the three
    // platforms, the drone, the camera module and the stage, 23 Nov; the first world's elements were
    // taken out the same day), the part that draws the characters, the part every element shares,
    // and the package's own files.
    assert_eq!(n("@noi/eio-react", "components"), 20);
    assert_eq!(n("@noi/eio-react", "shared parts"), 2);
    assert_eq!(n("@noi/eio-react", "the package's own"), 1);
    assert_eq!(n("@noi/eio-3d", "components"), 11);
    assert_eq!(n("@noi/eio-3d", "shared parts"), 2);
    assert_eq!(n("@noi/eio-3d", "the package's own"), 1);
}

/// Decision 3: a file no meron lists is a change nobody approved, and a file two merons list has
/// two owners. Fails as soon as a file is added to either package without its meron.
#[test]
fn every_file_of_both_packages_is_listed_by_exactly_one_meron() {
    let data = data();
    let mut problems = vec![];
    for (package, dir) in PACKAGES {
        let root = noi().join("..").join(dir);
        let on_disk: BTreeSet<String> = walk(&root, &|_| true)
            .iter()
            .map(|f| {
                f.strip_prefix(&root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/")
            })
            .collect();
        for f in &on_disk {
            match data.files.get(&(package.to_string(), f.clone())) {
                None => problems.push(format!("{package} {f}: no meron lists it")),
                Some(o) if o.len() > 1 => {
                    problems.push(format!("{package} {f}: listed by {}", o.join(" and ")))
                }
                Some(_) => {}
            }
        }
        for (p, f) in data.files.keys() {
            if p == package && !on_disk.contains(f) {
                problems.push(format!("{package} {f}: listed, but not in the package"));
            }
        }
    }
    assert!(problems.is_empty(), "{}", problems.join("\n"));
}

/// Mero's links between merons may not go round in a circle, so the components a meron uses can
/// always be added before it.
#[test]
fn what_components_use_goes_one_way() {
    let uses: BTreeMap<String, Vec<String>> = components()
        .into_iter()
        .map(|c| (c.path, ComponentSpec::parse(&c.spec).unwrap().uses))
        .collect();
    let mut done = BTreeSet::new();
    while done.len() < uses.len() {
        let ready: Vec<String> = uses
            .iter()
            .filter(|(p, u)| !done.contains(*p) && u.iter().all(|x| done.contains(x)))
            .map(|(p, _)| p.clone())
            .collect();
        assert!(
            !ready.is_empty(),
            "a circle among: {:?}",
            uses.keys()
                .filter(|p| !done.contains(*p))
                .collect::<Vec<_>>()
        );
        done.extend(ready);
    }
}

/// The schema refuses what a component meron must not hold: the code itself, a fingerprint that is
/// not one, a file outside its package's folder, or a package Eidos does not have.
#[test]
fn the_component_invariant_keeps_code_out_of_mero() {
    let inv = invariant();
    let good = components()
        .into_iter()
        .find(|c| c.path == "noi.eio.components.button")
        .unwrap()
        .spec;
    inv.check(&good).unwrap();
    let mut bad = good.clone();
    bad["code"] = serde_json::json!("export function Button() {}");
    assert!(inv.check(&bad).is_err());
    let mut bad = good.clone();
    bad["files"][0]["sha256"] = serde_json::json!("not a fingerprint");
    assert!(inv.check(&bad).is_err());
    for outside in [
        "../eio-tokens/tokens.css",
        "/etc/hosts",
        ".env",
        "src/../../x",
    ] {
        let mut bad = good.clone();
        bad["files"][0]["path"] = serde_json::json!(outside);
        assert!(inv.check(&bad).is_err(), "{outside}");
    }
    let mut bad = good.clone();
    bad["package"] = serde_json::json!("@noi/eio-elsewhere");
    assert!(inv.check(&bad).is_err());
    let mut bad = good;
    bad["files"] = serde_json::json!([]);
    assert!(inv.check(&bad).is_err());
}

/// "Component States" (agreed 18 Nov), decision 3: Mero writes each component's keys as types into
/// `@noi/eio-tokens/components.ts`, and nobody edits that file. After an approval Mero writes it from
/// the merons it holds; on a branch, before the approval, Mero's same writer makes it from the merons
/// as proposed (run this test with NOI_WRITE_TYPES=1). Either way it is exactly what Mero writes.
#[test]
fn the_types_file_is_what_mero_writes() {
    let merons = components();
    let sources: Vec<ComponentSource> = merons
        .iter()
        .map(|m| ComponentSource {
            path: &m.path,
            spec: &m.spec,
            // The data files hold today's components: none deprecated.
            deprecated: false,
        })
        .collect();
    let ts = export_component_types(&sources).unwrap();
    let file = noi().join("../ui/packages/eio-tokens/components.ts");
    if std::env::var_os("NOI_WRITE_TYPES").is_some() {
        fs::write(&file, &ts).unwrap();
    }
    assert_eq!(
        fs::read_to_string(&file).unwrap_or_default(),
        ts,
        "components.ts is not what Mero writes from these merons"
    );
}

/// Decision 1: every component is in the new shape, states by key; the package's own files have none.
#[test]
fn every_component_has_its_states_by_key() {
    for c in components() {
        let spec = ComponentSpec::parse(&c.spec)
            .unwrap_or_else(|e| panic!("{}: its states are not by key: {e}", c.path));
        match spec.part {
            Part::Component => assert!(!spec.states.is_empty(), "{}: names no states", c.path),
            Part::Package => assert!(
                spec.states.is_empty(),
                "{}: the package's files have states",
                c.path
            ),
            Part::SharedPart => {}
        }
    }
}
