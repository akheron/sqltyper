use std::path::Path;

mod utils;
use crate::utils::run_test_file;

#[tokio::test]
async fn test_select_cte() {
    run_test_file(Path::new("tests/integration/cte-select.sql")).await;
}

#[tokio::test]
async fn test_insert() {
    run_test_file(Path::new("tests/integration/insert.sql")).await;
}

#[tokio::test]
async fn test_insert_select() {
    run_test_file(Path::new("tests/integration/insert-select.sql")).await;
}

#[tokio::test]
async fn test_update() {
    run_test_file(Path::new("tests/integration/update.sql")).await;
}

#[tokio::test]
async fn test_any_some_all() {
    run_test_file(Path::new("tests/integration/any-some-all.sql")).await;
}
