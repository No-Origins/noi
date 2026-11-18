//! The system files in `data/` (17 Nov): Mero and Hyperbase join Invariants, Governance and Eidos,
//! so that the 3D world, which gives each system an arch, shows all five. No database.
use noi_inv::NewMeron;
use std::{fs, path::Path};

fn meron(file: &str) -> NewMeron {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../data")
        .join(file);
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

#[test]
fn mero_and_hyperbase_are_systems_under_the_root() {
    let eidos = meron("eio/eio.json");
    for (file, path, name) in [
        ("mer/mer.json", "noi.mer", "Mero"),
        ("hyp/hyp.json", "noi.hyp", "Hyperbase"),
    ] {
        let m = meron(file);
        m.validate().unwrap_or_else(|e| panic!("{file}: {e}"));
        assert_eq!(m.path, path);
        assert_eq!(m.name, name);
        assert_eq!(m.classification.kind.as_str(), "system", "{file}");
        // Under the root, like Eidos: the same scope.
        assert_eq!(m.authority_scope, eidos.authority_scope, "{file}");
        // A system holds no spec: no invariant applies to it.
        assert!(
            m.spec.is_null() || m.spec.as_object().is_some_and(|o| o.is_empty()),
            "{file}"
        );
    }
}
