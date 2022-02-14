use async_recursion::async_recursion;
use tokio_postgres::Client;

use crate::ast;
use crate::ast::SelectOpType;
use crate::infer::context::{get_context_for_ctes, Context};
use crate::infer::error::Error;
use crate::infer::param::NullableParams;
use crate::infer::select_list::infer_select_list_output;
use crate::infer::source_columns::{
    combine_source_columns, get_source_columns_for_table, get_source_columns_for_table_expr,
    Column, ValueNullability,
};

pub async fn infer_column_nullability(
    client: &Client,
    param_nullability: &NullableParams,
    tree: &ast::AST<'_>,
) -> Result<Vec<Column>, Error> {
    get_output_columns(client, &Context::root(), param_nullability, tree).await
}

#[async_recursion]
pub async fn get_output_columns(
    client: &Client,
    parent_context: &Context<'_>,
    param_nullability: &NullableParams,
    tree: &ast::AST<'_>,
) -> Result<Vec<Column>, Error> {
    let ast::AST { ctes, query } = tree;
    let cte_context = get_context_for_ctes(client, param_nullability, parent_context, ctes).await?;
    let context = cte_context.as_ref().unwrap_or(parent_context);

    match query {
        ast::Query::Select(select) => {
            infer_set_ops_output(
                client,
                context,
                param_nullability,
                &select.body,
                &select.set_ops,
            )
            .await
        }
        ast::Query::Insert(insert) => {
            if let Some(returning) = &insert.returning {
                let source_columns =
                    get_source_columns_for_table(client, context, &insert.table, &insert.as_)
                        .await?;

                // TODO: This fails to catch non-nullability of `col` in
                //
                //     INSERT INTO tbl (col)
                //     SELECT 1
                //
                infer_select_list_output(
                    client,
                    context,
                    &source_columns,
                    param_nullability,
                    &[],
                    returning,
                )
                .await
            } else {
                Ok(Vec::new())
            }
        }
        ast::Query::Update(update) => {
            if let Some(returning) = &update.returning {
                let source_columns = combine_source_columns(
                    &mut get_source_columns_for_table(client, context, &update.table, &update.as_)
                        .await?,
                    &mut get_source_columns_for_table_expr(
                        client,
                        context,
                        param_nullability,
                        update.from.as_ref(),
                        false,
                    )
                    .await?,
                );

                infer_select_list_output(
                    client,
                    context,
                    &source_columns,
                    param_nullability,
                    &[&update.where_],
                    returning,
                )
                .await
            } else {
                Ok(Vec::new())
            }
        }
        ast::Query::Delete(delete) => {
            if let Some(returning) = &delete.returning {
                let source_columns =
                    get_source_columns_for_table(client, context, &delete.table, &delete.as_)
                        .await?;
                infer_select_list_output(
                    client,
                    context,
                    &source_columns,
                    param_nullability,
                    &[&delete.where_],
                    returning,
                )
                .await
            } else {
                Ok(Vec::new())
            }
        }
    }
}

async fn infer_set_ops_output(
    client: &Client,
    context: &Context<'_>,
    param_nullability: &NullableParams,
    first: &ast::SelectBody<'_>,
    set_ops: &[ast::SelectOp<'_>],
) -> Result<Vec<Column>, Error> {
    let mut result = infer_select_body_output(client, context, param_nullability, first).await?;
    for set_op in set_ops {
        let next =
            infer_select_body_output(client, context, param_nullability, &set_op.select).await?;

        if next.len() != result.len() {
            return Err(Error::UnexpectedNumberOfColumns(format!(
                "Unequal number of columns in {}",
                Into::<&str>::into(&set_op.op)
            )));
        }

        // EXCEPT has no (direct) effect on nullability of the output, because
        // its output is not included. However, if nulls were removed, then there
        // would be an effect, but that's not accounted for here.
        if set_op.op != SelectOpType::Except {
            result = result
                .into_iter()
                .zip(&next)
                .map(|(a, b)| {
                    Column {
                        // Column names are determined by the first SELECT
                        name: a.name,
                        nullability: ValueNullability::disjunction(&a.nullability, &b.nullability),
                    }
                })
                .collect();
        }
    }
    Ok(result)
}

async fn infer_select_body_output(
    client: &Client,
    context: &Context<'_>,
    param_nullability: &NullableParams,
    body: &ast::SelectBody<'_>,
) -> Result<Vec<Column>, Error> {
    let source_columns = get_source_columns_for_table_expr(
        client,
        context,
        param_nullability,
        body.from.as_ref(),
        false,
    )
    .await?;
    infer_select_list_output(
        client,
        context,
        &source_columns,
        param_nullability,
        &[&body.where_, &body.having],
        &body.select_list,
    )
    .await
}

pub async fn get_subquery_select_output_columns(
    client: &Client,
    parent_context: &Context<'_>,
    param_nullability: &NullableParams,
    select: &ast::SubquerySelect<'_>,
) -> Result<Vec<Column>, Error> {
    let ast::SubquerySelect { ctes, query } = select;
    let cte_context = get_context_for_ctes(client, param_nullability, parent_context, ctes).await?;
    let context = cte_context.as_ref().unwrap_or(parent_context);

    infer_set_ops_output(
        client,
        context,
        param_nullability,
        &query.body,
        &query.set_ops,
    )
    .await
}
