use super::Result;
use crate::ast;
use crate::parser::expression::expression;
use crate::parser::keyword::Keyword;
use crate::parser::token::{identifier, symbol};
use crate::parser::utils::{prefixed, sep_by1, seq};

fn update_assignment(input: &str) -> Result<ast::UpdateAssignment> {
    seq(
        (identifier, symbol("="), expression),
        |(column, _eq, value)| ast::UpdateAssignment {
            column,
            value: Some(value),
        },
    )(input)
}

pub fn update_assignments(input: &str) -> Result<Vec<ast::UpdateAssignment>> {
    prefixed(Keyword::SET, sep_by1(",", update_assignment))(input)
}
