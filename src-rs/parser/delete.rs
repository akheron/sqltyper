use nom::combinator::opt;

use crate::ast;
use crate::parser::common::{as_req, returning, table_ref, where_};
use crate::parser::keyword::Keyword;
use crate::parser::utils::{prefixed_, seq};

use super::Result;

pub fn delete(input: &str) -> Result<ast::Delete> {
    seq(
        (
            prefixed_(&[Keyword::Delete, Keyword::From], table_ref),
            opt(as_req),
            opt(where_),
            opt(returning),
        ),
        |(table, as_, where_, returning)| ast::Delete {
            table,
            as_,
            where_,
            returning,
        },
    )(input)
}
