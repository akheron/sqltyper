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

fn statement(input: &str) -> Result<ast::AST> {
    seq(
        (
            opt(with_queries),
            alt((
                map(select, ast::Query::Select),
                map(insert, ast::Query::Insert),
                map(update, ast::Query::Update),
                map(delete, ast::Query::Delete),
            )),
        ),
        |(ctes, query)| ast::AST { ctes, query },
    )(input)
}

pub fn parse_sql(input: &str) -> std::result::Result<ast::AST, ErrorTree<&str>> {
    final_parser(terminated2(statement, opt(symbol(";")), eof))(input)
}

#[cfg(test)]
mod tests;
