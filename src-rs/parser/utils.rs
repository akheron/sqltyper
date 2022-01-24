use crate::parser::keyword::Keyword;
use crate::parser::token::{keyword, keywords, __};
use nom::combinator::{cut, map, opt, value};
use nom::error::ParseError;
use nom::multi::many0;
use nom::sequence::{delimited, preceded, terminated, tuple, Tuple};
use nom::{IResult, Parser};
use nom_supreme::error::ErrorTree;

use super::ast;
use super::result::Result;
use super::token::symbol;

pub fn unit<I, O, E, F>(parser: F) -> impl FnMut(I) -> IResult<I, (), E>
where
    E: ParseError<I>,
    F: Parser<I, O, E>,
{
    value((), parser)
}

pub fn terminated2<I, O1, O2, O3, E, F, G, H>(
    first: F,
    second: G,
    third: H,
) -> impl FnMut(I) -> IResult<I, O1, E>
where
    E: ParseError<I>,
    F: Parser<I, O1, E>,
    G: Parser<I, O2, E>,
    H: Parser<I, O3, E>,
{
    terminated(first, terminated(second, third))
}

pub fn prefixed<'a, O, F>(kw: Keyword, parser: F) -> impl FnMut(&'a str) -> Result<'a, O>
where
    F: Parser<&'a str, O, ErrorTree<&'a str>>,
{
    preceded(keyword(kw), cut(parser))
}

pub fn prefixed_<'a, O, F>(kws: &'static [Keyword], parser: F) -> impl FnMut(&'a str) -> Result<O>
where
    F: Parser<&'a str, O, ErrorTree<&'a str>>,
{
    preceded(keywords(kws), cut(parser))
}

pub fn keyword_to<'a, O: Clone>(kw: Keyword, val: O) -> impl FnMut(&'a str) -> Result<O> {
    value(val, keyword(kw))
}

pub fn seq<I, Os, O, E, Parsers, F>(parsers: Parsers, f: F) -> impl FnMut(I) -> IResult<I, O, E>
where
    E: ParseError<I>,
    Parsers: Tuple<I, Os, E>,
    F: FnMut(Os) -> O,
{
    map(tuple(parsers), f)
}

pub fn sep_by1<'a, O, F>(sep: &'static str, parser: F) -> impl FnMut(&'a str) -> Result<Vec<O>>
where
    F: Parser<&'a str, O, ErrorTree<&'a str>> + Copy,
{
    seq(
        (
            parser,
            many0(seq((symbol(sep), parser), |(_, value)| value)),
        ),
        |(first, mut rest)| {
            let mut result = Vec::with_capacity(rest.capacity() + 1);
            result.push(first);
            result.append(&mut rest);
            result
        },
    )
}

pub fn sep_by0<'a, O, F>(sep: &'static str, parser: F) -> impl FnMut(&'a str) -> Result<Vec<O>>
where
    F: Parser<&'a str, O, ErrorTree<&'a str>> + Copy,
{
    map(opt(sep_by1(sep, parser)), |result| {
        result.unwrap_or_else(Vec::new)
    })
}

pub fn parenthesized<'a, O, F>(parser: F) -> impl FnMut(&'a str) -> Result<O>
where
    F: Parser<&'a str, O, ErrorTree<&'a str>>,
{
    terminated(delimited(symbol("("), parser, symbol(")")), __)
}

pub fn list_of1<'a, O, F>(parser: F) -> impl FnMut(&'a str) -> Result<Vec<O>>
where
    F: Parser<&'a str, O, ErrorTree<&'a str>> + Copy,
{
    parenthesized(sep_by1(",", parser))
}

pub fn binop<'a, S, P>(op: S, mut next: P) -> impl FnMut(&'a str) -> Result<'a, ast::Expression<'a>>
where
    S: Parser<&'a str, &'a str, ErrorTree<&'a str>>,
    P: Parser<&'a str, ast::Expression<'a>, ErrorTree<&'a str>> + Copy,
{
    let mut repeat = many0(tuple((op, next)));
    move |input: &str| {
        let (input, first) = next.parse(input)?;
        let (input, rest) = repeat.parse(input)?;
        let expr = rest.into_iter().fold(first, |acc, (op, value)| {
            ast::Expression::BinaryOp(Box::new(acc), op, Box::new(value))
        });
        Ok((input, expr))
    }
}
