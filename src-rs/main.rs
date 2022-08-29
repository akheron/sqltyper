use clap::Parser;
use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use futures::future::join_all;
use serde::Serialize;
use sqltyper::types::StatementDescription;
use sqltyper::SchemaClient;
use std::fs;
use std::str::FromStr;
use std::sync::Arc;
use tokio_postgres::NoTls;

#[derive(Parser)]
#[clap(author, version, about, long_about = None)]
struct Cli {
    files: Vec<String>,

    #[clap(short, long, env)]
    database: String,

    #[clap(short, long, default_value = "10")]
    pool_size: usize,
}

fn make_connection_pool(cli: &Cli) -> Result<Pool, tokio_postgres::Error> {
    let cfg = tokio_postgres::Config::from_str(&cli.database)?;
    let mgr = Manager::from_config(
        cfg,
        NoTls,
        ManagerConfig {
            recycling_method: RecyclingMethod::Fast,
        },
    );
    Ok(Pool::builder(mgr).max_size(cli.pool_size).build().unwrap())
}

#[derive(Serialize)]
struct FileOutput {
    path: String,
    output: Result<StatementDescription, sqltyper::Error>,
}

async fn run(cli: Cli) -> Result<Vec<FileOutput>, deadpool_postgres::PoolError> {
    let pool = make_connection_pool(&cli)?;

    // Make sure we can connect to Postgres with the given config
    drop(pool.get().await?);

    let schema_client = Arc::new(SchemaClient::from_pool(pool).await?);

    let mut tasks = Vec::new();
    for filename in &cli.files {
        let sql = fs::read_to_string(filename).unwrap();
        let schema_client = schema_client.clone();
        tasks.push(tokio::spawn(async move {
            sqltyper::analyze(&schema_client, sql).await
        }));
    }

    let results: Vec<FileOutput> = join_all(tasks)
        .await
        .into_iter()
        .zip(cli.files.into_iter())
        .map(|(task_result, path)| FileOutput {
            path,
            output: task_result.unwrap(),
        })
        .collect();

    Ok(results)
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    if cli.files.is_empty() {
        println!("No input files");
        std::process::exit(1);
    }

    match run(cli).await {
        Err(err) => {
            eprintln!("{}", err);
            std::process::exit(1);
        }
        Ok(results) => {
            println!("{}", serde_json::to_string(&results).unwrap());
        }
    };
}

#[cfg(test)]
mod tests {
    use super::Cli;
    use clap::CommandFactory;

    #[test]
    fn verify_app() {
        Cli::command().debug_assert()
    }
}
