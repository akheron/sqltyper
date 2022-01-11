use super::Result;
use crate::ast;
use crate::parser::keyword::Keyword;
use crate::parser::misc::column_ref;
use crate::parser::token::{keyword, number, operator, param, string, symbol};
use crate::parser::utils::binop;
use nom::branch::alt;
use nom::combinator::map;

fn constant(input: &str) -> Result<ast::Constant> {
    alt((
        map(keyword(Keyword::TRUE), |_| ast::Constant::True),
        map(keyword(Keyword::FALSE), |_| ast::Constant::False),
        map(keyword(Keyword::NULL), |_| ast::Constant::Null),
        map(number, ast::Constant::Number),
        map(string, ast::Constant::String),
    ))(input)
}

fn primary_expression(input: &str) -> Result<ast::Expression> {
    alt((column_ref, map(constant, ast::Expression::Constant), param))(input)
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

pub fn expression(input: &str) -> Result<ast::Expression> {
    add_sub_expression(input)
}
