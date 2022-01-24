mod ast;
mod infer;
mod parser;
mod preprocess;
pub mod types;

use std::fmt;
use tokio_postgres::{Client, GenericClient, NoTls};

use crate::preprocess::{preprocess_sql, PreprocessedSql};
use crate::types::{NamedValue, StatementDescription, StatementRowCount, Warn};
use infer::infer_statement_nullability;

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

pub async fn describe_statement<'a, C: GenericClient>(
    client: &C,
    preprocessed: PreprocessedSql<'a>,
) -> Result<StatementDescription<'a>, Error> {
    let statement = client.prepare(&preprocessed.sql).await?;

    Ok(StatementDescription {
        sql: preprocessed.sql,
        params: statement
            .params()
            .iter()
            .zip(preprocessed.param_names.iter())
            .map(|(param, name)| {
                NamedValue::new(
                    name,
                    param.clone(),
                    false, // params are non-nullable by default
                )
            })
            .collect(),
        columns: statement
            .columns()
            .iter()
            .map(|col| NamedValue::from_column(col))
            .collect(),
        row_count: StatementRowCount::Many,
    })
}

pub async fn sql_to_statement_description<'a, C>(
    client: &C,
    sql: &'a str,
) -> Result<Warn<StatementDescription<'a>>, Error>
where
    C: GenericClient,
{
    let preprocessed = preprocess_sql(sql)?;
    let statement_description = describe_statement(client, preprocessed).await?;
    Ok(infer_statement_nullability(client, statement_description).await)
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
