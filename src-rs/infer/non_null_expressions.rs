use crate::ast;
use crate::infer::source_columns::SourceColumn;
use crate::utils::builtin_properties::{
    builtin_function_null_safety, operator_null_safety, NullSafety,
};

pub struct NonNullExpressions<'a> {
    parent: Option<&'a NonNullExpressions<'a>>,
    exprs: Vec<&'a ast::Expression<'a>>,
}

impl<'a> NonNullExpressions<'a> {
    // Given a row condition (a boolean expression), return a collection of expressions that
    // are certainly non-null.
    //
    // A row is present in the output only if the condition evaluates to true. So
    // here we can assume that the expression evaluates to true, and with that
    // information find a list of expressions that are certainly not null.
    //
    pub fn from_row_conditions(
        parent: Option<&'a Self>,
        row_conditions: &[Option<&'a ast::Expression<'a>>],
    ) -> NonNullExpressions<'a> {
        Self {
            parent,
            exprs: row_conditions
                .iter()
                .filter_map(|expr_opt| *expr_opt)
                .flat_map(|expr| get_non_null_sub_expressions_from_row_cond(expr, false))
                .collect(),
        }
    }

    pub fn has(&self, expression: &ast::Expression<'_>) -> bool {
        self.exprs.iter().any(|non_null| *non_null == expression) || self.parent_has(expression)
    }

    fn parent_has(&self, expression: &ast::Expression<'_>) -> bool {
        self.parent.map(|p| p.has(expression)).unwrap_or(false)
    }

    pub fn has_source_column(&self, source_column: &SourceColumn) -> bool {
        self.exprs.iter().any(|expr| match expr {
            ast::Expression::TableColumnRef { table, column } => {
                source_column.table_alias == *table && source_column.column_name == *column
            }
            ast::Expression::ColumnRef(column) => source_column.column_name == *column,
            _ => false,
        }) || self.parent_has_source_column(source_column)
    }

    fn parent_has_source_column(&self, source_column: &SourceColumn) -> bool {
        self.parent
            .map(|p| p.has_source_column(source_column))
            .unwrap_or(false)
    }
}

fn get_non_null_sub_expressions_from_row_cond<'a>(
    expression: &'a ast::Expression<'a>,
    logical_negation: bool,
) -> Vec<&'a ast::Expression<'a>> {
    match expression {
        ast::Expression::ColumnRef(_) => vec![expression],
        ast::Expression::TableColumnRef { .. } => vec![expression],
        ast::Expression::UnaryOp { op, expr } => {
            if *op == "IS NOT NULL" || *op == "NOTNULL" {
                // IS NOT NULL / NOTNULL promise that the operand is not null
                get_non_null_sub_expressions_from_row_cond(expr.as_ref(), logical_negation)
            } else if *op == "NOT" {
                // Track logical negation across NOTs
                get_non_null_sub_expressions_from_row_cond(expr.as_ref(), !logical_negation)
            } else if operator_null_safety(op) == NullSafety::Safe {
                // For safe operators, the operator must non-nullable for the
                // result to evaluate to non-null
                get_non_null_sub_expressions_from_row_cond(expr.as_ref(), logical_negation)
            } else {
                // Otherwise, the whole expression is non-null because it must
                // evaluate to true, but cannot say anything about the operands
                vec![expression]
            }
        }
        ast::Expression::BinaryOp(lhs, op, rhs) => {
            if *op == "AND" {
                if logical_negation {
                    // `FALSE AND NULL` evaluates to NULL => NOT (FALSE AND NULL)
                    // evaluates to true, so we cannot say anything about the right hand side!
                    get_non_null_sub_expressions_from_row_cond(lhs.as_ref(), logical_negation)
                } else {
                    // `a AND b` evaluates to TRUE
                    let mut left =
                        get_non_null_sub_expressions_from_row_cond(lhs.as_ref(), logical_negation);
                    let mut right =
                        get_non_null_sub_expressions_from_row_cond(rhs.as_ref(), logical_negation);
                    left.append(&mut right);
                    left
                }
            } else if operator_null_safety(op) == NullSafety::Safe {
                // For safe operators, both sides must be non-nullable for the
                // result to be non-nullable.
                let mut left =
                    get_non_null_sub_expressions_from_row_cond(lhs.as_ref(), logical_negation);
                let mut right =
                    get_non_null_sub_expressions_from_row_cond(rhs.as_ref(), logical_negation);
                left.append(&mut right);
                left
            } else {
                // Otherwise, the whole expression is non-null because it must
                // evaluate to true, but cannot say anything about the operands
                vec![expression]
            }
        }
        ast::Expression::TernaryOp {
            lhs,
            op,
            rhs1,
            rhs2,
        } => {
            // For safe operators, all operands must be non-nullable for the
            // result to be non-nullable.
            if operator_null_safety(op) == NullSafety::Safe {
                let mut left =
                    get_non_null_sub_expressions_from_row_cond(lhs.as_ref(), logical_negation);
                let mut right1 =
                    get_non_null_sub_expressions_from_row_cond(rhs1.as_ref(), logical_negation);
                let mut right2 =
                    get_non_null_sub_expressions_from_row_cond(rhs2.as_ref(), logical_negation);
                left.append(&mut right1);
                left.append(&mut right2);
                left
            } else {
                // Otherwise, the whole expression is non-null because it must
                // evaluate to true, but cannot say anything about the operands
                vec![expression]
            }
        }
        ast::Expression::FunctionCall {
            function_name,
            arg_list,
            ..
        } => {
            // It's enough to check builtin functions because non-builtins are never null safe
            if builtin_function_null_safety(function_name) == NullSafety::Safe {
                arg_list
                    .iter()
                    .flat_map(|arg| {
                        get_non_null_sub_expressions_from_row_cond(arg, logical_negation)
                    })
                    .collect()
            } else {
                // Otherwise, the whole expression is non-null because it must
                // evaluate to true, but cannot say anything about the operands
                vec![expression]
            }
        }
        ast::Expression::AnySomeAllSubquery { lhs, .. }
        | ast::Expression::AnySomeAllArray { lhs, .. }
        | ast::Expression::InSubquery { lhs, .. }
        | ast::Expression::InExprList { lhs, .. } => {
            // For expr op ANY/SOME/ALL, the left hand side expr is non-null
            get_non_null_sub_expressions_from_row_cond(lhs, logical_negation)
        }

        // TODO: Some of these need handling
        ast::Expression::ArraySubquery(_)
        | ast::Expression::Constant(_)
        | ast::Expression::Case { .. }
        | ast::Expression::Exists(_)
        | ast::Expression::Param(_)
        | ast::Expression::ScalarSubquery(_)
        | ast::Expression::TypeCast { .. } => Vec::new(),
        // There's no catch-all here to force thinking the upcoming cases through
    }
}
