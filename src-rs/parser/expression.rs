mod op_utils;

use nom::branch::alt;
use nom::combinator::{map, opt};
use nom::multi::{many0, many1};
use nom::sequence::{delimited, preceded, tuple};

use crate::ast;
use crate::parser::keyword::Keyword;
use crate::parser::select::{subquery_select, window_definition};
use crate::parser::special_function::special_function_call;
use crate::parser::token::{
    any_operator_except, identifier, keyword, number, operator, param, string, symbol,
};
use crate::parser::typecasts::{prefix_typecast, psql_type_cast};
use crate::parser::utils::{
    keyword_to, keywords_to, list_of1, parenthesized, prefixed, sep_by0, seq,
};

use self::op_utils::{binop, unop};
use super::Result;

fn array_subquery(input: &str) -> Result<ast::Expression> {
    map(
        prefixed(Keyword::ARRAY, parenthesized(subquery_select)),
        |select| ast::Expression::ArraySubquery(Box::new(select)),
    )(input)
}

fn case_branch(input: &str) -> Result<ast::CaseBranch> {
    seq(
        (
            prefixed(Keyword::WHEN, expression),
            prefixed(Keyword::THEN, expression),
        ),
        |(condition, result)| ast::CaseBranch { condition, result },
    )(input)
}

fn case_else(input: &str) -> Result<ast::Expression> {
    prefixed(Keyword::ELSE, expression)(input)
}

fn case(input: &str) -> Result<ast::Expression> {
    map(
        prefixed(
            Keyword::CASE,
            tuple((many1(case_branch), opt(case_else), keyword(Keyword::END))),
        ),
        |(branches, else_, _)| ast::Expression::Case {
            branches,
            else_: else_.map(Box::new),
        },
    )(input)
}

fn constant(input: &str) -> Result<ast::Constant> {
    alt((
        keyword_to(Keyword::TRUE, ast::Constant::True),
        keyword_to(Keyword::FALSE, ast::Constant::False),
        keyword_to(Keyword::NULL, ast::Constant::Null),
        map(number, ast::Constant::Number),
        map(string, ast::Constant::String),
    ))(input)
}

fn function_arguments(input: &str) -> Result<Vec<ast::Expression>> {
    parenthesized(alt((
        // func(*) means no arguments for an aggregate function
        map(symbol("*"), |_| vec![]),
        sep_by0(",", expression),
    )))(input)
}

fn window_filter(input: &str) -> Result<ast::Expression> {
    prefixed(
        Keyword::FILTER,
        parenthesized(preceded(keyword(Keyword::WHERE), expression)),
    )(input)
}

fn window_over(input: &str) -> Result<ast::WindowDefinition> {
    prefixed(
        Keyword::OVER,
        alt((
            map(identifier, |existing_window_name| ast::WindowDefinition {
                existing_window_name: Some(existing_window_name),
                partition_by: None,
                order_by: None,
            }),
            parenthesized(window_definition),
        )),
    )(input)
}

fn column_ref_or_function_call(input: &str) -> Result<ast::Expression> {
    seq(
        (
            identifier,
            opt(preceded(symbol("."), identifier)),
            opt(seq(
                (function_arguments, opt(window_filter), opt(window_over)),
                |(arg_list, filter, window)| (arg_list, filter, window),
            )),
        ),
        |(ident1, ident2_opt, fn_call_opt)| match (ident2_opt, fn_call_opt) {
            (None, None) => ast::Expression::ColumnRef(ident1),
            (Some(ident2), None) => ast::Expression::TableColumnRef {
                table: ident1,
                column: ident2,
            },
            (None, Some((arg_list, filter, window))) => ast::Expression::FunctionCall {
                schema: None,
                function_name: ident1,
                arg_list,
                filter: filter.map(Box::new),
                window,
            },
            (Some(ident2), Some((arg_list, filter, window))) => ast::Expression::FunctionCall {
                schema: Some(ident1),
                function_name: ident2,
                arg_list,
                filter: filter.map(Box::new),
                window,
            },
        },
    )(input)
}

fn scalar_subquery(input: &str) -> Result<ast::Expression> {
    map(parenthesized(subquery_select), |s| {
        ast::Expression::ScalarSubquery(Box::new(s))
    })(input)
}

pub fn primary_expression(input: &str) -> Result<ast::Expression> {
    seq(
        (
            alt((
                array_subquery,
                case,
                special_function_call,
                prefix_typecast,
                column_ref_or_function_call,
                map(constant, ast::Expression::Constant),
                param,
                scalar_subquery,
                parenthesized(expression),
            )),
            opt(psql_type_cast),
        ),
        |(expr, typecast_opt)| match typecast_opt {
            None => expr,
            Some(target_type) => ast::Expression::TypeCast {
                lhs: Box::new(expr),
                target_type,
            },
        },
    )(input)
}

fn subscript(input: &str) -> Result<ast::Expression> {
    seq(
        (
            primary_expression,
            many0(delimited(symbol("["), expression, symbol("]"))),
        ),
        |(next, subs)| {
            subs.into_iter().fold(next, |acc, idx| {
                ast::Expression::BinaryOp(Box::new(acc), "[]", Box::new(idx))
            })
        },
    )(input)
}

fn unary_plus_minus(input: &str) -> Result<ast::Expression> {
    unop(alt((operator("+"), operator("-"))), subscript)(input)
}

fn exp(input: &str) -> Result<ast::Expression> {
    binop(symbol("^"), unary_plus_minus)(input)
}

fn mul_div_mod(input: &str) -> Result<ast::Expression> {
    binop(alt((operator("*"), operator("/"), operator("%"))), exp)(input)
}

fn add_sub(input: &str) -> Result<ast::Expression> {
    binop(alt((operator("+"), operator("-"))), mul_div_mod)(input)
}

fn other_op(input: &str) -> Result<ast::Expression> {
    binop(
        any_operator_except(&[
            "<", ">", "=", "<=", ">=", "<>", "+", "-", "*", "/", "%", "^",
        ]),
        add_sub,
    )(input)
}

enum OtherRhs<'a> {
    InSubquery {
        op: &'a str,
        subquery: Box<ast::SubquerySelect<'a>>,
    },
    InExprList {
        op: &'a str,
        expr_list: Vec<ast::Expression<'a>>,
    },
    Binary {
        op: &'a str,
        rhs: Box<ast::Expression<'a>>,
    },
    Ternary {
        op: &'a str,
        rhs1: Box<ast::Expression<'a>>,
        rhs2: Box<ast::Expression<'a>>,
    },
    UnarySuffix(&'a str),
}

impl<'a> OtherRhs<'a> {
    pub fn into_expression(self, lhs: Box<ast::Expression<'a>>) -> ast::Expression<'a> {
        match self {
            OtherRhs::InSubquery { op, subquery } => {
                ast::Expression::InSubquery { lhs, op, subquery }
            }
            OtherRhs::InExprList { op, expr_list } => {
                ast::Expression::InExprList { lhs, op, expr_list }
            }
            OtherRhs::Binary { op, rhs } => ast::Expression::BinaryOp(lhs, op, rhs),
            OtherRhs::Ternary { op, rhs1, rhs2 } => ast::Expression::TernaryOp {
                lhs,
                op,
                rhs1,
                rhs2,
            },
            OtherRhs::UnarySuffix(op) => ast::Expression::UnaryOp { op, expr: lhs },
        }
    }
}

fn in_op(input: &str) -> Result<&str> {
    alt((
        keyword_to(Keyword::IN, "IN"),
        keywords_to(&[Keyword::NOT, Keyword::IN], "NOT IN"),
    ))(input)
}

fn in_subquery(input: &str) -> Result<OtherRhs> {
    seq((in_op, parenthesized(subquery_select)), |(op, subquery)| {
        OtherRhs::InSubquery {
            op,
            subquery: Box::new(subquery),
        }
    })(input)
}

fn in_expr_list(input: &str) -> Result<OtherRhs> {
    seq((in_op, list_of1(expression)), |(op, expr_list)| {
        OtherRhs::InExprList { op, expr_list }
    })(input)
}

fn pattern_match(input: &str) -> Result<OtherRhs> {
    seq(
        (
            alt((
                keyword_to(Keyword::LIKE, "LIKE"),
                keyword_to(Keyword::ILIKE, "ILIKE"),
                keywords_to(&[Keyword::NOT, Keyword::LIKE], "NOT LIKE"),
                keywords_to(&[Keyword::NOT, Keyword::ILIKE], "NOT ILIKE"),
                // TODO: SIMILAR TO a ESCAPE b
                keywords_to(&[Keyword::SIMILAR, Keyword::TO], "SIMILAR TO"),
                keywords_to(
                    &[Keyword::NOT, Keyword::SIMILAR, Keyword::TO],
                    "NOT SIMILAR TO",
                ),
            )),
            other_op,
        ),
        |(op, rhs)| OtherRhs::Binary {
            op,
            rhs: Box::new(rhs),
        },
    )(input)
}

fn ternary(input: &str) -> Result<OtherRhs> {
    seq(
        (
            alt((
                keywords_to(
                    &[Keyword::NOT, Keyword::BETWEEN, Keyword::SYMMETRIC],
                    "NOT BETWEEN SYMMETRIC",
                ),
                keywords_to(&[Keyword::BETWEEN, Keyword::SYMMETRIC], "BETWEEN SYMMETRIC"),
                keywords_to(&[Keyword::NOT, Keyword::BETWEEN], "NOT BETWEEN"),
                keyword_to(Keyword::BETWEEN, "BETWEEN"),
            )),
            other_op,
            keyword(Keyword::AND),
            other_op,
        ),
        |(op, rhs1, _, rhs2)| OtherRhs::Ternary {
            op,
            rhs1: Box::new(rhs1),
            rhs2: Box::new(rhs2),
        },
    )(input)
}

fn unary_suffix(input: &str) -> Result<OtherRhs> {
    map(operator("!"), |_| OtherRhs::UnarySuffix("!"))(input)
}

fn other(input: &str) -> Result<ast::Expression> {
    alt((
        seq(
            (
                other_op,
                opt(alt((
                    in_subquery,
                    in_expr_list,
                    ternary,
                    pattern_match,
                    unary_suffix,
                ))),
            ),
            |(lhs, rhs_opt)| match rhs_opt {
                None => lhs,
                Some(rhs) => rhs.into_expression(Box::new(lhs)),
            },
        ),
        map(
            prefixed(Keyword::EXISTS, parenthesized(subquery_select)),
            |query| ast::Expression::Exists(Box::new(query)),
        ),
    ))(input)
}

fn comparison(input: &str) -> Result<ast::Expression> {
    binop(
        alt((
            operator("<"),
            operator("<="),
            operator("="),
            operator("<>"),
            operator(">="),
            operator(">"),
        )),
        other,
    )(input)
}

fn is(input: &str) -> Result<ast::Expression> {
    enum IsRhs<'a> {
        UnaryOp(&'a str),
        BinaryOp {
            op: &'a str,
            rhs: ast::Expression<'a>,
        },
    }

    seq(
        (
            comparison,
            opt(alt((
                map(
                    alt((
                        keywords_to(&[Keyword::IS, Keyword::NULL], "IS NULL"),
                        keywords_to(&[Keyword::IS, Keyword::NOT, Keyword::NULL], "IS NOT NULL"),
                        keyword_to(Keyword::ISNULL, "ISNULL"),
                        keyword_to(Keyword::NOTNULL, "NOTNULL"),
                        keywords_to(&[Keyword::IS, Keyword::TRUE], "IS TRUE"),
                        keywords_to(&[Keyword::IS, Keyword::NOT, Keyword::TRUE], "IS NOT TRUE"),
                        keywords_to(&[Keyword::IS, Keyword::FALSE], "IS FALSE"),
                        keywords_to(&[Keyword::IS, Keyword::NOT, Keyword::FALSE], "IS NOT FALSE"),
                        keywords_to(&[Keyword::IS, Keyword::UNKNOWN], "IS UNKNOWN"),
                        keywords_to(
                            &[Keyword::IS, Keyword::NOT, Keyword::UNKNOWN],
                            "IS NOT UNKNOWN",
                        ),
                    )),
                    IsRhs::UnaryOp,
                ),
                seq(
                    (
                        alt((
                            keywords_to(
                                &[Keyword::IS, Keyword::DISTINCT, Keyword::FROM],
                                "IS DISTINCT FROM",
                            ),
                            keywords_to(
                                &[Keyword::IS, Keyword::NOT, Keyword::DISTINCT, Keyword::FROM],
                                "IS NOT DISTINCT FROM",
                            ),
                        )),
                        comparison,
                    ),
                    |(op, rhs)| IsRhs::BinaryOp { op, rhs },
                ),
            ))),
        ),
        |(lhs, op_opt)| match op_opt {
            None => lhs,
            Some(rhs) => match rhs {
                IsRhs::UnaryOp(op) => ast::Expression::UnaryOp {
                    op,
                    expr: Box::new(lhs),
                },
                IsRhs::BinaryOp { op, rhs } => {
                    ast::Expression::BinaryOp(Box::new(lhs), op, Box::new(rhs))
                }
            },
        },
    )(input)
}

fn not(input: &str) -> Result<ast::Expression> {
    unop(keyword_to(Keyword::NOT, "NOT"), is)(input)
}

fn and(input: &str) -> Result<ast::Expression> {
    binop(keyword_to(Keyword::AND, "AND"), not)(input)
}

fn or(input: &str) -> Result<ast::Expression> {
    binop(keyword_to(Keyword::OR, "OR"), and)(input)
}

pub fn expression(input: &str) -> Result<ast::Expression> {
    or(input)
}
