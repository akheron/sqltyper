use super::Result;
use crate::ast::WithQuery;
use crate::parser::keyword::Keyword;
use crate::parser::misc::identifier_list;
use crate::parser::statement;
use crate::parser::token::{identifier, keyword};
use crate::parser::utils::{parenthesized, sep_by1, seq};
use nom::combinator::{cut, opt};
use nom::sequence::preceded;

fn with_query(input: &str) -> Result<WithQuery> {
    seq(
        (
            identifier,
            opt(identifier_list),
            keyword(Keyword::AS),
            parenthesized(statement),
        ),
        |(as_, column_names, _, query)| WithQuery {
            as_,
            column_names,
            query: Box::new(query),
        },
    )(input)
}

pub fn with_queries(input: &str) -> Result<Vec<WithQuery>> {
    preceded(keyword(Keyword::WITH), cut(sep_by1(",", with_query)))(input)
}
