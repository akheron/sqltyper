mod token;

use nom::IResult;
use token::__;

pub fn parse_sql(i: &str) -> IResult<&str, ()> {
    __(i)
}
