use std::collections::HashSet;
use tokio_postgres::GenericClient;

use crate::ast;
use crate::ast::UpdateValue;
use crate::infer::db::{get_table_columns, Column};
use crate::infer::error::Error;

#[derive(Debug, PartialEq)]
pub struct NullableParams(HashSet<usize>);

impl NullableParams {
    pub fn is_nullable(&self, param: usize) -> bool {
        self.0.contains(&param)
    }
}

pub async fn infer_param_nullability<C: GenericClient>(
    client: &C,
    ast: &ast::AST<'_>,
) -> Result<NullableParams, Error> {
    match &ast.query {
        ast::Query::Select(_) => {}
        ast::Query::Insert(ast::Insert { table, values, .. }) => match values {
            ast::Values::DefaultValues => {}
            ast::Values::Values { columns, values } => {
                let table_columns = get_table_columns(client, table).await?;
                let target_columns = find_insert_columns(columns, table_columns)?;
                let values_list_params = find_params_from_values(values);
                return Ok(combine_param_nullability(
                    target_columns,
                    values_list_params,
                ));
            }
            ast::Values::Query(_) => {}
        },
        ast::Query::Update(ast::Update { table, updates, .. }) => {
            let table_columns = get_table_columns(client, table).await?;
            return Ok(find_param_nullability_from_updates(&table_columns, updates));
        }
        ast::Query::Delete(_) => {}
    }
    Ok(NullableParams(HashSet::new()))
}

fn find_insert_columns(
    target_columns: &Option<Vec<&str>>,
    mut table_columns: Vec<Column>,
) -> Result<Vec<Column>, Error> {
    match target_columns {
        None => Ok(table_columns
            .into_iter()
            .filter(|col| !col.hidden)
            .collect()),
        Some(column_names) => {
            let mut result: Vec<Column> = Vec::with_capacity(column_names.len());
            for column_name in column_names {
                if let Some(i) = table_columns
                    .iter()
                    .position(|col| col.name == *column_name)
                {
                    result.push(table_columns.swap_remove(i));
                } else {
                    return Err(Error::ColumnNotFound(column_name.to_string()));
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

fn combine_param_nullability(
    target_columns: Vec<Column>,
    values_list_params: Vec<Vec<Option<usize>>>,
) -> NullableParams {
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
    NullableParams(result)
}

fn find_param_nullability_from_updates(
    db_columns: &[Column],
    updates: &[ast::UpdateAssignment<'_>],
) -> NullableParams {
    let mut result: HashSet<usize> = HashSet::new();
    for update in updates {
        if let Some(param) = update_to_param_nullability(db_columns, update) {
            result.insert(param);
        }
    }
    NullableParams(result)
}

fn update_to_param_nullability(
    db_table: &[Column],
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
    use crate::ast;
    use crate::infer::db::Column;
    use crate::infer::param::{find_param_nullability_from_updates, NullableParams};
    use std::collections::HashSet;
    use std::iter::FromIterator;

    use super::find_insert_columns;
    use super::find_params_from_values;

    fn col(name: &str) -> Column {
        Column {
            nullable: false,
            name: name.to_string(),
            hidden: false,
            type_: 5,
        }
    }

    fn nullablecol(name: &str) -> Column {
        Column {
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
            find_param_nullability_from_updates(
                &[nullablecol("foo"), col("bar"), col("baz"), col("quux")],
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
