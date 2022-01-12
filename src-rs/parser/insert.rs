use super::Result;
use crate::ast;
use crate::parser::expression::expression;
use crate::parser::keyword::Keyword;
use crate::parser::misc::{as_opt, as_req, identifier_list, table_ref};
use crate::parser::token::{identifier, keyword, keywords, symbol};
use crate::parser::update::update_assignments;
use crate::parser::utils::{list_of1, sep_by1, seq};
use nom::branch::alt;
use nom::combinator::{map, opt};
use nom::sequence::preceded;

fn default_values(input: &str) -> Result<ast::Values> {
    map(keywords(&[Keyword::DEFAULT, Keyword::VALUES]), |_| {
        ast::Values::DefaultValues
    })(input)
}

fn expression_values_list_item(input: &str) -> Result<ast::ValuesValue> {
    alt((
        map(keyword(Keyword::DEFAULT), |_| ast::ValuesValue::Default),
        map(expression, ast::ValuesValue::Value),
    ))(input)
}

fn expression_values_list(input: &str) -> Result<Vec<ast::ValuesValue>> {
    list_of1(expression_values_list_item)(input)
}

fn values(input: &str) -> Result<ast::Values> {
    seq(
        (
            opt(identifier_list),
            keyword(Keyword::VALUES),
            sep_by1(",", expression_values_list),
        ),
        |(columns, _, values)| ast::Values::Values { columns, values },
    )(input)
}

fn insert_into(input: &str) -> Result<ast::TableRef> {
    preceded(keywords(&[Keyword::INSERT, Keyword::INTO]), table_ref)(input)
}

fn conflict_target(input: &str) -> Result<ast::ConflictTarget> {
    alt((
        map(identifier_list, ast::ConflictTarget::IndexColumns),
        map(
            preceded(keywords(&[Keyword::ON, Keyword::CONSTRAINT]), identifier),
            ast::ConflictTarget::Constraint,
        ),
    ))(input)
}

fn conflict_action(input: &str) -> Result<ast::ConflictAction> {
    preceded(
        keyword(Keyword::DO),
        alt((
            map(keyword(Keyword::NOTHING), |_| {
                ast::ConflictAction::DoNothing
            }),
            map(
                preceded(keyword(Keyword::UPDATE), update_assignments),
                ast::ConflictAction::DoUpdate,
            ),
        )),
    )(input)
}

fn on_conflict(input: &str) -> Result<ast::OnConflict> {
    seq(
        (
            keywords(&[Keyword::ON, Keyword::CONFLICT]),
            opt(conflict_target),
            conflict_action,
        ),
        |(_, conflict_target, conflict_action)| ast::OnConflict {
            conflict_target,
            conflict_action,
        },
    )(input)
}

fn expression_as(input: &str) -> Result<ast::ExpressionAs> {
    seq((expression, opt(as_opt)), |(expr, as_)| ast::ExpressionAs {
        expr,
        as_,
    })(input)
}

fn returning(input: &str) -> Result<ast::Returning> {
    preceded(
        keyword(Keyword::RETURNING),
        alt((
            map(symbol("*"), |_| ast::Returning::AllColumns),
            map(sep_by1(",", expression_as), ast::Returning::Expressions),
        )),
    )(input)
}

pub fn insert(input: &str) -> Result<ast::Insert> {
    seq(
        (
            insert_into,
            opt(as_req),
            alt((default_values, values)),
            opt(on_conflict),
            opt(returning),
        ),
        |(table, as_, values, on_conflict, returning)| ast::Insert {
            table,
            as_,
            values,
            on_conflict,
            returning,
        },
    )(input)
}
