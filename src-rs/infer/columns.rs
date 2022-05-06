use crate::ast;
use crate::ast::SelectOpType;
use crate::infer::context::Context;
use crate::infer::error::Error;
use crate::infer::select_list::infer_select_list_output;
use crate::infer::source_columns::{SourceColumns, ValueNullability};
use std::iter::FromIterator;
use std::ops::Deref;
use std::slice::Iter;
use std::vec::IntoIter;

#[derive(Debug)]
pub struct Column {
    pub name: String,
    pub nullability: ValueNullability,
}

impl Column {
    pub fn new<T: Into<String>>(name: T, nullability: ValueNullability) -> Self {
        Self {
            name: name.into(),
            nullability,
        }
    }
}

#[derive(Debug, Default)]
pub struct Columns(Vec<Column>);

impl Columns {
    pub fn single<T: Into<String>>(name: T, nullability: ValueNullability) -> Self {
        Self(vec![Column::new(name.into(), nullability)])
    }

    pub fn append(&mut self, other: &mut Columns) {
        self.0.append(&mut other.0);
    }
}

impl Deref for Columns {
    type Target = [Column];

    fn deref(&self) -> &Self::Target {
        self.0.deref()
    }
}

impl FromIterator<Column> for Columns {
    fn from_iter<T: IntoIterator<Item = Column>>(iter: T) -> Self {
        Self(Vec::from_iter(iter))
    }
}

impl IntoIterator for Columns {
    type Item = Column;
    type IntoIter = IntoIter<Column>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<'a> IntoIterator for &'a Columns {
    type Item = &'a Column;
    type IntoIter = Iter<'a, Column>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

pub async fn infer_column_nullability(
    parent_context: &Context<'_>,
    tree: &ast::Ast<'_>,
) -> Result<Columns, Error> {
    let ast::Ast { ctes, query } = tree;
    let cte_context = Context::for_ctes(parent_context, ctes).await?;
    let context = cte_context.as_ref().unwrap_or(parent_context);

    match query {
        ast::Query::Select(select) => {
            infer_set_ops_output(context, &select.body, &select.set_ops).await
        }
        ast::Query::Insert(insert) => {
            if let Some(returning) = &insert.returning {
                let source_columns =
                    SourceColumns::for_table(context, &insert.table, &insert.as_).await?;

                // TODO: This fails to catch non-nullability of `col` in
                //
                //     INSERT INTO tbl (col)
                //     SELECT 1
                //
                infer_select_list_output(context, &source_columns, &[], returning).await
            } else {
                Ok(Columns::default())
            }
        }
        ast::Query::Update(update) => {
            if let Some(returning) = &update.returning {
                let source_columns = SourceColumns::cross_join(
                    SourceColumns::for_table(context, &update.table, &update.as_).await?,
                    SourceColumns::for_table_expr(context, update.from.as_ref()).await?,
                );

                infer_select_list_output(
                    context,
                    &source_columns,
                    &[update.where_.as_ref()],
                    returning,
                )
                .await
            } else {
                Ok(Columns::default())
            }
        }
        ast::Query::Delete(delete) => {
            if let Some(returning) = &delete.returning {
                let source_columns =
                    SourceColumns::for_table(context, &delete.table, &delete.as_).await?;
                infer_select_list_output(
                    context,
                    &source_columns,
                    &[delete.where_.as_ref()],
                    returning,
                )
                .await
            } else {
                Ok(Columns::default())
            }
        }
    }
}

async fn infer_set_ops_output(
    context: &Context<'_>,
    first: &ast::SelectBody<'_>,
    set_ops: &[ast::SelectOp<'_>],
) -> Result<Columns, Error> {
    let mut result = infer_select_body_output(context, first).await?;
    for set_op in set_ops {
        let next = infer_select_body_output(context, &set_op.select).await?;

        if next.len() != result.len() {
            return Err(Error::UnexpectedNumberOfColumns {
                message: format!(
                    "Unequal number of columns in {}",
                    Into::<&str>::into(&set_op.op)
                ),
            });
        }

        // EXCEPT has no (direct) effect on nullability of the output, because
        // its output is not included. However, if nulls were removed, then there
        // would be an effect, but that's not accounted for here.
        if set_op.op != SelectOpType::Except {
            result = result
                .into_iter()
                .zip(next)
                .map(|(a, b)| {
                    Column {
                        // Column names are determined by the first SELECT
                        name: a.name,
                        nullability: ValueNullability::disjunction(a.nullability, b.nullability),
                    }
                })
                .collect();
        }
    }
    Ok(result)
}

async fn infer_select_body_output(
    context: &Context<'_>,
    body: &ast::SelectBody<'_>,
) -> Result<Columns, Error> {
    let source_columns = SourceColumns::for_table_expr(context, body.from.as_ref()).await?;
    infer_select_list_output(
        context,
        &source_columns,
        &[body.where_.as_ref(), body.having.as_ref()],
        &body.select_list,
    )
    .await
}

pub async fn get_subquery_select_output_columns(
    parent_context: &Context<'_>,
    select: &ast::SubquerySelect<'_>,
) -> Result<Columns, Error> {
    let ast::SubquerySelect { ctes, query } = select;
    let cte_context = Context::for_ctes(parent_context, ctes).await?;
    let context = cte_context.as_ref().unwrap_or(parent_context);

    infer_set_ops_output(context, &query.body, &query.set_ops).await
}
