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
    assert_parse("INSERT INTO person (id, age) VALUES ($1, $2), ($3, $4)");
    assert_parse("INSERT INTO person VALUES (1, 2) ON CONFLICT DO NOTHING");
    assert_parse("INSERT INTO person VALUES (1, 2) ON CONFLICT ON CONSTRAINT constr DO NOTHING");
    assert_parse("INSERT INTO person VALUES (1, 2) ON CONFLICT (name) DO NOTHING");
    assert_parse(
        "INSERT INTO person VALUES (1, 2) ON CONFLICT (name) DO UPDATE SET age = 1, flag = true",
    );
}
