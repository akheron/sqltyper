use crate::{ast, StatementRowCount};

pub fn infer_row_count(ast: &ast::AST<'_>) -> StatementRowCount {
    match &ast.query {
        ast::Query::Select(ast::Select {
            body,
            set_ops,
            limit,
            ..
        }) => {
            if set_ops.is_empty() && body.from.is_none() {
                // No UNION/INTERSECT/EXCEPT, no FROM clause => one row
                StatementRowCount::One
            } else if let Some(ast::Limit {
                count: Some(ast::Expression::Constant(ast::Constant::Number("1"))),
                ..
            }) = limit
            {
                // LIMIT 1 => zero or one row
                StatementRowCount::ZeroOrOne
            } else {
                StatementRowCount::Many
            }
        }
        ast::Query::Insert(ast::Insert {
            values, returning, ..
        }) => {
            match returning {
                Some(_) => match values {
                    // INSERT INTO ... DEFAULT VALUES always creates a single row
                    ast::Values::DefaultValues => StatementRowCount::One,
                    ast::Values::Values { values, .. } => {
                        // Check the length of the VALUES expression list
                        if values.len() == 1 {
                            StatementRowCount::One
                        } else {
                            StatementRowCount::Many
                        }
                    }
                },
                // No RETURNING, no output
                None => StatementRowCount::Zero,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use self::utils::test;
    use crate::StatementRowCount;

    #[test]
    fn test_insert() {
        test("INSERT INTO person DEFAULT VALUES", StatementRowCount::Zero);
        test(
            "INSERT INTO person VALUES (1, 2), (3, 4)",
            StatementRowCount::Zero,
        );
        test(
            "INSERT INTO person VALUES (1, 2), (3, 4), (5, 6) RETURNING id",
            StatementRowCount::Many,
        );
        test(
            "INSERT INTO person DEFAULT VALUES RETURNING id",
            StatementRowCount::One,
        );
        test(
            "INSERT INTO person VALUES (1, 2) RETURNING id",
            StatementRowCount::One,
        );
        test(
            "INSERT INTO person VALUES (1, 2), (3, 4) RETURNING id",
            StatementRowCount::Many,
        );
        test(
            "INSERT INTO person VALUES (1, 2), (3, 4), (5, 6) RETURNING id",
            StatementRowCount::Many,
        );
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
