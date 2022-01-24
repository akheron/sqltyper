use super::result::Result;
use crate::ast;
use crate::parser::keyword::Keyword;
use crate::parser::token::{identifier, keyword, keywords, string, symbol, __};
use crate::parser::utils::{parenthesized, prefixed, prefixed_, seq};
use nom::branch::alt;
use nom::character::complete::digit1;
use nom::combinator::{opt, recognize, value};
use nom::sequence::{preceded, terminated, tuple};
use nom::Parser;

fn optional_precision(input: &str) -> Result<()> {
    value((), opt(parenthesized(digit1)))(input)
}

fn optional_decimal_precision(input: &str) -> Result<()> {
    value((), opt(parenthesized(tuple((digit1, symbol(","), digit1)))))(input)
}

fn optional_interval_fields(input: &str) -> Result<()> {
    value(
        (),
        opt(alt((
            keywords(&[Keyword::YEAR, Keyword::TO, Keyword::MONTH]),
            keywords(&[Keyword::DAY, Keyword::TO, Keyword::HOUR]),
            keywords(&[Keyword::DAY, Keyword::TO, Keyword::MINUTE]),
            keywords(&[Keyword::DAY, Keyword::TO, Keyword::SECOND]),
            keywords(&[Keyword::MINUTE, Keyword::TO, Keyword::SECOND]),
            keyword(Keyword::YEAR),
            keyword(Keyword::MONTH),
            keyword(Keyword::DAY),
            keyword(Keyword::HOUR),
            keyword(Keyword::MINUTE),
            keyword(Keyword::SECOND),
        ))),
    )(input)
}

fn optional_timezone_modifier(input: &str) -> Result<()> {
    value(
        (),
        opt(alt((
            keywords(&[Keyword::WITH, Keyword::TIME, Keyword::ZONE]),
            keywords(&[Keyword::WITHOUT, Keyword::TIME, Keyword::ZONE]),
        ))),
    )(input)
}

#[derive(Clone, Copy)]
enum Syntax {
    Psql,
    Prefix,
}

fn special_type_cast_target_type<'a>(syntax: Syntax) -> impl FnMut(&'a str) -> Result<'a, ()> {
    move |input: &str| {
        alt((
            prefixed_(&[Keyword::BIT, Keyword::VARYING], optional_precision),
            prefixed(Keyword::BIT, optional_precision),
            prefixed_(&[Keyword::CHARACTER, Keyword::VARYING], optional_precision),
            keywords(&[Keyword::DOUBLE, Keyword::PRECISION]),
            value(
                (),
                tuple((
                    alt((keyword(Keyword::NUMERIC), keyword(Keyword::DECIMAL))),
                    optional_decimal_precision,
                )),
            ),
            value(
                (),
                tuple((
                    alt((keyword(Keyword::TIME), keyword(Keyword::TIMESTAMP))),
                    optional_precision,
                    optional_timezone_modifier,
                )),
            ),
            move |input: &'a str| -> Result<()> {
                let (input, _) = keyword(Keyword::INTERVAL).parse(input)?;
                let (input, _) = match syntax {
                    Syntax::Psql => optional_interval_fields.parse(input)?,
                    _ => (input, ()),
                };
                optional_precision.parse(input)
            },
        ))(input)
    }
}

pub fn psql_type_cast(input: &str) -> Result<&str> {
    terminated(
        preceded(
            symbol("::"),
            recognize(tuple((
                alt((
                    special_type_cast_target_type(Syntax::Psql),
                    value((), identifier),
                )),
                opt(value("[]", tuple((symbol("["), symbol("]"))))),
            ))),
        ),
        __,
    )(input)
}

/**
 * Typecasts of the form `type 'string'`
 *
 * Example: TIMEZONE (4) WITH TIME ZONE '2020-02-02T12:34:56.789123'
 */
pub fn prefix_typecast(input: &str) -> Result<ast::Expression> {
    seq(
        (
            alt((
                recognize(special_type_cast_target_type(Syntax::Prefix)),
                identifier,
            )),
            string,
        ),
        |(target_type, value)| ast::Expression::TypeCast {
            lhs: Box::new(ast::Expression::Constant(ast::Constant::String(value))),
            target_type,
        },
    )(input)
}
