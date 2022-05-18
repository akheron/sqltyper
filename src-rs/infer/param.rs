use std::collections::HashSet;
use std::fmt::Debug;
use std::sync::Arc;

use crate::ast;
use crate::infer::db::{DatabaseColumn, SchemaClient};
use crate::infer::error::Error;

#[derive(Debug)]
pub struct NullableParams(HashSet<usize>);

impl NullableParams {
    pub fn is_nullable(&self, param: usize) -> bool {
        self.0.contains(&param)
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
                    let insert_columns = match columns {
                        None => Ok(TargetColumns::visible_table_columns(table_columns)),
                        Some(column_names) => {
                            TargetColumns::pick_named_columns(table_columns, column_names)
                        }
                    }?;
                    let mut nullable_params = NullableParams::from_values(&insert_columns, values);

                    if let Some(ast::OnConflict {
                        conflict_action: ast::ConflictAction::DoUpdate(update_assignments),
                        ..
                    }) = on_conflict
                    {
                        nullable_params.extend_with_updates(&insert_columns, update_assignments);
                    }

                    return Ok(nullable_params);
                }
                ast::Values::Query(_) => {}
            };
        }
        ast::Query::Update(update) => {
            let ast::Update { table, updates, .. } = update.as_ref();
            let table_columns = client.get_table_columns(table).await?;
            let target_columns = TargetColumns::visible_table_columns(table_columns);
            return Ok(NullableParams::from_updates(&target_columns, updates));
        }
        ast::Query::Delete(_) => {}
    }
    Ok(NullableParams(HashSet::new()))
}

#[derive(Debug)]
struct TargetColumns {
    table_columns: Arc<Vec<DatabaseColumn>>,
    order: Vec<usize>,
}

impl TargetColumns {
    fn visible_table_columns(table_columns: Arc<Vec<DatabaseColumn>>) -> Self {
        let order = table_columns
            .iter()
            .enumerate()
            .filter_map(|(i, col)| if col.hidden { None } else { Some(i) })
            .collect();
        Self {
            table_columns,
            order,
        }
    }

    fn pick_named_columns(
        table_columns: Arc<Vec<DatabaseColumn>>,
        column_names: &[&str],
    ) -> Result<Self, Error> {
        let mut order = Vec::new();
        for column_name in column_names {
            let column_index =
                table_columns
                    .iter()
                    .enumerate()
                    .find_map(|(column_index, column)| {
                        if column.name == *column_name {
                            Some(column_index)
                        } else {
                            None
                        }
                    });

            if let Some(i) = column_index {
                order.push(i);
            } else {
                return Err(Error::ColumnNotFound {
                    column: column_name.to_string(),
                });
            }
        }
        Ok(Self {
            table_columns,
            order,
        })
    }

    fn is_nullable_by_index(&self, i: usize) -> Option<bool> {
        self.order
            .get(i)
            .and_then(|column_index| self.table_columns.get(*column_index))
            .map(|column| column.nullable)
    }

    fn is_nullable_by_name(&self, name: &str) -> Option<bool> {
        self.table_columns
            .iter()
            .find(|column| column.name == name)
            .map(|column| column.nullable)
    }
}

impl NullableParams {
    fn new() -> Self {
        Self(HashSet::new())
    }

    fn from_values(insert_columns: &TargetColumns, values: &[Vec<ast::ValuesValue<'_>>]) -> Self {
        let values_list_params = find_params_from_values(values);

        let mut result: HashSet<usize> = HashSet::new();
        for values_params in values_list_params {
            for (i, values_param) in values_params.into_iter().enumerate() {
                if let Some(param_index) = values_param {
                    if let Some(true) = insert_columns.is_nullable_by_index(i) {
                        result.insert(param_index);
                    }
                }
            }
        }
        Self(result)
    }

    fn from_updates(insert_columns: &TargetColumns, updates: &[ast::UpdateAssignment<'_>]) -> Self {
        let mut self_ = Self::new();
        self_.extend_with_updates(insert_columns, updates);
        self_
    }

    fn extend_with_updates(
        &mut self,
        insert_columns: &TargetColumns,
        updates: &[ast::UpdateAssignment<'_>],
    ) {
        self.0.extend(
            updates
                .iter()
                .filter_map(|update| update_to_param_nullability(insert_columns, update)),
        )
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
    insert_columns: &TargetColumns,
    update: &ast::UpdateAssignment<'_>,
) -> Option<usize> {
    let param_index = match &update.value {
        ast::UpdateValue::Value(expr) => param_index_from_expr(expr),
        ast::UpdateValue::Default => None,
    }?;
    insert_columns
        .is_nullable_by_name(update.column)
        .and_then(|nullable| if nullable { Some(param_index) } else { None })
}

#[cfg(test)]
mod test {
    use std::collections::HashSet;
    use std::iter::FromIterator;
    use std::sync::Arc;

    use crate::ast;
    use crate::infer::db::DatabaseColumn;
    use crate::infer::param::{NullableParams, TargetColumns};

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
    fn test_nullable_params_from_updates() {
        let insert_columns = TargetColumns::visible_table_columns(Arc::new(vec![
            nullable_col("foo"),
            col("bar"),
            col("baz"),
            col("quux"),
        ]));

        let actual = NullableParams::from_updates(
            &insert_columns,
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
                    value: ast::UpdateValue::Value(ast::Expression::Constant(ast::Constant::True)),
                },
                ast::UpdateAssignment {
                    column: "baz",
                    value: ast::UpdateValue::Value(ast::Expression::Param(1)),
                },
            ],
        );
        let expected = NullableParams(HashSet::from_iter(vec![2].into_iter()));

        assert_eq!(actual.0, expected.0);
    }
}
