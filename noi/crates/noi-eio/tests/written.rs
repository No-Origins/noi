//! Part B, decision 5 (agreed 18 Nov): the branch carries Eidos's four files, made by Mero's writer
//! from the meron files beside them. This test fails when someone changed a meron file and forgot
//! `pnpm eio:write`, or edited a written file by hand.
use std::path::Path;

#[test]
fn eidos_files_are_what_meros_writer_makes() {
    let here = Path::new(env!("CARGO_MANIFEST_DIR"));
    let written = noi_eio::write_from_data(&here.join("../../data/eio")).unwrap();
    let out = here.join("../../../ui/packages/eio-tokens");
    assert_eq!(written.files.len(), 4);
    for (name, body) in &written.files {
        let have = std::fs::read_to_string(out.join(name)).unwrap_or_default();
        assert!(
            &have == body,
            "{name} is not what Mero's writer makes from noi/data/eio: run pnpm eio:write and commit it"
        );
    }
}
