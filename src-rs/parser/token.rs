use nom::branch::alt;
use nom::bytes::complete::{is_not, take_until};
use nom::character::complete::{alpha1, alphanumeric1, char, digit1, multispace0, none_of, one_of};
use nom::combinator::{opt, recognize, value, verify};
use nom::multi::{many0, many0_count, many1_count};
use nom::sequence::{pair, preceded, terminated, tuple};
use nom_supreme::tag::complete::tag;

use super::result::Result;
use super::utils::seq;

// All token parser consume subsequent whitespace

fn comment_oneline(i: &str) -> Result<()> {
    value((), pair(tag("--"), is_not("\n\r")))(i)
}

fn comment_multiline(i: &str) -> Result<()> {
    value((), tuple((tag("/*"), take_until("*/"), tag("*/"))))(i)
}

fn __(input: &str) -> Result<()> {
    value(
        (),
        tuple((
            multispace0,
            many0_count(alt((
                tuple((comment_oneline, multispace0)),
                tuple((comment_multiline, multispace0)),
            ))),
        )),
    )(input)
}

#[test]
fn test_ws() {
    assert_eq!(
        __("-- foo
     -- foo foo
  /* bar

baz*/--quux
  next"),
        Ok(("next", ()))
    );
    assert_eq!(
        __("-- foo
     -- foo foo
  /* bar

baz*/--quux
  next"),
        Ok(("next", ()))
    );
}

pub fn match_identifier(input: &str) -> Result<&str> {
    seq(
        (
            recognize(pair(
                alt((alpha1, tag("_"))),
                many0(alt((alphanumeric1, tag("_")))),
            )),
            __,
        ),
        |(identifier, _)| identifier,
    )(input)
}

pub trait Keyword {
    fn check(&self, word: &str) -> bool;
}

// TODO: Use strum for enum-string mapping

#[derive(Clone, Copy)]
pub enum Reserved {
    As,
    Default,
    False,
    Into,
    Null,
    True,
}

impl Keyword for Reserved {
    fn check(&self, word: &str) -> bool {
        word.to_ascii_uppercase()
            == match self {
                Reserved::As => "AS",
                Reserved::Default => "DEFAULT",
                Reserved::False => "FALSE",
                Reserved::Into => "INTO",
                Reserved::Null => "NULL",
                Reserved::True => "TRUE",
            }
    }
}

fn is_reserved_word(ident: &str) -> bool {
    match ident.to_ascii_uppercase().as_str() {
        "AS" => true,
        "DEFAULT" => true,
        "FALSE" => true,
        "INTO" => true,
        "NULL" => true,
        "TRUE" => true,
        _ => false,
    }
}

#[derive(Clone, Copy)]
pub enum Unreserved {
    Insert,
    Values,
}

impl Keyword for Unreserved {
    fn check(&self, word: &str) -> bool {
        word.to_ascii_uppercase()
            == match self {
                Unreserved::Insert => "INSERT",
                Unreserved::Values => "VALUES",
            }
    }
}

pub fn keyword<'a, W: Keyword + Copy>(word: W) -> impl FnMut(&'a str) -> Result<()> {
    move |input| {
        value(
            (),
            verify(match_identifier, |identifier: &str| word.check(identifier)),
        )(input)
    }
}

fn unquoted_identifier(input: &str) -> Result<&str> {
    verify(match_identifier, |identifier| !is_reserved_word(identifier))(input)
}

pub fn identifier(input: &str) -> Result<&str> {
    // TODO: quoted identifier
    unquoted_identifier(input)
}

pub fn symbol<'a>(s: &'static str) -> impl FnMut(&'a str) -> Result<&'a str> {
    terminated(tag(s), __)
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
    recognize(tuple((char('\''), many1_count(none_of("'")), char('\''))))(input)
}

pub fn param(input: &str) -> Result<&str> {
    terminated(recognize(tuple((char('$'), digit1))), __)(input)
}
