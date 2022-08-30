use clap::Parser;
use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use futures::future::join_all;
use sqltyper::types::StatementDescription;
use sqltyper::SchemaClient;
use std::collections::HashMap;
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

type Output = Result<HashMap<String, StatementDescription>, HashMap<String, sqltyper::Error>>;

async fn run(cli: Cli) -> Result<Output, deadpool_postgres::PoolError> {
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

    let results: Vec<(String, Result<StatementDescription, sqltyper::Error>)> = join_all(tasks)
        .await
        .into_iter()
        .zip(cli.files.into_iter())
        .map(|(task_result, path)| (path, task_result.unwrap()))
        .collect();

    let errors: HashMap<String, sqltyper::Error> = results
        .iter()
        .filter_map(|(path, result)| {
            if let Err(error) = result {
                Some((path.clone(), error.clone()))
            } else {
                None
            }
        })
        .collect();

    let successes: HashMap<String, StatementDescription> = results
        .into_iter()
        .filter_map(|(path, result)| {
            if let Ok(success) = result {
                Some((path, success))
            } else {
                None
            }
        })
        .collect();

    Ok(if errors.is_empty() {
        Ok(successes)
    } else {
        Err(errors)
    })
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
        Ok(results) => match results {
            Ok(successes) => println!("{}", serde_json::to_string(&successes).unwrap()),
            Err(errors) => {
                eprintln!("{}", serde_json::to_string(&errors).unwrap());
                std::process::exit(1);
            }
        },
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
