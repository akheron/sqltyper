use sqltyper::connect_to_database;
use sqltyper::sql_to_statement_description;
use std::{env, fs};
use tokio_postgres::Error;

#[tokio::main]
async fn main() -> Result<(), Error> {
    let filename = env::args().nth(1).unwrap();
    let sql = fs::read_to_string(filename).unwrap();

    let client = connect_to_database().await?;
    let statement = sql_to_statement_description(&client, &sql).await?;

    println!("{:?}", statement);

    Ok(())
}
