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
        Keyword::OVERLAY,
        seq(
            (
                primary_expression,
                prefixed(Keyword::PLACING, primary_expression),
                prefixed(Keyword::FROM, primary_expression),
                opt(prefixed(Keyword::FOR, primary_expression)),
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
        Keyword::POSITION,
        seq(
            (
                primary_expression,
                prefixed(Keyword::IN, primary_expression),
            ),
            |(substring, string)| vec![substring, string],
        ),
    )(input)
}

fn substring(input: &str) -> Result<ast::Expression> {
    special_function(
        Keyword::SUBSTRING,
        seq(
            (
                primary_expression,
                opt(prefixed(Keyword::FROM, primary_expression)),
                opt(prefixed(Keyword::FOR, primary_expression)),
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
        Keyword::TRIM,
        seq(
            (
                opt(alt((
                    keyword_to(Keyword::LEADING, "LEADING"),
                    keyword_to(Keyword::TRAILING, "TRAILING"),
                    keyword_to(Keyword::BOTH, "BOTH"),
                ))),
                alt((
                    seq(
                        (
                            prefixed(Keyword::FROM, primary_expression),
                            opt(preceded(symbol(","), primary_expression)),
                        ),
                        |(str, chars)| (str, chars),
                    ),
                    seq(
                        (
                            primary_expression,
                            prefixed(Keyword::FROM, primary_expression),
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
