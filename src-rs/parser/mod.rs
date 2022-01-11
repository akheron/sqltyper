mod expression;
mod insert;
mod join;
mod keyword;
mod misc;
mod result;
mod select;
mod token;
mod update;
mod utils;

use nom::branch::alt;
use nom::combinator::{eof, map, opt};
use nom_supreme::error::ErrorTree;
use nom_supreme::final_parser::final_parser;

use self::insert::insert;
use self::result::Result;
use self::select::select;
use self::token::*;
use self::utils::*;
use super::ast;

fn statement(input: &str) -> Result<ast::AST> {
    alt((map(select, ast::AST::Select), map(insert, ast::AST::Insert)))(input)
}

pub fn parse_sql(input: &str) -> std::result::Result<ast::AST, ErrorTree<&str>> {
    final_parser(terminated2(statement, opt(symbol(";")), eof))(input)
}

#[cfg(test)]
mod tests;
