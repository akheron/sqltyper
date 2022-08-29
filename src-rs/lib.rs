mod ast;
mod infer;
mod parser;
mod preprocess;
pub mod types;
mod utils;

use serde::Serialize;
use tokio_postgres::{Client, NoTls};

pub use crate::infer::SchemaClient;
use crate::preprocess::{preprocess_sql, PreprocessedSql};
pub use crate::types::{AnalyzeStatus, Field, RowCount, StatementDescription, Type};
use infer::analyze_statement;

#[derive(Debug, Serialize)]
#[serde(tag = "variant", rename_all = "snake_case")]
pub enum Error {
    Preprocess {
        error: preprocess::Error,
    },
    SqlStatement {
        message: String,
        detail: Option<String>,
        hint: Option<String>,
    },
    Postgres {
        error: String,
    },
}

impl From<preprocess::Error> for Error {
    fn from(error: preprocess::Error) -> Self {
        Error::Preprocess { error }
    }
}

impl From<tokio_postgres::Error> for Error {
    fn from(error: tokio_postgres::Error) -> Self {
        if let Some(db_error) = error.as_db_error() {
            Error::SqlStatement {
                message: db_error.message().to_string(),
                detail: db_error.detail().map(|s| s.to_string()),
                hint: db_error.hint().map(|s| s.to_string()),
            }
        } else {
            Error::Postgres {
                error: error.to_string(),
            }
        }
    }
}

async fn describe_statement(
    client: &SchemaClient<'_>,
    preprocessed: PreprocessedSql,
) -> Result<StatementDescription, Error> {
    let statement = client.pg_client.prepare(&preprocessed.sql).await?;

    Ok(StatementDescription {
        sql: preprocessed.sql,
        params: statement
            .params()
            .iter()
            .map(|param| {
                // params are non-nullable by default
                Type::from_pg(param, false)
            })
            .collect(),
        columns: statement
            .columns()
            .iter()
            .map(Field::from_pg_column)
            .collect(),
        row_count: RowCount::Many,
        analyze_status: AnalyzeStatus::NotAnalyzed,
    })
}

pub async fn analyze(
    client: &SchemaClient<'_>,
    sql: String,
) -> Result<StatementDescription, Error> {
    let preprocessed = preprocess_sql(sql)?;
    let statement_description = describe_statement(client, preprocessed).await?;
    Ok(analyze_statement(client, statement_description).await)
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
