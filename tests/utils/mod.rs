use std::fs::File;
use std::io::Read;
use std::path::Path;

use nom::branch::alt;
use nom::bytes::complete::{tag, take_until};
use nom::character::complete::{alphanumeric1, anychar, char, newline, space1};
use nom::combinator::{all_consuming, map, opt, peek, recognize, rest, value};
use nom::multi::{many0, many0_count, many1_count, many_till};
use nom::sequence::{delimited, terminated, tuple};
use nom::{error, Finish, IResult, Parser};
use tokio_postgres::types::Type;

use sqltyper::types::{
    NamedValue, StatementDescription, StatementRowCount, UnnamedValue, ValueType,
};
use sqltyper::{connect_to_database, sql_to_statement_description};

pub async fn test(
    init_sql: Option<&str>,
    sql: &str,
    row_count: StatementRowCount,
    params: &[UnnamedValue],
    columns: &[NamedValue],
) {
    let statement = get_statement(init_sql, sql).await;
    assert_statement(&statement, row_count, params, columns);
}
async fn get_statement<'a>(init_sql: Option<&str>, sql: &'a str) -> StatementDescription<'a> {
    // Run in transaction to rollback all changes automatically
    let mut client = connect().await.unwrap();
    let tx = client.transaction().await.unwrap();

    if let Some(init) = init_sql {
        tx.batch_execute(init).await.unwrap();
    }
    sql_to_statement_description(&tx, sql).await.unwrap()
}

async fn connect() -> Result<tokio_postgres::Client, tokio_postgres::Error> {
    let config = std::env::var("DATABASE");
    if let Err(std::env::VarError::NotPresent) = config {
        panic!("Environment variable DATABASE not set");
    }
    connect_to_database(&config.unwrap()).await
}

fn assert_statement(
    statement: &StatementDescription,
    expected_row_count: StatementRowCount,
    expected_params: &[UnnamedValue],
    expected_columns: &[NamedValue],
) {
    assert!(statement.analyze_error.is_none(), "Analyze error");
    assert_eq!(statement.row_count, expected_row_count, "Row count");
    assert_eq!(statement.params, expected_params, "Params");
    assert_eq!(statement.columns, expected_columns, "Columns");
}

pub struct TestCase<'a> {
    setup: Option<&'a str>,
    query: &'a str,
    row_count: StatementRowCount,
    params: Vec<UnnamedValue>,
    columns: Vec<NamedValue>,
}

pub async fn run_test_file(path: &Path) {
    let mut file = File::open(path).unwrap();
    let mut contents = String::new();
    file.read_to_string(&mut contents).unwrap();
    let test_case = parse_test_case(&contents);
    test(
        test_case.setup,
        test_case.query,
        test_case.row_count,
        &test_case.params,
        &test_case.columns,
    )
    .await;
}

fn parse_test_case(input: &str) -> TestCase {
    let (_, result) = test_case(input).finish().unwrap();
    result
}

fn test_case(input: &str) -> IResult<&str, TestCase> {
    all_consuming(map(
        tuple((
            initial,
            opt(section("setup", section_content)),
            section("query", section_content),
            section("expected row count", row_count),
            section("expected params", unnamed_fields),
            section("expected columns", named_fields),
        )),
        |(_, setup, query, row_count, params, columns)| TestCase {
            setup,
            query,
            row_count,
            params,
            columns,
        },
    ))(input)
}

fn initial(input: &str) -> IResult<&str, ()> {
    value(
        (),
        many_till(
            anychar,
            peek(alt((section_heading("setup"), section_heading("query")))),
        ),
    )(input)
}

fn section<'a, O, F>(
    section_name: &'static str,
    content: F,
) -> impl FnMut(&'a str) -> IResult<&'a str, O>
where
    F: Parser<&'a str, O, error::Error<&'a str>> + Copy,
{
    move |input: &'a str| {
        delimited(section_heading(section_name), content, many0_count(newline))(input)
    }
}

fn section_heading(section_name: &'static str) -> impl FnMut(&str) -> IResult<&str, ()> {
    move |input: &str| {
        value(
            (),
            tuple((
                tag("--- "),
                tag(section_name),
                tag(" ---"),
                many1_count(char('-')),
                many1_count(newline),
            )),
        )(input)
    }
}

fn section_content(input: &str) -> IResult<&str, &str> {
    alt((recognize(tuple((take_until("\n--- "), newline))), rest))(input)
}

fn row_count(input: &str) -> IResult<&str, StatementRowCount> {
    terminated(
        alt((
            map(tag("zero or one"), |_| StatementRowCount::ZeroOrOne),
            map(tag("zero"), |_| StatementRowCount::Zero),
            map(tag("one"), |_| StatementRowCount::One),
            map(tag("many"), |_| StatementRowCount::Many),
        )),
        newline,
    )(input)
}

fn unnamed_fields(input: &str) -> IResult<&str, Vec<UnnamedValue>> {
    many0(unnamed_field)(input)
}

fn unnamed_field(input: &str) -> IResult<&str, UnnamedValue> {
    map(
        tuple((value_type, opt(char('?')), newline)),
        |(type_, nullable, _)| UnnamedValue {
            type_,
            nullable: nullable.is_some(),
        },
    )(input)
}

fn named_fields(input: &str) -> IResult<&str, Vec<NamedValue>> {
    many0(named_field)(input)
}

fn named_field(input: &str) -> IResult<&str, NamedValue> {
    map(
        tuple((field_name, unnamed_field)),
        |(name, unnamed_field)| NamedValue {
            name: name.to_string(),
            type_: unnamed_field.type_,
            nullable: unnamed_field.nullable,
        },
    )(input)
}

fn field_name(input: &str) -> IResult<&str, &str> {
    terminated(
        recognize(many1_count(alt((alphanumeric1, value("_", char('_')))))),
        tuple((char(':'), space1)),
    )(input)
}

fn value_type(input: &str) -> IResult<&str, ValueType> {
    alt((
        map(
            tuple((char('['), primitive_type, opt(char('?')), char(']'))),
            |(_, type_, nullable, _)| ValueType::Array {
                type_,
                elem_nullable: nullable.is_some(),
            },
        ),
        map(primitive_type, ValueType::Any),
    ))(input)
}

fn primitive_type(input: &str) -> IResult<&str, Type> {
    alt((
        value(Type::BIT, tag("bit")),
        value(Type::BOOL, tag("bool")),
        value(Type::FLOAT4, tag("float4")),
        value(Type::FLOAT8, tag("float8")),
        value(Type::INT4, tag("int4")),
        value(Type::INT8, tag("int8")),
        value(Type::INTERVAL, tag("interval")),
        value(Type::TEXT, tag("text")),
        value(Type::TIMESTAMPTZ, tag("timestamptz")),
        value(Type::TIME, tag("time")),
        value(Type::VARCHAR, tag("varchar")),
    ))(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_test_case_minimal() {
        let case = parse_test_case(
            "--- query ---------

jee jee query jee

--- expected row count ------

zero or one

--- expected params ---------

--- expected columns --------
",
        );
        assert_eq!(case.setup, None);
        assert_eq!(case.query, "jee jee query jee\n\n");
        assert_eq!(case.row_count, StatementRowCount::ZeroOrOne);
        assert_eq!(case.params, Vec::new());
        assert_eq!(case.columns, Vec::new());
    }

    #[test]
    fn test_parse_test_case_maximal() {
        let case = parse_test_case(
            "
--- initial stuff
--- is ignored
--- setup ---------

arst foo
bar baz

--- query ---------

jee jee query jee

--- expected row count ------

zero or one

--- expected params ---------

int4
bool

--- expected columns --------

foo: [int4?]?
bar: bool
",
        );
        assert_eq!(case.setup.unwrap(), "arst foo\nbar baz\n\n");
        assert_eq!(case.query, "jee jee query jee\n\n");
        assert_eq!(case.row_count, StatementRowCount::ZeroOrOne);
        assert_eq!(
            case.params,
            vec![
                UnnamedValue {
                    type_: ValueType::Any(Type::INT4),
                    nullable: false
                },
                UnnamedValue {
                    type_: ValueType::Any(Type::BOOL),
                    nullable: false
                }
            ]
        );
        assert_eq!(
            case.columns,
            vec![
                NamedValue {
                    name: "foo".to_string(),
                    type_: ValueType::Array {
                        type_: Type::INT4,
                        elem_nullable: true
                    },
                    nullable: true
                },
                NamedValue {
                    name: "bar".to_string(),
                    type_: ValueType::Any(Type::BOOL),
                    nullable: false
                }
            ]
        );
    }
}
