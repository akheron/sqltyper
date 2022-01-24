use sqltyper::{connect_to_database, sql_to_statement_description, Error};
use std::{env, fs};

async fn run() -> Result<(), Error> {
    let filename = env::args().nth(1).unwrap();
    let sql = fs::read_to_string(filename).unwrap();
    let db_config = std::env::var("DATABASE_URL").unwrap();

    let client = connect_to_database(&db_config).await?;
    let statement = sql_to_statement_description(&client, &sql).await?;

    println!("{:?}", statement.payload);
    if !statement.warnings.is_empty() {
        println!("Warnings: {:?}", statement.warnings);
    }

    Ok(())
}

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        println!("{}", err)
    };
}
