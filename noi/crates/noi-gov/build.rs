fn main() {
    // `sqlx::migrate!` reads the migrations while compiling: a new or changed one must rebuild
    // Governance, or `migrate` runs without it (found 9 Nov).
    println!("cargo:rerun-if-changed=migrations");
}
