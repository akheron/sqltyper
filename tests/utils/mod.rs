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

use sqltyper::types::{AnalyzeStatus, Field, Kind, RowCount, StatementDescription, Type};
use sqltyper::{connect_to_database, sql_to_statement_description};

pub async fn test(
    init_sql: Option<&str>,
    sql: &str,
    row_count: RowCount,
    params: &[Type],
    columns: &[Field],
) {
    let statement = get_statement(init_sql, sql).await;
    assert_statement(statement, row_count, params, columns);
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
    statement: StatementDescription,
    expected_row_count: RowCount,
    expected_params: &[Type],
    expected_columns: &[Field],
) {
    assert!(
        matches!(statement.analyze_status, AnalyzeStatus::Success),
        "Analyze error"
    );
    assert_eq!(statement.row_count, expected_row_count, "Row count");
    assert_eq!(statement.params, expected_params, "Params");
    assert_eq!(statement.columns, expected_columns, "Columns");
}

#[derive(Debug)]
pub struct TestCase<'a> {
    setup: Option<&'a str>,
    query: &'a str,
    row_count: RowCount,
    params: Vec<Type>,
    columns: Vec<Field>,
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
            section("expected params", params),
            section("expected columns", fields),
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

fn row_count(input: &str) -> IResult<&str, RowCount> {
    terminated(
        alt((
            map(tag("zero or one"), |_| RowCount::ZeroOrOne),
            map(tag("zero"), |_| RowCount::Zero),
            map(tag("one"), |_| RowCount::One),
            map(tag("many"), |_| RowCount::Many),
        )),
        newline,
    )(input)
}

fn params(input: &str) -> IResult<&str, Vec<Type>> {
    many0(param)(input)
}

fn param(input: &str) -> IResult<&str, Type> {
    terminated(type_, newline)(input)
}

fn fields(input: &str) -> IResult<&str, Vec<Field>> {
    many0(field)(input)
}

fn field(input: &str) -> IResult<&str, Field> {
    map(tuple((field_name, type_, newline)), |(name, type_, _)| {
        Field {
            name: name.to_string(),
            type_,
        }
    })(input)
}

fn field_name(input: &str) -> IResult<&str, &str> {
    terminated(
        recognize(many1_count(alt((alphanumeric1, value("_", char('_')))))),
        tuple((char(':'), space1)),
    )(input)
}

type PostgresType = tokio_postgres::types::Type;

fn type_(input: &str) -> IResult<&str, Type> {
    alt((array_type, simple_type))(input)
}

fn array_type(input: &str) -> IResult<&str, Type> {
    map(
        tuple((char('['), tag("int4"), nullable, char(']'), nullable)),
        |(_, _, elem_nullable, _, nullable)| {
            type_from_postgres_array(&PostgresType::INT4_ARRAY, nullable, elem_nullable).unwrap()
        },
    )(input)
}

fn simple_type(input: &str) -> IResult<&str, Type> {
    map(tuple((postgres_type, nullable)), |(type_, nullable)| {
        Type::from_pg(&type_, nullable)
    })(input)
}

fn postgres_type(input: &str) -> IResult<&str, PostgresType> {
    alt((
        value(PostgresType::BIT, tag("bit")),
        value(PostgresType::BOOL, tag("bool")),
        value(PostgresType::FLOAT4, tag("float4")),
        value(PostgresType::FLOAT8, tag("float8")),
        value(PostgresType::INT4, tag("int4")),
        value(PostgresType::INT8, tag("int8")),
        value(PostgresType::INTERVAL, tag("interval")),
        value(PostgresType::TEXT, tag("text")),
        value(PostgresType::TIMESTAMPTZ, tag("timestamptz")),
        value(PostgresType::TIME, tag("time")),
        value(PostgresType::VARCHAR, tag("varchar")),
    ))(input)
}

fn nullable(input: &str) -> IResult<&str, bool> {
    map(opt(char('?')), |c| c.is_some())(input)
}

fn type_from_postgres_array(
    type_: &PostgresType,
    nullable: bool,
    elem_nullable: bool,
) -> Option<Type> {
    let mut result = Type::from_pg(type_, nullable);
    if let Kind::Array { element_type: elem } = result.kind.as_mut() {
        elem.nullable = elem_nullable;
        Some(result)
    } else {
        None
    }
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
        assert_eq!(case.row_count, RowCount::ZeroOrOne);
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
bool?

--- expected columns --------

foo: [int4?]?
bar: bool
",
        );
        assert_eq!(case.setup.unwrap(), "arst foo\nbar baz\n\n");
        assert_eq!(case.query, "jee jee query jee\n\n");
        assert_eq!(case.row_count, RowCount::ZeroOrOne);
        assert_eq!(
            case.params,
            vec![
                Type::from_pg(&PostgresType::INT4, false),
                Type::from_pg(&PostgresType::BOOL, true),
            ]
        );
        assert_eq!(
            case.columns,
            vec![
                Field {
                    name: "foo".to_string(),
                    type_: type_from_postgres_array(&PostgresType::INT4_ARRAY, true, true).unwrap(),
                },
                Field {
                    name: "bar".to_string(),
                    type_: Type::from_pg(&PostgresType::BOOL, false),
                }
            ]
        );
    }
}
