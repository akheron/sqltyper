mod ast;
mod infer;
mod parser;
mod preprocess;
pub mod types;

use std::fmt;
use tokio_postgres::{Client, GenericClient, NoTls};

use crate::parser::parse_sql;
use crate::preprocess::{preprocess_sql, PreprocessedSql};
use crate::types::{NamedValue, StatementDescription, StatementRowCount};
use infer::infer_statement_nullability;

#[derive(Debug)]
pub enum Error {
    Preprocess(preprocess::Error),
    Parse(String),
    Postgres(tokio_postgres::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Preprocess(_) => write!(f, "Preprocess error"),
            Error::Parse(err) => write!(f, "Parse error: {}", err),
            Error::Postgres(err) => write!(f, "Postgres error: {}", err),
        }
    }
}

impl From<preprocess::Error> for Error {
    fn from(err: preprocess::Error) -> Self {
        Error::Preprocess(err)
    }
}

impl From<tokio_postgres::Error> for Error {
    fn from(err: tokio_postgres::Error) -> Self {
        Error::Postgres(err)
    }
}

impl From<nom_supreme::error::ErrorTree<&str>> for Error {
    fn from(err: nom_supreme::error::ErrorTree<&str>) -> Self {
        Error::Parse(format!("{}", err))
    }
}

pub async fn sql_to_statement_description<'a, C>(
    client: &C,
    sql: &'a str,
) -> Result<StatementDescription<'a>, Error>
where
    C: GenericClient,
{
    let preprocessed = preprocess_sql(&sql)?;
    let statement = parse_sql(&preprocessed.sql)?;
    println!("{:?}", statement);
    let statement = client.prepare(&preprocessed.sql).await?;
    // infer_statement_nullability(client, &preprocessed.sql);

    Ok(StatementDescription {
        sql: preprocessed.sql,
        params: statement
            .params()
            .iter()
            .zip(preprocessed.param_names.iter())
            .map(|(param, name)| NamedValue::from_type(name, &param))
            .collect(),
        columns: statement
            .columns()
            .iter()
            .map(|col| NamedValue::from_column(&col))
            .collect(),
        row_count: StatementRowCount::Many,
    })
}

pub async fn connect_to_database() -> Result<Client, tokio_postgres::Error> {
    let (client, connection) =
        tokio_postgres::connect("host=localhost user=postgres", NoTls).await?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    Ok(client)
}
