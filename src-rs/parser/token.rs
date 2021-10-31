use nom::branch::alt;
use nom::bytes::complete::{is_not, tag, take_until};
use nom::character::complete::multispace0;
use nom::combinator::value;
use nom::multi::many0_count;
use nom::sequence::{pair, tuple};
use nom::IResult;

// oneOf -> nom::branch::alt
// many -> nom::multi::many0_count
// seq -> nom::sequence::tuple
//
//
// export const _: Parser<null> = seqNull(
//   skip('\\s*'),
//   many(
//     oneOf(
//       seqNull(expectString('--'), stringBeforeEndOr('\n'), skip('\\s*')),
//       seqNull(expectString('/*'), stringUntil('\\*/'), skip('\\s*'))
//     )
//   )
// )

fn comment_oneline(i: &str) -> IResult<&str, ()> {
    value((), pair(tag("--"), is_not("\n\r")))(i)
}

fn comment_multiline(i: &str) -> IResult<&str, ()> {
    value((), tuple((tag("/*"), take_until("*/"), tag("*/"))))(i)
}

pub fn __(i: &str) -> IResult<&str, ()> {
    value(
        (),
        tuple((
            multispace0,
            many0_count(alt((
                tuple((comment_oneline, multispace0)),
                tuple((comment_multiline, multispace0)),
            ))),
        )),
    )(i)
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
    assert_eq!(__(""), Ok(("", ())));
}
