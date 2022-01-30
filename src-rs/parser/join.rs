use super::Result;
use crate::ast;
use crate::parser::common::{as_opt, identifier_list, table_ref};
use crate::parser::expression::expression;
use crate::parser::keyword::Keyword;
use crate::parser::statement;
use crate::parser::token::keyword;
use crate::parser::utils::{keyword_to, parenthesized, prefixed, prefixed_, sep_by1, seq};
use nom::branch::alt;
use nom::combinator::{map, opt};
use nom::multi::many0;
use nom::sequence::terminated;

enum Join<'a> {
    Cross,
    Qualified {
        join_type: ast::JoinType,
        condition: ast::JoinCondition<'a>,
    },
    Natural {
        join_type: ast::JoinType,
    },
}

struct JoinSpec<'a> {
    join: Join<'a>,
    table_expression: ast::TableExpression<'a>,
}

fn cross_join(input: &str) -> Result<JoinSpec> {
    prefixed_(
        &[Keyword::CROSS, Keyword::JOIN],
        map(table_expression, |table_expression| JoinSpec {
            join: Join::Cross,
            table_expression,
        }),
    )(input)
}

fn qualified_join_type(input: &str) -> Result<ast::JoinType> {
    seq(
        (
            opt(alt((
                keyword_to(Keyword::INNER, ast::JoinType::Inner),
                terminated(
                    alt((
                        keyword_to(Keyword::LEFT, ast::JoinType::Left),
                        keyword_to(Keyword::RIGHT, ast::JoinType::Right),
                        keyword_to(Keyword::FULL, ast::JoinType::Full),
                    )),
                    opt(keyword(Keyword::OUTER)),
                ),
            ))),
            keyword(Keyword::JOIN),
        ),
        |(join_type, _)| join_type.unwrap_or(ast::JoinType::Inner),
    )(input)
}

fn qualified_join(input: &str) -> Result<JoinSpec> {
    seq(
        (
            qualified_join_type,
            table_expression,
            alt((
                map(prefixed(Keyword::ON, expression), ast::JoinCondition::On),
                map(
                    prefixed(Keyword::USING, identifier_list),
                    ast::JoinCondition::Using,
                ),
            )),
        ),
        |(join_type, table_expression, condition)| JoinSpec {
            join: Join::Qualified {
                join_type,
                condition,
            },
            table_expression,
        },
    )(input)
}

fn natural_join_type(input: &str) -> Result<ast::JoinType> {
    prefixed(Keyword::NATURAL, qualified_join_type)(input)
}

fn natural_join(input: &str) -> Result<JoinSpec> {
    seq(
        (natural_join_type, table_expression),
        |(join_type, table_expression)| JoinSpec {
            join: Join::Natural { join_type },
            table_expression,
        },
    )(input)
}

fn table_expr_reducer<'a>(
    acc: ast::TableExpression<'a>,
    join_spec: JoinSpec<'a>,
) -> ast::TableExpression<'a> {
    let left = Box::new(acc);
    let right = Box::new(join_spec.table_expression);

    match join_spec.join {
        Join::Cross => ast::TableExpression::CrossJoin { left, right },
        Join::Qualified {
            join_type,
            condition,
        } => ast::TableExpression::QualifiedJoin {
            left,
            join_type,
            right,
            condition,
        },
        Join::Natural { join_type } => ast::TableExpression::QualifiedJoin {
            left,
            join_type,
            right,
            condition: ast::JoinCondition::Natural,
        },
    }
}

fn table_expression(input: &str) -> Result<ast::TableExpression> {
    seq(
        (
            alt((
                parenthesized(table_expression),
                seq((parenthesized(statement), as_opt), |(query, as_)| {
                    ast::TableExpression::SubQuery {
                        query: Box::new(query),
                        as_,
                    }
                }),
                seq((table_ref, opt(as_opt)), |(table, as_)| {
                    ast::TableExpression::Table { table, as_ }
                }),
            )),
            many0(alt((cross_join, qualified_join, natural_join))),
        ),
        |(lhs, joins)| joins.into_iter().fold(lhs, table_expr_reducer),
    )(input)
}

pub fn from(input: &str) -> Result<ast::TableExpression> {
    map(
        prefixed(Keyword::FROM, sep_by1(",", table_expression)),
        |table_exprs| {
            // Implicit join equals to CROSS JOIN
            table_exprs
                .into_iter()
                .reduce(|left, right| ast::TableExpression::CrossJoin {
                    left: Box::new(left),
                    right: Box::new(right),
                })
                .unwrap()
        },
    )(input)
}
