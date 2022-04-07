use std::borrow::Borrow;
use std::slice::Iter;

use async_recursion::async_recursion;
use tokio_postgres::GenericClient;

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
    pub fn is_nullable(&self) -> bool {
        match self {
            ValueNullability::Scalar { nullable } => nullable,
            ValueNullability::Array { nullable, .. } => nullable,
        }
        .to_owned()
    }

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

    pub fn disjunction3(
        a: &ValueNullability,
        b: &ValueNullability,
        c: &ValueNullability,
    ) -> ValueNullability {
        ValueNullability::disjunction(&ValueNullability::disjunction(a, b), c)
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

pub struct SourceColumns(Vec<SourceColumn>);

impl SourceColumns {
    pub fn iter(&self) -> Iter<SourceColumn> {
        return self.0.iter();
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
    set_nullable: bool,
) -> Result<SourceColumns, Error> {
    let mut result = match table_expr_opt {
        None => SourceColumns(Vec::new()),
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
        for col in &mut result.0 {
            col.nullability = col.nullability.to_nullable();
        }
    }
    Ok(result)
}

async fn get_source_columns_for_subquery<C: GenericClient + Sync>(
    client: &C,
    context: &Context<'_>,
    param_nullability: &NullableParams,
    query: &ast::SubquerySelect<'_>,
    as_: &str,
) -> Result<SourceColumns, Error> {
    let columns =
        get_subquery_select_output_columns(client, context, param_nullability, &query).await?;
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

pub fn combine_source_columns(a: &mut SourceColumns, b: &mut SourceColumns) -> SourceColumns {
    let mut result = Vec::<SourceColumn>::with_capacity(a.0.len() + b.0.len());
    result.append(&mut a.0);
    result.append(&mut b.0);
    SourceColumns(result)
}
