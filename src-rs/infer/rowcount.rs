use crate::{ast, RowCount};

pub fn infer_row_count(ast: &ast::Ast<'_>) -> RowCount {
    match &ast.query {
        ast::Query::Select(select) => infer_select_row_count(select),
        ast::Query::Insert(insert) => {
            let ast::Insert {
                values, returning, ..
            } = insert.as_ref();
            match returning {
                Some(_) => match values {
                    // INSERT INTO ... DEFAULT VALUES always creates a single row
                    ast::Values::Default => RowCount::One,
                    ast::Values::Expression(values) => {
                        // Check the length of the VALUES expression list
                        if values.len() == 1 {
                            RowCount::One
                        } else {
                            RowCount::Many
                        }
                    }
                    ast::Values::Query(select) => infer_select_row_count(&select.query),
                },
                // No RETURNING, no output
                None => RowCount::Zero,
            }
        }
        ast::Query::Update(update) => {
            let ast::Update { returning, .. } = update.as_ref();
            match returning {
                Some(_) => RowCount::Many,
                None => RowCount::Zero,
            }
        }
        ast::Query::Delete(delete) => {
            let ast::Delete { returning, .. } = delete.as_ref();
            match returning {
                Some(_) => RowCount::Many,
                None => RowCount::Zero,
            }
        }
    }
}

fn infer_select_row_count(select: &ast::Select<'_>) -> RowCount {
    let ast::Select {
        body,
        set_ops,
        limit,
        ..
    } = select;
    if set_ops.is_empty() && body.from.is_none() {
        // No UNION/INTERSECT/EXCEPT, no FROM clause => one row
        RowCount::One
    } else if let Some(ast::Limit {
        count: Some(ast::Expression::Constant(ast::Constant::Number("1"))),
        ..
    }) = limit
    {
        // LIMIT 1 => zero or one row
        RowCount::ZeroOrOne
    } else {
        RowCount::Many
    }
}

#[cfg(test)]
mod tests {
    use crate::RowCount;

    use self::utils::test;

    #[test]
    fn test_insert() {
        test("INSERT INTO person DEFAULT VALUES", RowCount::Zero);
        test(
            "INSERT INTO person VALUES (1, 2), (3, 4)",
            RowCount::Zero,
        );
        test(
            "INSERT INTO person VALUES (1, 2), (3, 4), (5, 6) RETURNING id",
            RowCount::Many,
        );
        test(
            "INSERT INTO person DEFAULT VALUES RETURNING id",
            RowCount::One,
        );
        test(
            "INSERT INTO person VALUES (1, 2) RETURNING id",
            RowCount::One,
        );
        test(
            "INSERT INTO person VALUES (1, 2), (3, 4) RETURNING id",
            RowCount::Many,
        );
        test(
            "INSERT INTO person VALUES (1, 2), (3, 4), (5, 6) RETURNING id",
            RowCount::Many,
        );
        test(
            "INSERT INTO person SELECT 1, 2 RETURNING *",
            RowCount::One,
        );
        test(
            "INSERT INTO person SELECT * FROM other LIMIT 1 RETURNING *",
            RowCount::ZeroOrOne,
        );
        test(
            "INSERT INTO person SELECT * FROM other RETURNING *",
            RowCount::Many,
        );
    }

    #[test]
    fn test_delete() {
        test("DELETE FROM person", RowCount::Zero);
        test("DELETE FROM person RETURNING id", RowCount::Many);
    }

    mod utils {
        use crate::infer::rowcount::infer_row_count;
        use crate::parser::parse_sql;
        use crate::RowCount;

        pub fn test(sql: &str, expected: RowCount) {
            let ast = parse_sql(sql).unwrap();
            assert_eq!(infer_row_count(&ast), expected)
        }
    }
}
