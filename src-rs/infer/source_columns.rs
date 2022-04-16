use std::borrow::Borrow;
use std::collections::HashSet;
use std::slice::Iter;

use async_recursion::async_recursion;
use tokio_postgres::GenericClient;

use crate::ast;
use crate::ast::{JoinCondition, JoinType};
use crate::infer::columns::get_subquery_select_output_columns;
use crate::infer::context::Context;
use crate::infer::db::get_table_columns;
use crate::infer::error::Error;
use crate::infer::param::NullableParams;

#[derive(Clone, Copy, Debug)]
pub enum ValueNullability {
    Scalar { nullable: bool },
    Array { nullable: bool, elem_nullable: bool },
}

impl ValueNullability {
    pub fn is_nullable(self) -> bool {
        match self {
            ValueNullability::Scalar { nullable } => nullable,
            ValueNullability::Array { nullable, .. } => nullable,
        }
    }

    pub fn to_non_nullable(self) -> ValueNullability {
        match self {
            ValueNullability::Scalar { .. } => ValueNullability::Scalar { nullable: false },
            ValueNullability::Array { elem_nullable, .. } => ValueNullability::Array {
                nullable: false,
                elem_nullable,
            },
        }
    }

    pub fn to_nullable(self) -> ValueNullability {
        match self {
            ValueNullability::Scalar { .. } => ValueNullability::Scalar { nullable: true },
            ValueNullability::Array { elem_nullable, .. } => ValueNullability::Array {
                nullable: true,
                elem_nullable,
            },
        }
    }

    pub fn disjunction(a: ValueNullability, b: ValueNullability) -> ValueNullability {
        match (a, b) {
            (
                ValueNullability::Scalar {
                    nullable: a_nullable,
                },
                ValueNullability::Scalar {
                    nullable: b_nullable,
                },
            )
            | (
                ValueNullability::Array {
                    nullable: a_nullable,
                    ..
                },
                ValueNullability::Scalar {
                    nullable: b_nullable,
                },
            )
            | (
                ValueNullability::Scalar {
                    nullable: a_nullable,
                },
                ValueNullability::Array {
                    nullable: b_nullable,
                    ..
                },
            ) => ValueNullability::Scalar {
                nullable: a_nullable || b_nullable,
            },
            (
                ValueNullability::Array {
                    nullable: a_nullable,
                    elem_nullable: a_elem_nullable,
                },
                ValueNullability::Array {
                    nullable: b_nullable,
                    elem_nullable: b_elem_nullable,
                },
            ) => ValueNullability::Array {
                nullable: a_nullable || b_nullable,
                elem_nullable: a_elem_nullable || b_elem_nullable,
            },
        }
    }

    pub fn disjunction3(
        a: ValueNullability,
        b: ValueNullability,
        c: ValueNullability,
    ) -> ValueNullability {
        ValueNullability::disjunction(ValueNullability::disjunction(a, b), c)
    }
}

#[derive(Debug)]
pub struct Column {
    pub name: String,
    pub nullability: ValueNullability,
}

pub struct SourceColumn {
    pub table_alias: String,
    pub column_name: String,
    pub nullability: ValueNullability,
    pub hidden: bool,
}

impl SourceColumn {
    fn into_non_nullable(self) -> SourceColumn {
        SourceColumn {
            nullability: self.nullability.to_non_nullable(),
            ..self
        }
    }

    fn into_nullable(self) -> SourceColumn {
        SourceColumn {
            nullability: self.nullability.to_nullable(),
            ..self
        }
    }
}

pub struct SourceColumns(Vec<SourceColumn>);

impl SourceColumns {
    fn new() -> SourceColumns {
        SourceColumns(Vec::new())
    }

    pub fn iter(&self) -> Iter<SourceColumn> {
        self.0.iter()
    }

    pub fn find_table_column(&self, table: &str, column: &str) -> Option<&SourceColumn> {
        self.iter()
            .find(|col| col.table_alias == table && col.column_name == column)
    }

    pub fn find_column(&self, column: &str) -> Option<&SourceColumn> {
        let mut result: Option<&SourceColumn> = None;
        for col in &self.0 {
            if col.column_name == column {
                if result.is_some() {
                    // Multiple columns with the same name
                    return None;
                }
                result = Some(col);
            }
        }
        result
    }

    pub fn into_nullable(self) -> SourceColumns {
        SourceColumns(self.into_iter().map(|col| col.into_nullable()).collect())
    }

    fn push(&mut self, item: SourceColumn) {
        self.0.push(item);
    }

    fn append(&mut self, mut other: SourceColumns) {
        self.0.append(&mut other.0);
    }
}

impl IntoIterator for SourceColumns {
    type Item = SourceColumn;
    type IntoIter = std::vec::IntoIter<Self::Item>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

pub async fn get_source_columns_for_table<C: GenericClient + Sync>(
    client: &C,
    context: &Context<'_>,
    table: &ast::TableRef<'_>,
    as_: &Option<&str>,
) -> Result<SourceColumns, Error> {
    // Try to find a matching CTE
    if let Some(tbl) = context.get_table(table) {
        return Ok(SourceColumns(
            tbl.iter()
                .map(|col| SourceColumn {
                    table_alias: as_.unwrap_or(table.table).to_string(),
                    column_name: col.name.to_string(),
                    nullability: col.nullability,
                    hidden: false,
                })
                .collect(),
        ));
    }

    // No matching CTE, try to find a database table
    let db_columns = get_table_columns(client, table).await?;
    Ok(SourceColumns(
        db_columns
            .into_iter()
            .map(|col| SourceColumn {
                table_alias: as_.unwrap_or(table.table).to_string(),
                column_name: col.name,
                nullability: ValueNullability::Scalar {
                    nullable: col.nullable,
                },
                hidden: col.hidden,
            })
            .collect(),
    ))
}

#[async_recursion]
pub async fn get_source_columns_for_table_expr<C: GenericClient + Sync>(
    client: &C,
    context: &Context,
    param_nullability: &NullableParams,
    table_expr_opt: Option<&'async_recursion ast::TableExpression<'async_recursion>>,
) -> Result<SourceColumns, Error> {
    Ok(match table_expr_opt {
        None => SourceColumns(Vec::new()),
        Some(table_expr) => match table_expr {
            ast::TableExpression::Table { table, as_ } => {
                get_source_columns_for_table(client, context, table, as_).await?
            }
            ast::TableExpression::SubQuery { query, as_ } => {
                get_source_columns_for_subquery(
                    client,
                    context,
                    param_nullability,
                    query.as_ref(),
                    as_,
                )
                .await?
            }
            ast::TableExpression::CrossJoin { left, right } => cross_join(
                get_source_columns_for_table_expr(
                    client,
                    context,
                    param_nullability,
                    Some(left.borrow()),
                )
                .await?,
                get_source_columns_for_table_expr(
                    client,
                    context,
                    param_nullability,
                    Some(right.borrow()),
                )
                .await?,
            ),
            ast::TableExpression::QualifiedJoin {
                left,
                join_type,
                right,
                condition,
            } => qualified_join(
                get_source_columns_for_table_expr(
                    client,
                    context,
                    param_nullability,
                    Some(left.borrow()),
                )
                .await?,
                get_source_columns_for_table_expr(
                    client,
                    context,
                    param_nullability,
                    Some(right.borrow()),
                )
                .await?,
                join_type,
                condition,
            ),
        },
    })
}

async fn get_source_columns_for_subquery<C: GenericClient + Sync>(
    client: &C,
    context: &Context<'_>,
    param_nullability: &NullableParams,
    query: &ast::SubquerySelect<'_>,
    as_: &str,
) -> Result<SourceColumns, Error> {
    let columns =
        get_subquery_select_output_columns(client, context, param_nullability, query).await?;
    Ok(SourceColumns(
        columns
            .into_iter()
            .map(|col| SourceColumn {
                table_alias: as_.to_string(),
                column_name: col.name.to_string(),
                nullability: col.nullability,
                hidden: false,
            })
            .collect(),
    ))
}

pub fn cross_join(mut left: SourceColumns, right: SourceColumns) -> SourceColumns {
    left.append(right);
    left
}

fn qualified_join(
    left: SourceColumns,
    right: SourceColumns,
    join_type: &JoinType,
    join_condition: &JoinCondition,
) -> SourceColumns {
    let (left, right) = match join_type {
        JoinType::Inner => (left, right),
        JoinType::Left => (left, right.into_nullable()),
        JoinType::Right => (left.into_nullable(), right),
        JoinType::Full => (left.into_nullable(), right.into_nullable()),
    };

    match join_condition {
        JoinCondition::On(_) => cross_join(left, right),
        JoinCondition::Using(join_columns) => {
            // No need to check that all join_columns exist on both sides, because Postgres
            // already has.
            let mut join_cols = HashSet::new();
            for col in join_columns {
                join_cols.insert(col.to_string());
            }
            join_using(left, right, &join_cols)
        }
        JoinCondition::Natural => {
            let mut left_cols = HashSet::new();
            for col in left.iter() {
                if !col.hidden {
                    left_cols.insert(col.column_name.clone());
                }
            }
            let mut join_cols = HashSet::new();
            for col in right.iter() {
                if !col.hidden && left_cols.contains(&col.column_name) {
                    join_cols.insert(col.column_name.clone());
                }
            }
            join_using(left, right, &join_cols)
        }
    }
}

fn join_using(
    left: SourceColumns,
    right: SourceColumns,
    join_cols: &HashSet<String>,
) -> SourceColumns {
    let mut result = SourceColumns::new();
    for col in left {
        if join_cols.contains(&col.column_name) {
            result.push(col.into_non_nullable());
        } else {
            result.push(col);
        }
    }
    for col in right {
        if !join_cols.contains(&col.column_name) {
            result.push(col);
        }
    }
    result
}
