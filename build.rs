use std::env;
use std::fs::read_dir;
use std::fs::DirEntry;
use std::fs::File;
use std::io::Write;
use std::path::Path;

fn main() {
    generate_integration_tests()
}

const TESTS_DIR: &str = "tests/integration";

/// Generate tests cases from files under tests/integration/
fn generate_integration_tests() {
    let out_dir = env::var("OUT_DIR").unwrap();
    let destination = Path::new(&out_dir).join("tests.rs");
    let mut test_file = File::create(&destination).unwrap();

    println!("cargo:rerun-if-changed={}", TESTS_DIR);
    let dirents = read_dir(TESTS_DIR).unwrap();

    for dirent in dirents {
        write_test(&mut test_file, &dirent.unwrap());
    }
}

fn write_test(test_file: &mut File, dirent: &DirEntry) {
    let path = dirent.path();
    let test_name = path
        .file_name()
        .unwrap()
        .to_string_lossy()
        .replace('-', "_")
        .replace('.', "_");

    write!(
        test_file,
        r#"
#[tokio::test]
async fn {test_name}() {{
    run_test_file(Path::new("{test_path}")).await;
}}
"#,
        test_name = test_name,
        test_path = path.display()
    )
    .unwrap();
}
