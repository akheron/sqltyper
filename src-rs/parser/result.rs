use nom::IResult;
use nom_supreme::error::ErrorTree;

pub type Result<'a, T> = IResult<&'a str, T, ErrorTree<&'a str>>;
