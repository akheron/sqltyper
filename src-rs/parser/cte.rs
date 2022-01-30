use super::Result;
use crate::ast::WithQuery;
use crate::parser::common::identifier_list;
use crate::parser::keyword::Keyword;
use crate::parser::statement;
use crate::parser::token::identifier;
use crate::parser::utils::{parenthesized, prefixed, sep_by1, seq};
use nom::combinator::opt;

fn with_query(input: &str) -> Result<WithQuery> {
    seq(
        (
            identifier,
            opt(identifier_list),
            prefixed(Keyword::AS, parenthesized(statement)),
        ),
        |(as_, column_names, query)| WithQuery {
            as_,
            column_names,
            query: Box::new(query),
        },
    )(input)
}

pub fn with_queries(input: &str) -> Result<Vec<WithQuery>> {
    prefixed(Keyword::WITH, sep_by1(",", with_query))(input)
}
