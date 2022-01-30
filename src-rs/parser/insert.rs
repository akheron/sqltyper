use super::Result;
use crate::ast;
use crate::parser::common::{as_req, identifier_list, returning, table_ref, update_assignments};
use crate::parser::expression::expression;
use crate::parser::keyword::Keyword;
use crate::parser::select::subquery_select;
use crate::parser::token::{identifier, keyword, keywords};
use crate::parser::utils::{list_of1, prefixed, prefixed_, sep_by1, seq};
use nom::branch::alt;
use nom::combinator::{map, opt};

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
            prefixed(Keyword::VALUES, sep_by1(",", expression_values_list)),
        ),
        |(columns, values)| ast::Values::Values { columns, values },
    )(input)
}

fn insert_into(input: &str) -> Result<ast::TableRef> {
    prefixed_(&[Keyword::INSERT, Keyword::INTO], table_ref)(input)
}

fn conflict_target(input: &str) -> Result<ast::ConflictTarget> {
    alt((
        map(identifier_list, ast::ConflictTarget::IndexColumns),
        map(
            prefixed_(&[Keyword::ON, Keyword::CONSTRAINT], identifier),
            ast::ConflictTarget::Constraint,
        ),
    ))(input)
}

fn conflict_action(input: &str) -> Result<ast::ConflictAction> {
    prefixed(
        Keyword::DO,
        alt((
            map(keyword(Keyword::NOTHING), |_| {
                ast::ConflictAction::DoNothing
            }),
            map(
                prefixed(Keyword::UPDATE, update_assignments),
                ast::ConflictAction::DoUpdate,
            ),
        )),
    )(input)
}

fn on_conflict(input: &str) -> Result<ast::OnConflict> {
    prefixed_(
        &[Keyword::ON, Keyword::CONFLICT],
        seq(
            (opt(conflict_target), conflict_action),
            |(conflict_target, conflict_action)| ast::OnConflict {
                conflict_target,
                conflict_action,
            },
        ),
    )(input)
}

pub fn insert(input: &str) -> Result<ast::Insert> {
    seq(
        (
            insert_into,
            opt(as_req),
            alt((
                default_values,
                values,
                map(subquery_select, ast::Values::Query),
            )),
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
