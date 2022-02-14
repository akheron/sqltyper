use async_recursion::async_recursion;
use std::borrow::Borrow;
use tokio_postgres::Client;

use crate::ast;
use crate::infer::columns::get_subquery_select_output_columns;
use crate::infer::context::Context;
use crate::infer::db::get_table_columns;
use crate::infer::error::Error;
use crate::infer::param::NullableParams;

#[derive(Clone, Copy)]
pub enum ValueNullability {
    Scalar { nullable: bool },
    Array { nullable: bool, elem_nullable: bool },
}

impl ValueNullability {
    pub fn to_non_nullable(&self) -> ValueNullability {
        match self {
            ValueNullability::Scalar { .. } => ValueNullability::Scalar { nullable: false },
            ValueNullability::Array { elem_nullable, .. } => ValueNullability::Array {
                nullable: false,
                elem_nullable: *elem_nullable,
            },
        }
    }

    pub fn to_nullable(&self) -> ValueNullability {
        match self {
            ValueNullability::Scalar { .. } => ValueNullability::Scalar { nullable: true },
            ValueNullability::Array { elem_nullable, .. } => ValueNullability::Array {
                nullable: true,
                elem_nullable: *elem_nullable,
            },
        }
    }

    pub fn disjunction(a: &ValueNullability, b: &ValueNullability) -> ValueNullability {
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
                nullable: *a_nullable || *b_nullable,
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
                nullable: *a_nullable || *b_nullable,
                elem_nullable: *a_elem_nullable || *b_elem_nullable,
            },
        }
    }
}

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

pub async fn get_source_columns_for_table<'a>(
    client: &Client,
    context: &Context<'_>,
    table: &ast::TableRef<'_>,
    as_: &Option<&str>,
) -> Result<Vec<SourceColumn>, Error> {
    // Try to find a matching CTE
    if let Some(tbl) = context.get_table(table) {
        return Ok(tbl
            .iter()
            .map(|col| SourceColumn {
                table_alias: as_.unwrap_or(table.table).to_string(),
                column_name: col.name.to_string(),
                nullability: col.nullability,
                hidden: false,
            })
            .collect());
    }

    // No matching CTE, try to find a database table
    let db_columns = get_table_columns(client, table).await?;
    Ok(db_columns
        .into_iter()
        .map(|col| SourceColumn {
            table_alias: as_.unwrap_or(table.table).to_string(),
            column_name: col.name,
            nullability: ValueNullability::Scalar {
                nullable: col.nullable,
            },
            hidden: col.hidden,
        })
        .collect())
}

#[async_recursion]
pub async fn get_source_columns_for_table_expr(
    client: &Client,
    context: &Context,
    param_nullability: &NullableParams,
    table_expr_opt: Option<&'async_recursion ast::TableExpression<'async_recursion>>,
    set_nullable: bool,
) -> Result<Vec<SourceColumn>, Error> {
    let mut result = match table_expr_opt {
        None => Vec::new(),
        Some(table_expr) => match table_expr {
            ast::TableExpression::Table { table, as_ } => {
                get_source_columns_for_table(client, context, &table, as_).await?
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
            ast::TableExpression::CrossJoin { left, right } => combine_source_columns(
                &mut get_source_columns_for_table_expr(
                    client,
                    context,
                    param_nullability,
                    Some(left.borrow()),
                    false,
                )
                .await?,
                &mut get_source_columns_for_table_expr(
                    client,
                    context,
                    param_nullability,
                    Some(right.borrow()),
                    false,
                )
                .await?,
            ),
            ast::TableExpression::QualifiedJoin {
                left,
                join_type,
                right,
                ..
            } => {
                combine_source_columns(
                    &mut get_source_columns_for_table_expr(
                        client,
                        context,
                        param_nullability,
                        Some(left.borrow()),
                        // RIGHT or FULL JOIN -> The left side columns becomes nullable
                        *join_type == ast::JoinType::Right || *join_type == ast::JoinType::Full,
                    )
                    .await?,
                    &mut get_source_columns_for_table_expr(
                        client,
                        context,
                        param_nullability,
                        Some(right.borrow()),
                        // LET or FULL JOIN -> The right side columns becomes nullable
                        *join_type == ast::JoinType::Left || *join_type == ast::JoinType::Full,
                    )
                    .await?,
                )
            }
        },
    };
    if set_nullable {
        for col in &mut result {
            col.nullability = col.nullability.to_nullable();
        }
    }
    Ok(result)
}

async fn get_source_columns_for_subquery(
    client: &Client,
    context: &Context<'_>,
    param_nullability: &NullableParams,
    query: &ast::SubquerySelect<'_>,
    as_: &str,
) -> Result<Vec<SourceColumn>, Error> {
    let columns =
        get_subquery_select_output_columns(client, context, param_nullability, &query).await?;
    Ok(columns
        .into_iter()
        .map(|col| SourceColumn {
            table_alias: as_.to_string(),
            column_name: col.name.to_string(),
            nullability: col.nullability,
            hidden: false,
        })
        .collect())
}

pub fn combine_source_columns(
    a: &mut Vec<SourceColumn>,
    b: &mut Vec<SourceColumn>,
) -> Vec<SourceColumn> {
    let mut result = Vec::<SourceColumn>::with_capacity(a.len() + b.len());
    result.append(a);
    result.append(b);
    result
}
