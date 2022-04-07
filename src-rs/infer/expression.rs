use async_recursion::async_recursion;
use tokio_postgres::GenericClient;

use crate::ast;
use crate::ast::SubquerySelect;
use crate::infer::columns::get_subquery_select_output_columns;
use crate::infer::context::Context;
use crate::infer::error::Error;
use crate::infer::non_null_expressions::{
    non_null_expressions_from_row_conditions, NonNullExpressions,
};
use crate::infer::param::NullableParams;
use crate::infer::source_columns::{SourceColumns, ValueNullability};
use crate::utils::builtin_properties::{
    builtin_function_null_safety, operator_null_safety, NullSafety,
};

#[async_recursion]
pub async fn infer_expression_nullability<C: GenericClient + Sync>(
    client: &C,
    context: &Context<'_>,
    source_columns: &SourceColumns,
    param_nullability: &NullableParams,
    non_null_expressions: &NonNullExpressions<'_>,
    expression: &ast::Expression<'_>,
) -> Result<ValueNullability, Error> {
    if non_null_expressions.has(expression) {
        return Ok(ValueNullability::Scalar { nullable: false });
    }

    match expression {
        ast::Expression::TableColumnRef { table, column } => source_columns
            .find_table_column(table, column)
            .map(|source_column| source_column.nullability)
            .ok_or_else(|| Error::TableColumnNotFound {
                table: table.to_string(),
                column: column.to_string(),
            }),

        ast::Expression::ColumnRef(column) => source_columns
            .find_column(column)
            .map(|source_column| source_column.nullability)
            .ok_or_else(|| Error::ColumnNotFound(column.to_string())),

        ast::Expression::UnaryOp { op, expr } => match operator_null_safety(op) {
            NullSafety::Safe => {
                // Returns NULL if and only if the argument is NULL
                infer_expression_nullability(
                    client,
                    context,
                    source_columns,
                    param_nullability,
                    non_null_expressions,
                    expr,
                )
                .await
            }
            NullSafety::Unsafe => {
                // Can return NULL even if the argument is non-NULL
                Ok(ValueNullability::Scalar { nullable: true })
            }
            NullSafety::NeverNull => {
                // Never returns NULL
                Ok(ValueNullability::Scalar { nullable: false })
            }
        },

        ast::Expression::BinaryOp(lhs, op, rhs) => {
            let null_safety = if *op == "AND" || *op == "OR" {
                // AND and OR are unsafe because of short circuiting: `FALSE AND NULL` evaluates
                // to `FALSE` and `TRUE OR NULL` evaluates to `TRUE`.
                //
                // However, they never return NULL when both arguments are non-NULL, so they're
                // NULL safe as far as this function is concerned.
                //
                NullSafety::Safe
            } else {
                operator_null_safety(op)
            };
            match null_safety {
                NullSafety::Safe => {
                    // Returns NULL if and only if one of the arguments is NULL
                    Ok(ValueNullability::disjunction(
                        &infer_expression_nullability(
                            client,
                            context,
                            source_columns,
                            param_nullability,
                            non_null_expressions,
                            lhs,
                        )
                        .await?,
                        &infer_expression_nullability(
                            client,
                            context,
                            source_columns,
                            param_nullability,
                            non_null_expressions,
                            rhs,
                        )
                        .await?,
                    ))
                }
                NullSafety::Unsafe => {
                    // Can return NULL even if the argument is non-NULL
                    Ok(ValueNullability::Scalar { nullable: true })
                }
                NullSafety::NeverNull => {
                    // Never returns NULL
                    Ok(ValueNullability::Scalar { nullable: false })
                }
            }
        }

        ast::Expression::TernaryOp {
            lhs,
            op,
            rhs1,
            rhs2,
        } => match operator_null_safety(op) {
            NullSafety::Safe => Ok(ValueNullability::disjunction3(
                // Returns NULL if and only if one of the arguments is NULL
                &infer_expression_nullability(
                    client,
                    context,
                    source_columns,
                    param_nullability,
                    non_null_expressions,
                    lhs,
                )
                .await?,
                &infer_expression_nullability(
                    client,
                    context,
                    source_columns,
                    param_nullability,
                    non_null_expressions,
                    rhs1,
                )
                .await?,
                &infer_expression_nullability(
                    client,
                    context,
                    source_columns,
                    param_nullability,
                    non_null_expressions,
                    rhs2,
                )
                .await?,
            )),
            NullSafety::Unsafe => {
                // Can return NULL even if the argument is non-NULL
                Ok(ValueNullability::Scalar { nullable: true })
            }
            NullSafety::NeverNull => {
                // Never returns NULL
                Ok(ValueNullability::Scalar { nullable: false })
            }
        },

        ast::Expression::AnySomeAllSubquery { lhs, subquery, .. }
        | ast::Expression::InSubquery { lhs, subquery, .. } => {
            // expr op ANY/SOME/ALL (subquery) / expr IN/NOT IN (subquery) returns NULL
            // if expr is NULL, or if there's no match and any value produced by the
            // subquery is NULL
            Ok(ValueNullability::disjunction(
                &infer_expression_nullability(
                    client,
                    context,
                    source_columns,
                    param_nullability,
                    non_null_expressions,
                    lhs,
                )
                .await?,
                &infer_scalar_subquery_nullability(
                    client,
                    context,
                    param_nullability,
                    subquery.as_ref(),
                )
                .await?,
            ))
        }

        ast::Expression::AnySomeAllArray { lhs, rhs, .. } => {
            // expr op ANY/SOME/ALL (array_expr) returns NULL if expr is NULL, array_expr is
            // NULL, or if there's no match and any value in the array is NULL
            let lhs_nullability = infer_expression_nullability(
                client,
                context,
                source_columns,
                param_nullability,
                non_null_expressions,
                lhs,
            )
            .await?;
            let rhs_nullability = infer_expression_nullability(
                client,
                context,
                source_columns,
                param_nullability,
                non_null_expressions,
                rhs,
            )
            .await?;
            Ok(
                if lhs_nullability.is_nullable() || rhs_nullability.is_nullable() {
                    ValueNullability::Scalar { nullable: true }
                } else {
                    match rhs_nullability {
                        ValueNullability::Array { elem_nullable, .. } => ValueNullability::Scalar {
                            nullable: elem_nullable,
                        },
                        v => v,
                    }
                },
            )
        }

        ast::Expression::InExprList { lhs, expr_list, .. } => {
            // expr IN (expr_list) returns NULL if any expr in expr_list is NULL and there
            // is no match
            let lhs_nullability = infer_expression_nullability(
                client,
                context,
                source_columns,
                param_nullability,
                non_null_expressions,
                lhs.as_ref(),
            )
            .await?;
            if lhs_nullability.is_nullable() {
                return Ok(lhs_nullability);
            }
            for expr in expr_list {
                let nullability = infer_expression_nullability(
                    client,
                    context,
                    source_columns,
                    param_nullability,
                    non_null_expressions,
                    expr,
                )
                .await?;
                if nullability.is_nullable() {
                    return Ok(nullability);
                };
            }
            Ok(ValueNullability::Scalar { nullable: false })
        }

        ast::Expression::Exists(_) => {
            // EXISTS (subquery) never returns NULL
            Ok(ValueNullability::Scalar { nullable: false })
        }

        ast::Expression::FunctionCall {
            function_name,
            arg_list,
            ..
        } => {
            match builtin_function_null_safety(function_name) {
                NullSafety::Safe => {
                    // Returns NULL if and only if one of the arguments is NULL
                    for arg in arg_list {
                        let nullability = infer_expression_nullability(
                            client,
                            context,
                            source_columns,
                            param_nullability,
                            non_null_expressions,
                            arg,
                        )
                        .await?;
                        if nullability.is_nullable() {
                            return Ok(nullability);
                        };
                    }
                    Ok(ValueNullability::Scalar { nullable: false })
                }
                NullSafety::Unsafe => {
                    // Can return NULL even if all arguments are non-NULL
                    Ok(ValueNullability::Scalar { nullable: true })
                }
                NullSafety::NeverNull => {
                    // Never returns NULL
                    Ok(ValueNullability::Scalar { nullable: false })
                }
            }
        }

        ast::Expression::ArraySubquery(subquery) => {
            // ARRAY(subquery) is never null as a whole. The nullability of
            // the inside depends on the inside select list expression
            let elem_nullability = infer_scalar_subquery_nullability(
                client,
                context,
                param_nullability,
                subquery.as_ref(),
            )
            .await?;
            Ok(ValueNullability::Array {
                nullable: false,
                elem_nullable: elem_nullability.is_nullable(),
            })
        }

        ast::Expression::ScalarSubquery(subquery) => {
            // (subquery) is nullable if the single output column of the subquery is nullable
            Ok(infer_scalar_subquery_nullability(
                client,
                context,
                param_nullability,
                subquery.as_ref(),
            )
            .await?)
        }

        ast::Expression::Case { branches, else_ } => {
            match else_ {
                None => {
                    // No ELSE => rows that match none of the branches will be NULL
                    Ok(ValueNullability::Scalar { nullable: true })
                }
                Some(els) => {
                    let mut result = infer_expression_nullability(
                        client,
                        context,
                        source_columns,
                        param_nullability,
                        non_null_expressions,
                        els,
                    )
                    .await?;
                    for branch in branches {
                        result = ValueNullability::disjunction(
                            &result,
                            &infer_expression_nullability(
                                client,
                                context,
                                source_columns,
                                param_nullability,
                                &non_null_expressions_from_row_conditions(
                                    non_null_expressions,
                                    &[Some(&branch.condition)],
                                ),
                                &branch.result,
                            )
                            .await?,
                        );
                    }
                    Ok(result)
                }
            }
        }

        ast::Expression::TypeCast { lhs, .. } => {
            // A type cast evaluates to NULL if the expression to be casted is NULL
            infer_expression_nullability(
                client,
                context,
                source_columns,
                param_nullability,
                non_null_expressions,
                lhs.as_ref(),
            )
            .await
        }

        ast::Expression::Constant(constant) => Ok(match constant {
            // NULL is the only nullable constant
            ast::Constant::Null => ValueNullability::Scalar { nullable: true },
            _ => ValueNullability::Scalar { nullable: false },
        }),

        ast::Expression::Param(index) => {
            // By default, a parameter is non-nullable, but param
            // nullability infering may have overridden the default.
            Ok(ValueNullability::Scalar {
                nullable: param_nullability.is_nullable(*index),
            })
        }
    }
}

async fn infer_scalar_subquery_nullability<C: GenericClient + Sync>(
    client: &C,
    context: &Context<'_>,
    param_nullability: &NullableParams,
    subquery: &SubquerySelect<'_>,
) -> Result<ValueNullability, Error> {
    let columns =
        get_subquery_select_output_columns(client, context, param_nullability, subquery).await?;
    if columns.len() == 1 {
        Ok(ValueNullability::Scalar {
            nullable: columns[0].nullability.is_nullable(),
        })
    } else {
        Err(Error::UnexpectedNumberOfColumns(
            "A scalar subquery must return only one column".to_string(),
        ))
    }
}
