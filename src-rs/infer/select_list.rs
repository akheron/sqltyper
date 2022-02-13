use crate::ast;
use crate::infer::context::Context;
use crate::infer::error::Error;
use crate::infer::non_null_expressions::{
    non_null_expressions_from_row_conditions, NonNullExpressions,
};
use crate::infer::param::NullableParams;
use crate::infer::source_columns::SourceColumn;
use crate::infer::source_columns::{Column, ValueNullability};
use tokio_postgres::Client;

pub async fn infer_select_list_output(
    client: &Client,
    context: &Context<'_>,
    source_columns: &[SourceColumn],
    param_nullability: &NullableParams,
    conditions: &[&Option<ast::Expression<'_>>],
    select_list: &[ast::SelectListItem<'_>],
) -> Result<Vec<Column>, Error> {
    let non_null_exprs = non_null_expressions_from_row_conditions(conditions);

    let mut result: Vec<Column> = Vec::with_capacity(select_list.len());
    for item in select_list {
        result.append(
            &mut infer_select_list_item_output(
                client,
                context,
                source_columns,
                param_nullability,
                &non_null_exprs,
                item,
            )
            .await?,
        );
    }
    Ok(result)
}

async fn infer_select_list_item_output(
    _client: &Client,
    _context: &Context<'_>,
    source_columns: &[SourceColumn],
    _param_nullability: &NullableParams,
    non_null_expressions: &NonNullExpressions<'_>,
    select_list_item: &ast::SelectListItem<'_>,
) -> Result<Vec<Column>, Error> {
    match select_list_item {
        ast::SelectListItem::AllFields => {
            Ok(apply_expression_non_nullability_to_columns(
                non_null_expressions,
                source_columns,
                // Hidden columns aren't selected by SELECT *
                |column| !column.hidden,
            ))
        }
        ast::SelectListItem::AllTableFields { table_name } => {
            Ok(apply_expression_non_nullability_to_columns(
                non_null_expressions,
                source_columns,
                // Hidden columns aren't selected by SELECT table.*
                |column| column.table_alias == *table_name && !column.hidden,
            ))
        }
        ast::SelectListItem::SelectListExpression { expression, as_ } => {
            Ok(vec![Column {
                name: as_
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| infer_expression_name(expression)),
                nullability: ValueNullability::Scalar { nullable: true }, // TODO: infer expression nullability
            }])
        }
    }
}

fn apply_expression_non_nullability_to_columns<F: Fn(&SourceColumn) -> bool>(
    non_null_expressions: &NonNullExpressions<'_>,
    source_columns: &[SourceColumn],
    predicate: F,
) -> Vec<Column> {
    source_columns
        .iter()
        .filter(|source_column| predicate(*source_column))
        .map(|source_column| Column {
            name: source_column.column_name.clone(),
            nullability: if non_null_expressions.source_column(source_column) {
                source_column.nullability.to_non_nullable()
            } else {
                source_column.nullability
            },
        })
        .collect()
}

fn infer_expression_name(expr: &ast::Expression<'_>) -> String {
    match expr {
        ast::Expression::ColumnRef(column) => column.to_string(),
        ast::Expression::TableColumnRef { column, .. } => column.to_string(),
        ast::Expression::FunctionCall { function_name, .. } => function_name.to_string(),
        _ => "?column?".to_string(),
    }
}
