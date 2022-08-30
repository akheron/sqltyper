use super::Result;
use crate::ast;
use crate::parser::expression::primary_expression;
use crate::parser::keyword::Keyword;
use crate::parser::token::symbol;
use crate::parser::utils::{keyword_to, parenthesized, prefixed, seq};
use nom::branch::alt;
use nom::combinator::{map, opt};
use nom::sequence::preceded;
use nom::Parser;
use nom_supreme::error::ErrorTree;

fn special_function<'a, F>(
    func_name: Keyword,
    args_parser: F,
) -> impl FnMut(&'a str) -> Result<ast::Expression<'a>>
where
    F: Parser<&'a str, Vec<ast::Expression<'a>>, ErrorTree<&'a str>>,
{
    map(
        prefixed(func_name, parenthesized(args_parser)),
        move |arg_list| ast::Expression::FunctionCall {
            schema: None,
            function_name: func_name.into(),
            arg_list,
            filter: None,
            window: None,
        },
    )
}

fn overlay(input: &str) -> Result<ast::Expression> {
    special_function(
        Keyword::Overlay,
        seq(
            (
                primary_expression,
                prefixed(Keyword::Placing, primary_expression),
                prefixed(Keyword::From, primary_expression),
                opt(prefixed(Keyword::For, primary_expression)),
            ),
            |(str, placing, from, for_opt)| match for_opt {
                None => vec![str, placing, from],
                Some(for_) => vec![str, placing, from, for_],
            },
        ),
    )(input)
}

fn position(input: &str) -> Result<ast::Expression> {
    special_function(
        Keyword::Position,
        seq(
            (
                primary_expression,
                prefixed(Keyword::In, primary_expression),
            ),
            |(substring, string)| vec![substring, string],
        ),
    )(input)
}

fn substring(input: &str) -> Result<ast::Expression> {
    special_function(
        Keyword::Substring,
        seq(
            (
                primary_expression,
                opt(prefixed(Keyword::From, primary_expression)),
                opt(prefixed(Keyword::For, primary_expression)),
            ),
            |(string, start_opt, count_opt)| {
                vec![
                    string,
                    start_opt.unwrap_or(ast::Expression::Constant(ast::Constant::Null)),
                    count_opt.unwrap_or(ast::Expression::Constant(ast::Constant::Null)),
                ]
            },
        ),
    )(input)
}

// trim([leading | trailing | both] from string [, characters] )
// trim([leading | trailing | both] characters from string)
// trim([leading | trailing | both] string [, characters] )
fn trim(input: &str) -> Result<ast::Expression> {
    special_function(
        Keyword::Trim,
        seq(
            (
                opt(alt((
                    keyword_to(Keyword::Leading, "LEADING"),
                    keyword_to(Keyword::Trailing, "TRAILING"),
                    keyword_to(Keyword::Both, "BOTH"),
                ))),
                alt((
                    seq(
                        (
                            prefixed(Keyword::From, primary_expression),
                            opt(preceded(symbol(","), primary_expression)),
                        ),
                        |(str, chars)| (str, chars),
                    ),
                    seq(
                        (
                            primary_expression,
                            prefixed(Keyword::From, primary_expression),
                        ),
                        |(chars, str)| (str, Some(chars)),
                    ),
                    seq(
                        (
                            primary_expression,
                            opt(preceded(symbol(","), primary_expression)),
                        ),
                        |(str, chars)| (str, chars),
                    ),
                )),
            ),
            |(direction, (string, characters))| {
                vec![
                    ast::Expression::Constant(ast::Constant::String(direction.unwrap_or("BOTH"))),
                    characters.unwrap_or(ast::Expression::Constant(ast::Constant::Null)),
                    string,
                ]
            },
        ),
    )(input)
}

pub fn special_function_call(input: &str) -> Result<ast::Expression> {
    alt((overlay, position, substring, trim))(input)
}
