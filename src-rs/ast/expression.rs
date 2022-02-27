use crate::ast::{SubquerySelect, WindowDefinition};
use crate::utils::builtin_properties::is_operator_commutative;

#[derive(Clone, Debug)]
pub enum Constant<'a> {
    True,
    False,
    Null,
    Number(&'a str),
    String(&'a str),
}

#[derive(Debug)]
pub struct CaseBranch<'a> {
    pub condition: Expression<'a>,
    pub result: Expression<'a>,
}

#[derive(Debug)]
pub enum Expression<'a> {
    AnySomeAllSubquery {
        lhs: Box<Expression<'a>>,
        op: &'a str,
        comparison: &'a str,
        subquery: Box<SubquerySelect<'a>>,
    },
    AnySomeAllArray {
        lhs: Box<Expression<'a>>,
        op: &'a str,
        comparison: &'a str,
        rhs: Box<Expression<'a>>,
    },
    ArraySubquery(Box<SubquerySelect<'a>>),
    BinaryOp(Box<Expression<'a>>, &'a str, Box<Expression<'a>>),
    Case {
        branches: Vec<CaseBranch<'a>>,
        else_: Option<Box<Expression<'a>>>,
    },
    ColumnRef(&'a str),
    Constant(Constant<'a>),
    Exists(Box<SubquerySelect<'a>>),
    FunctionCall {
        schema: Option<&'a str>,
        function_name: &'a str,
        arg_list: Vec<Expression<'a>>,
        filter: Option<Box<Expression<'a>>>,
        window: Option<WindowDefinition<'a>>,
    },
    InSubquery {
        lhs: Box<Expression<'a>>,
        op: &'a str,
        subquery: Box<SubquerySelect<'a>>,
    },
    InExprList {
        lhs: Box<Expression<'a>>,
        op: &'a str,
        expr_list: Vec<Expression<'a>>,
    },
    Param(usize),
    ScalarSubquery(Box<SubquerySelect<'a>>),
    TableColumnRef {
        table: &'a str,
        column: &'a str,
    },
    TernaryOp {
        lhs: Box<Expression<'a>>,
        op: &'a str,
        rhs1: Box<Expression<'a>>,
        rhs2: Box<Expression<'a>>,
    },
    UnaryOp {
        op: &'a str,
        expr: Box<Expression<'a>>,
    },
    TypeCast {
        lhs: Box<Expression<'a>>,
        target_type: &'a str,
    },
}

impl<'a> PartialEq for Expression<'a> {
    fn eq(&self, b: &Self) -> bool {
        match self {
            Expression::ColumnRef(a_col) => {
                match b {
                    Expression::ColumnRef(b_col)
                    // `tbl.col` and `col` in an expression context must point to
                    // the same column. Otherwise the expression would be invalid
                    // because of an unambiguous column reference.
                    | Expression::TableColumnRef { column: b_col, .. } => a_col == b_col,
                    _ => false,
                }
            }
            Expression::TableColumnRef {
                table: a_table,
                column: a_col,
            } => match b {
                // `tbl.col` and `col` in an expression context must point to
                // the same column. Otherwise the expression would be invalid
                // because of an unambiguous column reference.
                Expression::ColumnRef(b_col) => a_col == b_col,
                Expression::TableColumnRef {
                    table: b_table,
                    column: b_col,
                } => a_table == b_table && a_col == b_col,
                _ => false,
            },

            // No need to compare constants, because this is only ever used for expression nullability
            // and constant nullability can be establised directly
            Expression::Constant(_) => false,

            Expression::Param(a_index) => match b {
                Expression::Param(b_index) => a_index == b_index,
                _ => false,
            },

            Expression::UnaryOp {
                op: a_op,
                expr: a_expr,
            } => match b {
                Expression::UnaryOp {
                    op: b_op,
                    expr: b_expr,
                } => a_op == b_op && a_expr.as_ref() == b_expr.as_ref(),
                _ => false,
            },

            Expression::BinaryOp(a_lhs, a_op, a_rhs) => match b {
                Expression::BinaryOp(b_lhs, b_op, b_rhs) => {
                    a_op == b_op
                        && ((a_lhs.as_ref() == b_lhs.as_ref() && a_rhs.as_ref() == b_rhs.as_ref())
                            || (is_operator_commutative(a_op)
                                && a_lhs.as_ref() == b_rhs.as_ref()
                                && a_rhs.as_ref() == b_lhs.as_ref()))
                }
                _ => false,
            },

            Expression::TernaryOp {
                lhs: a_lhs,
                op: a_op,
                rhs1: a_rhs1,
                rhs2: a_rhs2,
            } => match b {
                Expression::TernaryOp {
                    lhs: b_lhs,
                    op: b_op,
                    rhs1: b_rhs1,
                    rhs2: b_rhs2,
                } => {
                    a_op == b_op
                        && a_lhs.as_ref() == b_lhs.as_ref()
                        && a_rhs1.as_ref() == b_rhs1.as_ref()
                        && a_rhs2.as_ref() == b_rhs2.as_ref()
                }
                _ => false,
            },

            Expression::FunctionCall {
                schema: a_schema,
                function_name: a_function_name,
                arg_list: a_arg_list,
                filter: a_filter,
                window: a_window,
            } => match b {
                Expression::FunctionCall {
                    schema: b_schema,
                    function_name: b_function_name,
                    arg_list: b_arg_list,
                    filter: b_filter,
                    window: b_window,
                } => {
                    a_schema == b_schema
                        && a_function_name == b_function_name
                        && a_arg_list.len() == b_arg_list.len()
                        && a_arg_list
                            .iter()
                            .zip(b_arg_list)
                            .all(|(a_arg, b_arg)| a_arg == b_arg)
                        && a_filter.is_none()
                        && b_filter.is_none()
                        && a_window.is_none()
                        && b_window.is_none()
                }
                _ => false,
            },

            Expression::Case {
                branches: a_branches,
                else_: a_else_opt,
            } => match b {
                Expression::Case {
                    branches: b_branches,
                    else_: b_else_opt,
                } => {
                    a_branches.len() == b_branches.len()
                        && a_branches
                            .iter()
                            .zip(b_branches)
                            .all(|(a_branch, b_branch)| {
                                a_branch.condition == b_branch.condition
                                    && a_branch.result == b_branch.result
                            })
                        && match (a_else_opt, b_else_opt) {
                            (None, None) => true,
                            (Some(a_else), Some(b_else)) => a_else.as_ref() == b_else.as_ref(),
                            _ => false,
                        }
                }
                _ => false,
            },

            Expression::TypeCast {
                lhs: a_lhs,
                target_type: a_target_type,
            } => match b {
                Expression::TypeCast {
                    lhs: b_lhs,
                    target_type: b_target_type,
                } => a_lhs.as_ref() == b_lhs.as_ref() && a_target_type == b_target_type,
                _ => false,
            },

            Expression::AnySomeAllArray { .. }
            | Expression::AnySomeAllSubquery { .. }
            | Expression::Exists(_)
            | Expression::InExprList { .. }
            | Expression::InSubquery { .. }
            | Expression::ArraySubquery(_)
            | Expression::ScalarSubquery(_) => {
                // TODO
                false
            }
        }
    }
}
