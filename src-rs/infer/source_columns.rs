use std::borrow::Borrow;
use std::slice::Iter;

use async_recursion::async_recursion;

use crate::ast;
use crate::ast::{JoinCondition, JoinType};
use crate::infer::columns::{get_subquery_select_output_columns, Column};
use crate::infer::context::Context;
use crate::infer::db::DatabaseColumn;
use crate::infer::error::Error;

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
pub struct SourceColumn {
    pub table_alias: String,
    pub column_name: String,
    pub nullability: ValueNullability,
    pub hidden: bool,
}

impl SourceColumn {
    fn from_database_column<S: Into<String>>(table_alias: S, col: &DatabaseColumn) -> Self {
        Self {
            table_alias: table_alias.into(),
            column_name: col.name.clone(),
            nullability: ValueNullability::Scalar {
                nullable: col.nullable,
            },
            hidden: col.hidden,
        }
    }

    fn from_cte_column<S: Into<String>>(table_alias: S, col: &Column) -> Self {
        Self {
            table_alias: table_alias.into(),
            column_name: col.name.to_string(),
            nullability: col.nullability,
            hidden: false,
        }
    }

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

#[derive(Debug)]
pub struct SourceColumns(Vec<SourceColumn>);

impl SourceColumns {
    fn new() -> Self {
        Self(Vec::new())
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

    pub async fn for_table(
        context: &Context<'_>,
        table: &ast::TableRef<'_>,
        as_: &Option<&str>,
    ) -> Result<Self, Error> {
        // Try to find a matching CTE
        if let Some(tbl) = context.get_table(table) {
            return Ok(Self(
                tbl.iter()
                    .map(|col| SourceColumn::from_cte_column(as_.unwrap_or(table.table), col))
                    .collect(),
            ));
        }

        // No matching CTE, try to find a database table
        let db_columns = context.client.get_table_columns(table).await?;
        Ok(Self(
            db_columns
                .iter()
                .map(|col| SourceColumn::from_database_column(as_.unwrap_or(table.table), col))
                .collect(),
        ))
    }

    async fn for_subquery(
        context: &Context<'_>,
        query: &ast::SubquerySelect<'_>,
        as_: &str,
    ) -> Result<Self, Error> {
        let columns = get_subquery_select_output_columns(context, query).await?;
        Ok(Self(
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

    #[async_recursion]
    pub async fn for_table_expr(
        context: &Context<'_>,
        table_expr_opt: Option<&'async_recursion ast::TableExpression<'async_recursion>>,
    ) -> Result<Self, Error> {
        Ok(match table_expr_opt {
            None => Self::new(),
            Some(table_expr) => match table_expr {
                ast::TableExpression::Table { table, as_ } => {
                    Self::for_table(context, table, as_).await?
                }
                ast::TableExpression::SubQuery { query, as_ } => {
                    Self::for_subquery(context, query.as_ref(), as_).await?
                }
                ast::TableExpression::CrossJoin { left, right } => SourceColumns::cross_join(
                    Self::for_table_expr(context, Some(left.borrow())).await?,
                    Self::for_table_expr(context, Some(right.borrow())).await?,
                ),
                ast::TableExpression::QualifiedJoin {
                    left,
                    join_type,
                    right,
                    condition,
                } => SourceColumns::qualified_join(
                    Self::for_table_expr(context, Some(left.borrow())).await?,
                    Self::for_table_expr(context, Some(right.borrow())).await?,
                    join_type,
                    condition,
                ),
            },
        })
    }

    pub fn cross_join(mut left: Self, right: Self) -> Self {
        left.append(right);
        left
    }

    fn qualified_join(
        left: Self,
        right: Self,
        join_type: &JoinType,
        join_condition: &JoinCondition,
    ) -> Self {
        let (left, right) = match join_type {
            JoinType::Inner => (left, right),
            JoinType::Left => (left, right.into_nullable()),
            JoinType::Right => (left.into_nullable(), right),
            JoinType::Full => (left.into_nullable(), right.into_nullable()),
        };

        match join_condition {
            JoinCondition::On(_) => SourceColumns::cross_join(left, right),
            JoinCondition::Using(join_columns) => {
                // No need to check that all join_columns exist on both sides, because Postgres
                // already has.
                let mut result = SourceColumns::new();
                for col in left {
                    if join_columns.contains(&(&col.column_name as &str)) {
                        result.push(col.into_non_nullable());
                    } else {
                        result.push(col);
                    }
                }
                for col in right {
                    if !join_columns.contains(&(&col.column_name as &str)) {
                        result.push(col);
                    }
                }
                result
            }
            JoinCondition::Natural => {
                let mut result = SourceColumns::new();
                for col in left {
                    if right.find_column(&col.column_name).is_some() {
                        result.push(col.into_non_nullable());
                    } else {
                        result.push(col);
                    }
                }
                for col in right {
                    if result.find_column(&col.column_name).is_none() {
                        result.push(col);
                    }
                }
                result
            }
        }
    }

    fn into_nullable(self) -> Self {
        Self(self.into_iter().map(|col| col.into_nullable()).collect())
    }

    fn push(&mut self, item: SourceColumn) {
        self.0.push(item);
    }

    fn append(&mut self, mut other: Self) {
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
