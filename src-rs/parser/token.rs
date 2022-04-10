use nom::branch::alt;
use nom::bytes::complete::{is_not, take_until};
use nom::character::complete::{alpha1, alphanumeric1, char, digit1, multispace0, none_of, one_of};
use nom::combinator::{cut, map, opt, recognize, verify};
use nom::error::{ErrorKind, ParseError};
use nom::multi::{many0, many0_count, many1_count};
use nom::sequence::{delimited, pair, preceded, terminated, tuple};
use nom::Err;
use nom::Parser;
use nom_supreme::error::ErrorTree;
use nom_supreme::tag::complete::tag;
use nom_supreme::tag::TagError;
use std::str::FromStr;

use crate::ast;

use super::keyword::Keyword;
use super::result::Result;
use super::utils::unit;

// All token parser consume subsequent whitespace

fn comment_oneline(i: &str) -> Result<()> {
    unit(pair(tag("--"), is_not("\n\r")))(i)
}

fn comment_multiline(i: &str) -> Result<()> {
    unit(tuple((tag("/*"), take_until("*/"), tag("*/"))))(i)
}

pub fn __(input: &str) -> Result<()> {
    unit(tuple((
        multispace0,
        many0_count(alt((
            tuple((comment_oneline, multispace0)),
            tuple((comment_multiline, multispace0)),
        ))),
    )))(input)
}

pub fn match_identifier(input: &str) -> Result<&str> {
    terminated(
        recognize(pair(
            alt((alpha1, tag("_"))),
            many0(alt((alphanumeric1, tag("_")))),
        )),
        __,
    )(input)
}

pub fn keyword<'a>(kw: Keyword) -> impl FnMut(&'a str) -> Result<()> {
    let kw_str: &'static str = kw.into();
    move |input| {
        let orig_input = <&str>::clone(&input);
        let (input, ident) = match_identifier(input)?;
        if ident.to_ascii_uppercase().as_str() == kw_str {
            Ok((input, ()))
        } else {
            Err(Err::Error(ErrorTree::<&str>::from_tag(orig_input, kw_str)))
        }
    }
}

pub fn keywords<'a>(words: &'a [Keyword]) -> impl FnMut(&'a str) -> Result<()> {
    move |i| {
        let mut input = i;
        for kw in words.iter() {
            input = keyword(*kw)(input)?.0;
        }
        Ok((input, ()))
    }
}

fn unquoted_identifier(input: &str) -> Result<&str> {
    match_identifier(input)
}

pub fn identifier(i: &str) -> Result<&str> {
    // TODO: quoted identifier
    let (input, ident) = unquoted_identifier(i)?;

    // TODO: only reject reserved keywords unconditionally
    if Keyword::from_str(ident.to_ascii_uppercase().as_str()).is_ok() {
        Err(Err::Error(ErrorTree::<&str>::from_error_kind(
            i,
            ErrorKind::Verify,
        )))
    } else {
        Ok((input, ident))
    }
}

pub fn symbol<'a>(s: &'static str) -> impl FnMut(&'a str) -> Result<&'a str> {
    terminated(tag(s), __)
}

pub fn any_operator(input: &str) -> Result<&str> {
    terminated(recognize(many1_count(one_of("-+*/<>=~!@#%^&|`?"))), __)(input)
}

pub fn operator<'a>(op: &'static str) -> impl FnMut(&'a str) -> Result<&'a str> {
    move |input: &str| {
        let orig_input = <&str>::clone(&input);
        let (input, operator) = any_operator.parse(input)?;
        if operator == op {
            Ok((input, operator))
        } else {
            Err(Err::Error(ErrorTree::<&str>::from_tag(orig_input, op)))
        }
    }
}

pub fn any_operator_except<'a>(
    exclude: &'static [&'static str],
) -> impl FnMut(&'a str) -> Result<&'a str> {
    verify(any_operator, move |op: &str| {
        exclude.iter().all(|e| op != *e)
    })
}

pub fn number(input: &str) -> Result<&str> {
    terminated(
        alt((
            recognize(tuple((
                digit1,
                opt(preceded(char('.'), digit1)),
                opt(tuple((one_of("eE"), opt(one_of("+-")), digit1))),
            ))),
            recognize(tuple((
                char('.'),
                digit1,
                opt(tuple((one_of("eE"), opt(one_of("+-")), digit1))),
            ))),
        )),
        __,
    )(input)
}

pub fn string(input: &str) -> Result<&str> {
    // TODO: escape sequences
    terminated(
        recognize(tuple((char('\''), many0_count(none_of("'")), char('\'')))),
        __,
    )(input)
}

pub fn param(input: &str) -> Result<ast::Expression> {
    delimited(
        char('$'),
        cut(map(digit1, |digits: &str| {
            let param_number = digits.parse::<usize>().unwrap();
            ast::Expression::Param(param_number)
        })),
        __,
    )(input)
}

#[cfg(test)]
mod tests {
    use super::__;

    #[test]
    fn test_ws() {
        assert_eq!(
            __("-- foo
     -- foo foo
  /* bar

baz*/--quux
  next")
            .unwrap(),
            ("next", ())
        );
        assert_eq!(
            __("-- foo
     -- foo foo
  /* bar

baz*/--quux
  next")
            .unwrap(),
            ("next", ())
        );
    }
}