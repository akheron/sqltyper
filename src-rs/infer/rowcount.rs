use crate::{ast, StatementRowCount};

pub fn infer_row_count(ast: &ast::Ast<'_>) -> StatementRowCount {
    match &ast.query {
        ast::Query::Select(select) => infer_select_row_count(select),
        ast::Query::Insert(insert) => {
            let ast::Insert {
                values, returning, ..
            } = insert.as_ref();
            match returning {
                Some(_) => match values {
                    // INSERT INTO ... DEFAULT VALUES always creates a single row
                    ast::Values::Default => StatementRowCount::One,
                    ast::Values::Expression(values) => {
                        // Check the length of the VALUES expression list
                        if values.len() == 1 {
                            StatementRowCount::One
                        } else {
                            StatementRowCount::Many
                        }
                    }
                    ast::Values::Query(select) => infer_select_row_count(&select.query),
                },
                // No RETURNING, no output
                None => StatementRowCount::Zero,
            }
        }
        ast::Query::Update(update) => {
            let ast::Update { returning, .. } = update.as_ref();
            match returning {
                Some(_) => StatementRowCount::Many,
                None => StatementRowCount::Zero,
            }
        }
        ast::Query::Delete(delete) => {
            let ast::Delete { returning, .. } = delete.as_ref();
            match returning {
                Some(_) => StatementRowCount::Many,
                None => StatementRowCount::Zero,
            }
        }
    }
}

fn infer_select_row_count(select: &ast::Select<'_>) -> StatementRowCount {
    let ast::Select {
        body,
        set_ops,
        limit,
        ..
    } = select;
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

#[cfg(test)]
mod tests {
    use crate::StatementRowCount;

    use self::utils::test;

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
        test(
            "INSERT INTO person SELECT 1, 2 RETURNING *",
            StatementRowCount::One,
        );
        test(
            "INSERT INTO person SELECT * FROM other LIMIT 1 RETURNING *",
            StatementRowCount::ZeroOrOne,
        );
        test(
            "INSERT INTO person SELECT * FROM other RETURNING *",
            StatementRowCount::Many,
        );
    }

    #[test]
    fn test_delete() {
        test("DELETE FROM person", StatementRowCount::Zero);
        test("DELETE FROM person RETURNING id", StatementRowCount::Many);
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
