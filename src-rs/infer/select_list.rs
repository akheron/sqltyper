use crate::ast;
use crate::infer::columns::{Column, Columns};
use crate::infer::context::Context;
use crate::infer::error::Error;
use crate::infer::expression::{infer_expression_nullability, ExprContext};
use crate::infer::non_null_expressions::NonNullExpressions;
use crate::infer::source_columns::SourceColumn;
use crate::infer::source_columns::SourceColumns;

pub async fn infer_select_list_output(
    context: &Context<'_>,
    source_columns: &SourceColumns,
    conditions: &[Option<&ast::Expression<'_>>],
    select_list: &[ast::SelectListItem<'_>],
) -> Result<Columns, Error> {
    let non_null_expressions = NonNullExpressions::from_row_conditions(None, conditions);

    let expr_context = ExprContext::new(context, source_columns, &non_null_expressions);

    let mut columns = Columns::default();
    for item in select_list {
        columns.append(&mut infer_select_list_item_output(&expr_context, item).await?);
    }
    Ok(columns)
}

async fn infer_select_list_item_output(
    expr_context: &ExprContext<'_>,
    select_list_item: &ast::SelectListItem<'_>,
) -> Result<Columns, Error> {
    match select_list_item {
        ast::SelectListItem::AllFields => {
            Ok(apply_expression_non_nullability_to_columns(
                expr_context,
                // Hidden columns aren't selected by SELECT *
                |column| !column.hidden,
            ))
        }
        ast::SelectListItem::AllTableFields { table_name } => {
            Ok(apply_expression_non_nullability_to_columns(
                expr_context,
                // Hidden columns aren't selected by SELECT table.*
                |column| column.table_alias == *table_name && !column.hidden,
            ))
        }
        ast::SelectListItem::SelectListExpression { expression, as_ } => Ok(Columns::single(
            as_.unwrap_or_else(|| infer_expression_name(expression)),
            infer_expression_nullability(&expr_context, expression).await?,
        )),
    }
}

fn apply_expression_non_nullability_to_columns<F: Fn(&SourceColumn) -> bool>(
    expr_context: &ExprContext,
    predicate: F,
) -> Columns {
    expr_context
        .source_columns
        .iter()
        .filter(|source_column| predicate(*source_column))
        .map(|source_column| {
            Column::new(
                &source_column.column_name,
                if expr_context
                    .non_null_expressions
                    .has_source_column(source_column)
                {
                    source_column.nullability.to_non_nullable()
                } else {
                    source_column.nullability
                },
            )
        })
        .collect()
}

fn infer_expression_name<'a>(expr: &'a ast::Expression<'a>) -> &'a str {
    match expr {
        ast::Expression::ColumnRef(column) => column,
        ast::Expression::TableColumnRef { column, .. } => column,
        ast::Expression::FunctionCall { function_name, .. } => function_name,
        _ => "?column?",
    }
}
