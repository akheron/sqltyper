use nom::branch::alt;
use nom::combinator::map;
use nom::multi::many0;
use nom::sequence::tuple;
use nom::Parser;
use nom_supreme::error::ErrorTree;

use crate::ast;
use crate::parser::expression::expression;
use crate::parser::keyword::Keyword;
use crate::parser::select::subquery_select;
use crate::parser::utils::{keyword_to, parenthesized, seq};

use super::super::Result;

pub fn unop<'a, S, P>(op: S, mut next: P) -> impl FnMut(&'a str) -> Result<'a, ast::Expression<'a>>
where
    S: Parser<&'a str, &'a str, ErrorTree<&'a str>>,
    P: Parser<&'a str, ast::Expression<'a>, ErrorTree<&'a str>> + Copy,
{
    let mut repeat = many0(op);
    move |input: &str| {
        let (input, ops) = repeat.parse(input)?;
        let (input, rhs) = next.parse(input)?;
        let expr = ops
            .into_iter()
            .fold(rhs, |acc, op| ast::Expression::UnaryOp {
                op,
                expr: Box::new(acc),
            });
        Ok((input, expr))
    }
}

enum AnySomeAllInner<'a> {
    Subquery(Box<ast::SubquerySelect<'a>>),
    Array(Box<ast::Expression<'a>>),
}

struct AnySomeAll<'a> {
    comparison: &'a str,
    rhs: AnySomeAllInner<'a>,
}

impl<'a> AnySomeAll<'a> {
    pub fn into_expression(
        self,
        lhs: Box<ast::Expression<'a>>,
        op: &'a str,
    ) -> ast::Expression<'a> {
        match self.rhs {
            AnySomeAllInner::Subquery(subquery) => ast::Expression::AnySomeAllSubquery {
                lhs,
                op,
                comparison: self.comparison,
                subquery,
            },
            AnySomeAllInner::Array(rhs) => ast::Expression::AnySomeAllArray {
                lhs,
                op,
                comparison: self.comparison,
                rhs,
            },
        }
    }
}

fn any_some_all(input: &str) -> Result<AnySomeAll> {
    seq(
        (
            alt((
                keyword_to(Keyword::Any, "ANY"),
                keyword_to(Keyword::Some, "SOME"),
                keyword_to(Keyword::All, "ALL"),
            )),
            parenthesized(alt((
                map(subquery_select, |subquery| {
                    AnySomeAllInner::Subquery(Box::new(subquery))
                }),
                (map(expression, |rhs| AnySomeAllInner::Array(Box::new(rhs)))),
            ))),
        ),
        |(comparison, rhs)| AnySomeAll { comparison, rhs },
    )(input)
}

enum Binop<'a> {
    RhsExpr(Box<ast::Expression<'a>>),
    AnySomeAll(AnySomeAll<'a>),
}

impl<'a> Binop<'a> {
    pub fn into_expression(self, lhs: ast::Expression<'a>, op: &'a str) -> ast::Expression<'a> {
        match self {
            Binop::RhsExpr(rhs) => ast::Expression::BinaryOp(Box::new(lhs), op, rhs),
            Binop::AnySomeAll(value) => value.into_expression(Box::new(lhs), op),
        }
    }
}

pub fn binop<'a, S, P>(op: S, mut expr: P) -> impl FnMut(&'a str) -> Result<'a, ast::Expression<'a>>
where
    S: Parser<&'a str, &'a str, ErrorTree<&'a str>>,
    P: Parser<&'a str, ast::Expression<'a>, ErrorTree<&'a str>> + Copy,
{
    let mut repeat = tuple((
        op,
        alt((
            map(expr, |e| Binop::RhsExpr(Box::new(e))),
            // All binary operators can be used in the form `expression op ANY (subquery/expr)`
            map(any_some_all, Binop::AnySomeAll),
        )),
    ));
    move |input: &str| {
        let (mut input, mut acc) = expr.parse(input)?;
        loop {
            match repeat.parse(input) {
                Err(nom::Err::Error(_)) => return Ok((input, acc)),
                Err(e) => return Err(e),
                Ok((i, (op, rhs))) => {
                    input = i;
                    acc = rhs.into_expression(acc, op);
                }
            }
        }
    }
}
