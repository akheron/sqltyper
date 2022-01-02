use super::parse_sql;

fn assert_parse(input: &str) {
    if let Err(err) = parse_sql(input) {
        panic!(
            "sql statement failed to parse: {}\nparse error: {}",
            input, err
        );
    }
}

#[test]
fn test_insert() {
    assert_parse("INSERT INTO person (name, age) VALUES ($1, $2);");
}
