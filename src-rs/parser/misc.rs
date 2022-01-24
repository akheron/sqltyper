use super::Result;
use crate::ast;
use crate::parser::keyword::Keyword;
use crate::parser::token::{identifier, keyword, symbol};
use crate::parser::utils::{list_of1, seq};
use nom::combinator::opt;
use nom::sequence::preceded;

// (name1, name2, ...)
pub fn identifier_list(input: &str) -> Result<Vec<&str>> {
    list_of1(identifier)(input)
}

// [ AS ] identifier
pub fn as_opt(input: &str) -> Result<&str> {
    seq(
        (opt(keyword(Keyword::AS)), identifier),
        |(_, identifier)| identifier,
    )(input)
}

// AS identifier
pub fn as_req(input: &str) -> Result<&str> {
    preceded(keyword(Keyword::AS), identifier)(input)
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
