mod ast;
mod infer;
mod parser;
mod preprocess;
pub mod types;
mod utils;

use std::fmt;
use tokio_postgres::{Client, GenericClient, NoTls};

use crate::preprocess::{preprocess_sql, PreprocessedSql};
use crate::types::{Field, RowCount, StatementDescription, Type};
use infer::analyze_statement;

#[derive(Debug)]
pub enum Error {
    Preprocess(preprocess::Error),
    Postgres(tokio_postgres::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Preprocess(err) => write!(f, "{}", err),
            Error::Postgres(err) => write!(f, "{}", err),
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

impl std::error::Error for Error {}

pub async fn describe_statement<'a, C: GenericClient + Sync>(
    client: &C,
    preprocessed: PreprocessedSql<'a>,
) -> Result<StatementDescription<'a>, Error> {
    let statement = client.prepare(&preprocessed.sql).await?;

    Ok(StatementDescription {
        sql: preprocessed.sql,
        params: statement
            .params()
            .iter()
            .map(|param| {
                // params are non-nullable by default
                Type::from_postgres(param, false)
            })
            .collect(),
        columns: statement
            .columns()
            .iter()
            .map(Field::from_postgres_column)
            .collect(),
        row_count: RowCount::Many,
        analyze_error: None,
    })
}

pub async fn sql_to_statement_description<'a, C: GenericClient + Sync>(
    client: &C,
    sql: &'a str,
) -> Result<StatementDescription<'a>, Error> {
    let preprocessed = preprocess_sql(sql)?;
    let mut statement_description = describe_statement(client, preprocessed).await?;
    match analyze_statement(client, &statement_description.sql).await {
        Ok(output) => output.update_statement(&mut statement_description),
        Err(err) => statement_description.analyze_error = Some(err),
    };
    Ok(statement_description)
}

pub async fn connect_to_database(config: &str) -> Result<Client, tokio_postgres::Error> {
    let (client, connection) = tokio_postgres::connect(config, NoTls).await?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("PostgreSQL connection error: {}", e);
        }
    });

    Ok(client)
}
