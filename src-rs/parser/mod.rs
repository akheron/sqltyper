mod keyword;
mod result;
mod token;
mod utils;

use nom::branch::alt;
use nom::combinator::{eof, map, opt, value};
use nom::sequence::{preceded, terminated};
use nom_supreme::error::ErrorTree;
use nom_supreme::final_parser::final_parser;

use self::keyword::Keyword;
use self::result::Result;
use self::token::*;
use self::utils::*;
use super::ast;

// (name1, name2, ...)

fn identifier_list(input: &str) -> Result<Vec<&str>> {
    list_of1(identifier)(input)
}

// [ AS ] identifier
fn as_opt(input: &str) -> Result<&str> {
    seq(
        (opt(keyword(Keyword::AS)), identifier),
        |(_, identifier)| identifier,
    )(input)
}

// AS identifier
fn as_req(input: &str) -> Result<&str> {
    preceded(keyword(Keyword::AS), identifier)(input)
}

// [ schema . ] table
fn table_ref(input: &str) -> Result<ast::TableRef> {
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

fn constant(input: &str) -> Result<ast::Constant> {
    alt((
        map(keyword(Keyword::TRUE), |_| ast::Constant::True),
        map(keyword(Keyword::FALSE), |_| ast::Constant::False),
        map(keyword(Keyword::NULL), |_| ast::Constant::Null),
        map(number, ast::Constant::Number),
        map(string, ast::Constant::String),
    ))(input)
}

fn column_ref(input: &str) -> Result<ast::Expression> {
    seq(
        (identifier, opt(preceded(symbol("."), identifier))),
        |(id1, id2)| {
            if let Some(column) = id2 {
                ast::Expression::TableColumnRef { table: id1, column }
            } else {
                ast::Expression::ColumnRef(id1)
            }
        },
    )(input)
}

fn primary_expression(input: &str) -> Result<ast::Expression> {
    alt((
        column_ref,
        map(constant, ast::Expression::Constant),
        map(param, ast::Expression::Param),
    ))(input)
}

fn exp_expression(input: &str) -> Result<ast::Expression> {
    binop(symbol("^"), primary_expression)(input)
}

fn mul_div_mod_expression(input: &str) -> Result<ast::Expression> {
    binop(
        alt((operator("*"), operator("/"), operator("%"))),
        exp_expression,
    )(input)
}

fn add_sub_expression(input: &str) -> Result<ast::Expression> {
    binop(alt((operator("+"), operator("-"))), mul_div_mod_expression)(input)
}

fn expression(input: &str) -> Result<ast::Expression> {
    add_sub_expression(input)
}

// INSERT

fn default_values(input: &str) -> Result<ast::Values> {
    map(keywords(&[Keyword::DEFAULT, Keyword::VALUES]), |_| {
        ast::Values::DefaultValues
    })(input)
}

fn expression_values_list_item(input: &str) -> Result<ast::ValuesValue> {
    alt((
        map(keyword(Keyword::DEFAULT), |_| ast::ValuesValue::Default),
        map(expression, ast::ValuesValue::Value),
    ))(input)
}

fn expression_values_list(input: &str) -> Result<Vec<ast::ValuesValue>> {
    list_of1(expression_values_list_item)(input)
}

fn expression_values(input: &str) -> Result<ast::Values> {
    map(
        preceded(
            keyword(Keyword::VALUES),
            sep_by1(",", expression_values_list),
        ),
        ast::Values::Values,
    )(input)
}

fn values(input: &str) -> Result<ast::Values> {
    alt((
        default_values,
        expression_values,
        // TODO: subquery select
    ))(input)
}

fn insert_into(input: &str) -> Result<ast::TableRef> {
    preceded(keywords(&[Keyword::INSERT, Keyword::INTO]), table_ref)(input)
}

fn conflict_target(input: &str) -> Result<ast::ConflictTarget> {
    alt((
        map(identifier_list, ast::ConflictTarget::IndexColumns),
        map(
            preceded(keywords(&[Keyword::ON, Keyword::CONSTRAINT]), identifier),
            ast::ConflictTarget::Constraint,
        ),
    ))(input)
}

fn conflict_action(input: &str) -> Result<ast::ConflictAction> {
    preceded(
        keyword(Keyword::DO),
        alt((
            map(keyword(Keyword::NOTHING), |_| {
                ast::ConflictAction::DoNothing
            }),
            map(
                preceded(keyword(Keyword::UPDATE), update_assignments),
                ast::ConflictAction::DoUpdate,
            ),
        )),
    )(input)
}

fn on_conflict(input: &str) -> Result<ast::OnConflict> {
    seq(
        (
            keywords(&[Keyword::ON, Keyword::CONFLICT]),
            opt(conflict_target),
            conflict_action,
        ),
        |(_, conflict_target, conflict_action)| ast::OnConflict {
            conflict_target,
            conflict_action,
        },
    )(input)
}

fn insert(input: &str) -> Result<ast::Insert> {
    seq(
        (
            insert_into,
            opt(as_req),
            opt(identifier_list),
            values,
            opt(on_conflict),
            // TODO: RETURNING
        ),
        |(table, as_, columns, values, on_conflict)| ast::Insert {
            table,
            as_,
            columns,
            values,
            on_conflict,
        },
    )(input)
}

// UPDATE

fn update_assignment(input: &str) -> Result<ast::UpdateAssignment> {
    seq(
        (identifier, symbol("="), expression),
        |(column, _eq, value)| ast::UpdateAssignment {
            column,
            value: Some(value),
        },
    )(input)
}

fn update_assignments(input: &str) -> Result<Vec<ast::UpdateAssignment>> {
    preceded(keyword(Keyword::SET), sep_by1(",", update_assignment))(input)
}

fn parse(input: &str) -> Result<ast::AST> {
    map(terminated2(insert, opt(symbol(";")), eof), ast::AST::Insert)(input)
}

pub fn parse_sql(input: &str) -> std::result::Result<ast::AST, ErrorTree<&str>> {
    final_parser(parse)(input)
}

#[cfg(test)]
mod tests;
