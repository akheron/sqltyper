use crate::{ast, StatementRowCount};

pub fn infer_row_count(ast: &ast::AST<'_>) -> StatementRowCount {
    match ast {
        ast::AST::Insert(ast::Insert { values, returning, .. }) => {
            match returning {
                Some(_) => match values {
                    // INSERT INTO ... DEFAULT VALUES always creates a single row
                    ast::Values::DefaultValues => StatementRowCount::One,
                    ast::Values::Values(expr_values) => {
                        // Check the length of the VALUES expression list
                        if expr_values.len() == 1 {
                            StatementRowCount::One
                        } else {
                            StatementRowCount::Many
                        }
                    }
                }
                // No RETURNING, no output
                None => StatementRowCount::Zero,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::StatementRowCount;
    use self::utils::test;

    #[test]
    fn test_insert() {
        test("INSERT INTO person DEFAULT VALUES", StatementRowCount::Zero);
        test("INSERT INTO person VALUES (1, 2), (3, 4)", StatementRowCount::Zero);
        test("INSERT INTO person VALUES (1, 2), (3, 4), (5, 6) RETURNING id", StatementRowCount::Many);
        test("INSERT INTO person DEFAULT VALUES RETURNING id", StatementRowCount::One);
        test("INSERT INTO person VALUES (1, 2) RETURNING id", StatementRowCount::One);
        test("INSERT INTO person VALUES (1, 2), (3, 4) RETURNING id", StatementRowCount::Many);
        test("INSERT INTO person VALUES (1, 2), (3, 4), (5, 6) RETURNING id", StatementRowCount::Many);
    }

    mod utils {
        use crate::infer::rowcount::infer_row_count;
        use crate::parser::parse_sql;
        use crate::StatementRowCount;

        pub fn test(sql: &str, expected: StatementRowCount) {
            let ast = parse_sql(sql).unwrap();
            assert_eq!(infer_row_count(&ast), expected)
        }
    }
}
