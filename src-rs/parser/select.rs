use super::Result;
use crate::ast;
use crate::parser::cte::with_queries;
use crate::parser::expression::expression;
use crate::parser::join::table_expression;
use crate::parser::keyword::Keyword;
use crate::parser::misc::as_opt;
use crate::parser::token::{any_operator, identifier, keyword, symbol};
use crate::parser::utils::{
    keyword_to, list_of1, parenthesized, prefixed, prefixed_, sep_by1, seq, terminated2,
};
use nom::branch::alt;
use nom::combinator::{map, opt};
use nom::multi::many0;

fn distinct(input: &str) -> Result<ast::Distinct> {
    alt((
        map(keyword(Keyword::ALL), |_| ast::Distinct::All),
        map(
            prefixed(
                Keyword::DISTINCT,
                opt(prefixed(Keyword::ON, list_of1(expression))),
            ),
            |on| match on {
                None => ast::Distinct::Distinct,
                Some(exprs) => ast::Distinct::Expression(exprs),
            },
        ),
    ))(input)
}

fn all_fields(input: &str) -> Result<ast::SelectListItem> {
    map(symbol("*"), |_| ast::SelectListItem::AllFields)(input)
}

fn all_table_fields(input: &str) -> Result<ast::SelectListItem> {
    map(
        terminated2(identifier, symbol("."), symbol("*")),
        |table_name| ast::SelectListItem::AllTableFields { table_name },
    )(input)
}

fn select_list_expression(input: &str) -> Result<ast::SelectListItem> {
    seq((expression, opt(as_opt)), |(expression, as_)| {
        ast::SelectListItem::SelectListExpression { expression, as_ }
    })(input)
}

fn select_list_item(input: &str) -> Result<ast::SelectListItem> {
    alt((all_fields, all_table_fields, select_list_expression))(input)
}

fn select_list(input: &str) -> Result<Vec<ast::SelectListItem>> {
    sep_by1(",", select_list_item)(input)
}

fn from(input: &str) -> Result<ast::TableExpression> {
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

fn where_(input: &str) -> Result<ast::Expression> {
    prefixed(Keyword::WHERE, expression)(input)
}

fn group_by(input: &str) -> Result<Vec<ast::Expression>> {
    prefixed_(&[Keyword::GROUP, Keyword::BY], sep_by1(",", expression))(input)
}

fn having(input: &str) -> Result<ast::Expression> {
    prefixed(Keyword::HAVING, expression)(input)
}

fn select_body(input: &str) -> Result<ast::SelectBody> {
    prefixed(
        Keyword::SELECT,
        seq(
            (
                opt(distinct),
                select_list,
                opt(from),
                opt(where_),
                opt(group_by),
                opt(having),
                opt(window),
            ),
            |(distinct, select_list, from, where_, group_by, having, window)| ast::SelectBody {
                distinct: distinct.unwrap_or(ast::Distinct::All),
                select_list,
                from,
                where_,
                group_by: group_by.unwrap_or_else(Vec::new),
                having,
                window: window.unwrap_or_else(Vec::new),
            },
        ),
    )(input)
}

pub fn window_definition(input: &str) -> Result<ast::WindowDefinition> {
    seq(
        (
            opt(identifier),
            opt(prefixed_(
                &[Keyword::PARTITION, Keyword::BY],
                sep_by1(",", expression),
            )),
            opt(order_by),
        ),
        |(existing_window_name, partition_by, order_by)| ast::WindowDefinition {
            existing_window_name,
            partition_by,
            order_by,
        },
    )(input)
}

fn order(input: &str) -> Result<ast::Order> {
    alt((
        keyword_to(Keyword::ASC, ast::Order::Asc),
        keyword_to(Keyword::DESC, ast::Order::Desc),
        map(prefixed(Keyword::USING, any_operator), ast::Order::Using),
    ))(input)
}

fn nulls(input: &str) -> Result<ast::Nulls> {
    prefixed(
        Keyword::NULLS,
        alt((
            keyword_to(Keyword::FIRST, ast::Nulls::First),
            keyword_to(Keyword::LAST, ast::Nulls::Last),
        )),
    )(input)
}

fn order_by_item(input: &str) -> Result<ast::OrderBy> {
    seq(
        (expression, opt(order), opt(nulls)),
        |(expression, order, nulls)| ast::OrderBy {
            expression,
            order,
            nulls,
        },
    )(input)
}

fn order_by(input: &str) -> Result<Vec<ast::OrderBy>> {
    prefixed_(&[Keyword::ORDER, Keyword::BY], sep_by1(",", order_by_item))(input)
}

fn named_window_definition(input: &str) -> Result<ast::NamedWindowDefinition> {
    seq(
        (
            identifier,
            prefixed(Keyword::AS, parenthesized(window_definition)),
        ),
        |(name, window)| ast::NamedWindowDefinition { name, window },
    )(input)
}

fn window(input: &str) -> Result<Vec<ast::NamedWindowDefinition>> {
    prefixed(Keyword::WINDOW, sep_by1(",", named_window_definition))(input)
}

fn select_op_type(input: &str) -> Result<ast::SelectOpType> {
    alt((
        keyword_to(Keyword::UNION, ast::SelectOpType::Union),
        keyword_to(Keyword::INTERSECT, ast::SelectOpType::Intersect),
        keyword_to(Keyword::EXCEPT, ast::SelectOpType::Except),
    ))(input)
}

fn duplicates_type(input: &str) -> Result<ast::DuplicatesType> {
    alt((
        keyword_to(Keyword::DISTINCT, ast::DuplicatesType::Distinct),
        keyword_to(Keyword::ALL, ast::DuplicatesType::All),
    ))(input)
}

fn select_set_ops(input: &str) -> Result<Vec<ast::SelectOp>> {
    many0(seq(
        (select_op_type, opt(duplicates_type), select_body),
        |(op, duplicates, select)| ast::SelectOp {
            op,
            duplicates: duplicates.unwrap_or(ast::DuplicatesType::Distinct),
            select,
        },
    ))(input)
}

fn limit(input: &str) -> Result<ast::Limit> {
    prefixed(
        Keyword::LIMIT,
        seq(
            (
                alt((map(keyword(Keyword::ALL), |_| None), map(expression, Some))),
                opt(prefixed(Keyword::OFFSET, expression)),
            ),
            |(count, offset)| ast::Limit { count, offset },
        ),
    )(input)
}

pub fn subquery_select(input: &str) -> Result<ast::SubquerySelect> {
    seq((opt(with_queries), select), |(ctes, query)| {
        ast::SubquerySelect { ctes, query }
    })(input)
}

pub fn select(input: &str) -> Result<ast::Select> {
    seq(
        (select_body, select_set_ops, opt(order_by), opt(limit)),
        |(body, set_ops, order_by, limit)| ast::Select {
            body,
            set_ops,
            order_by: order_by.unwrap_or_else(Vec::new),
            limit,
        },
    )(input)
}
