use nom::branch::alt;
use nom::combinator::{eof, map, opt};
use nom_supreme::error::ErrorTree;
use nom_supreme::final_parser::final_parser;

use super::ast;

use self::cte::with_queries;
use self::delete::delete;
use self::insert::insert;
use self::result::Result;
use self::select::select;
use self::token::*;
use self::update::update;
use self::utils::*;

mod common;
mod cte;
mod delete;
mod expression;
mod insert;
mod join;
mod keyword;
mod result;
mod select;
mod special_function;
mod token;
mod typecasts;
mod update;
mod utils;

fn statement(input: &str) -> Result<ast::Ast> {
    seq(
        (
            opt(with_queries),
            alt((
                map(select, |s| ast::Query::Select(Box::new(s))),
                map(insert, |i| ast::Query::Insert(Box::new(i))),
                map(update, |u| ast::Query::Update(Box::new(u))),
                map(delete, |d| ast::Query::Delete(Box::new(d))),
            )),
        ),
        |(ctes, query)| ast::Ast { ctes, query },
    )(input)
}

pub fn parse_sql(input: &str) -> std::result::Result<ast::Ast, ErrorTree<&str>> {
    final_parser(terminated2(statement, opt(symbol(";")), eof))(input)
}

#[cfg(test)]
mod tests;
