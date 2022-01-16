use super::Result;
use crate::ast;
use crate::parser::expression::expression;
use crate::parser::keyword::Keyword;
use crate::parser::misc::{as_opt, identifier_list, table_ref};
use crate::parser::statement;
use crate::parser::token::{keyword, keywords};
use crate::parser::utils::{parenthesized, seq};
use nom::branch::alt;
use nom::combinator::{map, opt};
use nom::multi::many0;
use nom::sequence::{preceded, terminated};

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
    preceded(
        keywords(&[Keyword::CROSS, Keyword::JOIN]),
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
                map(keyword(Keyword::INNER), |_| ast::JoinType::Inner),
                terminated(
                    alt((
                        map(keyword(Keyword::LEFT), |_| ast::JoinType::Left),
                        map(keyword(Keyword::RIGHT), |_| ast::JoinType::Right),
                        map(keyword(Keyword::FULL), |_| ast::JoinType::Full),
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
                map(
                    preceded(keyword(Keyword::ON), expression),
                    ast::JoinCondition::On,
                ),
                map(
                    preceded(keyword(Keyword::USING), identifier_list),
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
    preceded(keyword(Keyword::NATURAL), qualified_join_type)(input)
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

pub fn table_expression(input: &str) -> Result<ast::TableExpression> {
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
