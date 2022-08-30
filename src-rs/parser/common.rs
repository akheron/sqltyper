use super::Result;
use crate::ast;
use crate::ast::UpdateValue;
use crate::parser::expression::expression;
use crate::parser::keyword::Keyword;
use crate::parser::token::{identifier, keyword, symbol};
use crate::parser::utils::{list_of1, prefixed, sep_by1, seq, terminated2};
use nom::branch::alt;
use nom::combinator::{map, opt};
use nom::sequence::preceded;

// (name1, name2, ...)
pub fn identifier_list(input: &str) -> Result<Vec<&str>> {
    list_of1(identifier)(input)
}

// [ AS ] identifier
pub fn as_opt(input: &str) -> Result<&str> {
    seq(
        (opt(keyword(Keyword::As)), identifier),
        |(_, identifier)| identifier,
    )(input)
}

// AS identifier
pub fn as_req(input: &str) -> Result<&str> {
    prefixed(Keyword::As, identifier)(input)
}

// [ schema . ] table
pub fn table_ref(input: &str) -> Result<ast::TableRef> {
    seq(
        (identifier, opt(preceded(symbol("."), identifier))),
        |(id1, id2)| match id2 {
            Some(table) => ast::TableRef {
                schema: Some(id1),
                table,
            },
            None => ast::TableRef {
                schema: None,
                table: id1,
            },
        },
    )(input)
}

fn update_assignment(input: &str) -> Result<ast::UpdateAssignment> {
    seq(
        (
            identifier,
            symbol("="),
            alt((
                map(expression, UpdateValue::Value),
                map(keyword(Keyword::Default), |_| UpdateValue::Default),
            )),
        ),
        |(column, _eq, value)| ast::UpdateAssignment { column, value },
    )(input)
}

pub fn update_assignments(input: &str) -> Result<Vec<ast::UpdateAssignment>> {
    prefixed(Keyword::Set, sep_by1(",", update_assignment))(input)
}

pub fn where_(input: &str) -> Result<ast::Expression> {
    prefixed(Keyword::Where, expression)(input)
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

pub fn select_list(input: &str) -> Result<Vec<ast::SelectListItem>> {
    sep_by1(",", select_list_item)(input)
}

pub fn returning(input: &str) -> Result<Vec<ast::SelectListItem>> {
    prefixed(Keyword::Returning, select_list)(input)
}
