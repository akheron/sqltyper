use super::Result;
use crate::ast;
use crate::parser::common::{as_req, returning, table_ref, update_assignments, where_};
use crate::parser::join::from;
use crate::parser::keyword::Keyword;
use crate::parser::utils::{prefixed, seq};
use nom::combinator::opt;

pub fn update(input: &str) -> Result<ast::Update> {
    seq(
        (
            prefixed(Keyword::Update, table_ref),
            opt(as_req),
            update_assignments,
            opt(from),
            opt(where_),
            opt(returning),
        ),
        |(table, as_, updates, from, where_, returning)| ast::Update {
            table,
            as_,
            updates,
            from,
            where_,
            returning,
        },
    )(input)
}
