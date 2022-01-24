use nom::branch::alt;
use nom::combinator::{cut, map, opt};
use nom::multi::many1;
use nom::sequence::{preceded, tuple};

use crate::ast;
use crate::parser::keyword::Keyword;
use crate::parser::select::{subquery_select, window_definition};
use crate::parser::special_function::special_function_call;
use crate::parser::token::{identifier, keyword, number, operator, param, string, symbol};
use crate::parser::utils::{binop, parenthesized, sep_by0, seq};

use super::Result;

fn array_subquery(input: &str) -> Result<ast::Expression> {
    map(
        preceded(keyword(Keyword::ARRAY), parenthesized(subquery_select)),
        |select| ast::Expression::ArraySubquery(Box::new(select)),
    )(input)
}

fn case_branch(input: &str) -> Result<ast::CaseBranch> {
    seq(
        (
            preceded(keyword(Keyword::WHEN), cut(expression)),
            preceded(keyword(Keyword::THEN), cut(expression)),
        ),
        |(condition, result)| ast::CaseBranch { condition, result },
    )(input)
}

fn case_else(input: &str) -> Result<ast::Expression> {
    preceded(keyword(Keyword::ELSE), cut(expression))(input)
}

fn case(input: &str) -> Result<ast::Expression> {
    map(
        preceded(
            keyword(Keyword::CASE),
            cut(tuple((
                many1(case_branch),
                opt(case_else),
                keyword(Keyword::END),
            ))),
        ),
        |(branches, else_, _)| ast::Expression::Case {
            branches,
            else_: else_.map(Box::new),
        },
    )(input)
}

fn constant(input: &str) -> Result<ast::Constant> {
    alt((
        map(keyword(Keyword::TRUE), |_| ast::Constant::True),
        map(keyword(Keyword::FALSE), |_| ast::Constant::False),
        map(keyword(Keyword::NULL), |_| ast::Constant::Null),
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
    preceded(
        keyword(Keyword::FILTER),
        cut(parenthesized(preceded(keyword(Keyword::WHERE), expression))),
    )(input)
}

fn window_over(input: &str) -> Result<ast::WindowDefinition> {
    preceded(
        keyword(Keyword::OVER),
        cut(alt((
            map(identifier, |existing_window_name| ast::WindowDefinition {
                existing_window_name: Some(existing_window_name),
                partition_by: None,
                order_by: None,
            }),
            parenthesized(window_definition),
        ))),
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
    alt((
        array_subquery,
        case,
        special_function_call,
        column_ref_or_function_call,
        map(constant, ast::Expression::Constant),
        param,
        scalar_subquery,
        parenthesized(expression),
    ))(input)
}

fn exp_expression(input: &str) -> Result<ast::Expression> {
    binop(symbol("^"), primary_expression)(input)
}

fn mul_div_mod_expression(input: &str) -> Result<ast::Expression> {
    binop(
        alt((operator("*"), operator("/"), operator("%"))),
        exp_expression,
    )(input)
}

fn add_sub_expression(input: &str) -> Result<ast::Expression> {
    binop(alt((operator("+"), operator("-"))), mul_div_mod_expression)(input)
}

fn comparison_expression(input: &str) -> Result<ast::Expression> {
    binop(
        alt((
            operator("<"),
            operator("<="),
            operator("="),
            operator("<>"),
            operator(">="),
            operator(">"),
        )),
        add_sub_expression,
    )(input)
}

pub fn expression(input: &str) -> Result<ast::Expression> {
    comparison_expression(input)
}
