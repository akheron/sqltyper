mod infer;
mod parser;
mod preprocess;
pub mod types;

use crate::preprocess::preprocess_sql;
use crate::types::{NamedValue, StatementDescription, StatementRowCount};
use infer::infer_statement_nullability;
use tokio_postgres::{Client, Error, GenericClient, NoTls};

pub async fn sql_to_statement_description<C>(
    client: &C,
    sql: &str,
) -> Result<StatementDescription, Error>
where
    C: GenericClient,
{
    let preprocessed = preprocess_sql(&sql).unwrap();
    let statement = client.prepare(&preprocessed.sql).await?;
    infer_statement_nullability(client, &preprocessed.sql);

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

pub async fn connect_to_database() -> Result<Client, Error> {
    let (client, connection) =
        tokio_postgres::connect("host=localhost user=postgres", NoTls).await?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    Ok(client)
}
