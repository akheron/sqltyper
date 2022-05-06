use std::collections::HashSet;

use crate::ast;
use crate::ast::UpdateValue;
use crate::infer::db::{DatabaseColumn, SchemaClient};
use crate::infer::error::Error;

#[derive(Debug, PartialEq)]
pub struct NullableParams(HashSet<usize>);

impl NullableParams {
    pub fn is_nullable(&self, param: usize) -> bool {
        self.0.contains(&param)
    }
}

impl NullableParams {
    fn from_values(
        target_columns: &[DatabaseColumn],
        values: &[Vec<ast::ValuesValue<'_>>],
    ) -> Self {
        let values_list_params = find_params_from_values(values);

        let mut result: HashSet<usize> = HashSet::new();
        for values_params in values_list_params {
            for i in 0..values_params.len() {
                if let Some(param_index) = values_params[i] {
                    let target_column = &target_columns[i];
                    if target_column.nullable {
                        result.insert(param_index);
                    }
                }
            }
        }
        Self(result)
    }

    fn from_updates(db_columns: &[DatabaseColumn], updates: &[ast::UpdateAssignment<'_>]) -> Self {
        let mut result: HashSet<usize> = HashSet::new();
        for update in updates {
            if let Some(param) = update_to_param_nullability(db_columns, update) {
                result.insert(param);
            }
        }
        Self(result)
    }

    fn extend(&mut self, other: Self) {
        self.0.extend(other.0.iter());
    }
}

pub async fn infer_param_nullability(
    client: &SchemaClient<'_>,
    ast: &ast::Ast<'_>,
) -> Result<NullableParams, Error> {
    match &ast.query {
        ast::Query::Select(_) => {}
        ast::Query::Insert(insert) => {
            let ast::Insert {
                table,
                columns,
                values,
                on_conflict,
                ..
            } = insert.as_ref();
            match values {
                ast::Values::Default => {}
                ast::Values::Expression(values) => {
                    let table_columns = client.get_table_columns(table).await?;
                    let target_columns = find_insert_columns(columns, table_columns)?;
                    let mut nullable_params = NullableParams::from_values(&target_columns, values);

                    if let Some(ast::OnConflict {
                        conflict_action: ast::ConflictAction::DoUpdate(update_assignments),
                        ..
                    }) = on_conflict
                    {
                        let updates =
                            NullableParams::from_updates(&target_columns, update_assignments);
                        nullable_params.extend(updates);
                    }

                    return Ok(nullable_params);
                }
                ast::Values::Query(_) => {}
            };
        }
        ast::Query::Update(update) => {
            let ast::Update { table, updates, .. } = update.as_ref();
            let table_columns = client.get_table_columns(table).await?;
            return Ok(NullableParams::from_updates(&table_columns, updates));
        }
        ast::Query::Delete(_) => {}
    }
    Ok(NullableParams(HashSet::new()))
}

fn find_insert_columns(
    target_columns: &Option<Vec<&str>>,
    mut table_columns: Vec<DatabaseColumn>,
) -> Result<Vec<DatabaseColumn>, Error> {
    match target_columns {
        None => Ok(table_columns
            .into_iter()
            .filter(|col| !col.hidden)
            .collect()),
        Some(column_names) => {
            let mut result: Vec<DatabaseColumn> = Vec::with_capacity(column_names.len());
            for column_name in column_names {
                if let Some(i) = table_columns
                    .iter()
                    .position(|col| col.name == *column_name)
                {
                    result.push(table_columns.swap_remove(i));
                } else {
                    return Err(Error::ColumnNotFound {
                        column: column_name.to_string(),
                    });
                }
            }
            Ok(result)
        }
    }
}

fn find_params_from_values(values: &[Vec<ast::ValuesValue>]) -> Vec<Vec<Option<usize>>> {
    values
        .iter()
        .map(|inner| {
            inner
                .iter()
                .map(|value| match value {
                    ast::ValuesValue::Value(expr) => param_index_from_expr(expr),
                    _ => None,
                })
                .collect()
        })
        .collect()
}

fn param_index_from_expr(expr: &ast::Expression<'_>) -> Option<usize> {
    match expr {
        ast::Expression::Param(index) => Some(*index),
        _ => None,
    }
}

fn update_to_param_nullability(
    db_table: &[DatabaseColumn],
    update: &ast::UpdateAssignment<'_>,
) -> Option<usize> {
    let param_index = match &update.value {
        UpdateValue::Value(expr) => param_index_from_expr(expr),
        UpdateValue::Default => None,
    }?;
    for column in db_table {
        if column.nullable && column.name == update.column {
            return Some(param_index);
        }
    }
    None
}

#[cfg(test)]
mod test {
    use std::collections::HashSet;
    use std::iter::FromIterator;

    use crate::ast;
    use crate::infer::db::DatabaseColumn;
    use crate::infer::param::NullableParams;

    use super::find_insert_columns;
    use super::find_params_from_values;

    fn col(name: &str) -> DatabaseColumn {
        DatabaseColumn {
            nullable: false,
            name: name.to_string(),
            hidden: false,
            type_: 5,
        }
    }

    fn nullable_col(name: &str) -> DatabaseColumn {
        DatabaseColumn {
            nullable: true,
            ..col(name)
        }
    }

    #[test]
    fn test_find_insert_columns() {
        assert_eq!(
            find_insert_columns(&None, vec![col("foo"), col("bar")]).unwrap(),
            vec![col("foo"), col("bar")]
        );
        assert_eq!(
            find_insert_columns(&Some(vec!["bar", "foo"]), vec![col("foo"), col("bar")]).unwrap(),
            vec![col("bar"), col("foo")]
        );
        find_insert_columns(
            &Some(vec!["baz", "bar", "foo"]),
            vec![col("foo"), col("bar")],
        )
        .unwrap_err();
    }

    #[test]
    fn test_find_params_for_values() {
        assert_eq!(
            find_params_from_values(&[
                vec![
                    ast::ValuesValue::Default,                          // => None
                    ast::ValuesValue::Value(ast::Expression::Param(1)), // => Some(1)
                    ast::ValuesValue::Value(ast::Expression::Constant(ast::Constant::True)) // => None
                ],
                vec![
                    ast::ValuesValue::Default // => None
                ]
            ]),
            vec![vec![None, Some(1), None], vec![None]]
        );
    }

    #[test]
    fn test_find_param_nullability_from_updates() {
        assert_eq!(
            NullableParams::from_updates(
                &[nullable_col("foo"), col("bar"), col("baz"), col("quux")],
                &[
                    ast::UpdateAssignment {
                        column: "bar",
                        value: ast::UpdateValue::Default,
                    },
                    ast::UpdateAssignment {
                        column: "foo",
                        value: ast::UpdateValue::Value(ast::Expression::Param(2)),
                    },
                    ast::UpdateAssignment {
                        column: "quux",
                        value: ast::UpdateValue::Value(ast::Expression::Constant(
                            ast::Constant::True
                        )),
                    },
                    ast::UpdateAssignment {
                        column: "baz",
                        value: ast::UpdateValue::Value(ast::Expression::Param(1)),
                    },
                ],
            ),
            NullableParams(HashSet::from_iter(vec![2].into_iter()))
        );
    }
}
