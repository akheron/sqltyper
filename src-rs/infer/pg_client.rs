use postgres_types::ToSql;
use std::sync::Arc;
use tokio_postgres::{Row, Statement, ToStatement};

#[derive(Clone)]
pub enum PGClient<'a> {
    Pool(deadpool_postgres::Pool),
    Tx(Arc<tokio_postgres::Transaction<'a>>),
}

impl<'a> PGClient<'a> {
    pub async fn query<T: ?Sized + ToStatement>(
        &self,
        statement: &T,
        params: &[&(dyn ToSql + Sync)],
    ) -> Result<Vec<Row>, tokio_postgres::Error> {
        match self {
            PGClient::Pool(pool) => pool.get().await.unwrap().query(statement, params).await,
            PGClient::Tx(tx) => tx.query(statement, params).await,
        }
    }

    pub async fn query_one<T: ?Sized + ToStatement>(
        &self,
        statement: &T,
        params: &[&(dyn ToSql + Sync)],
    ) -> Result<Row, tokio_postgres::Error> {
        match self {
            PGClient::Pool(pool) => pool.get().await.unwrap().query_one(statement, params).await,
            PGClient::Tx(tx) => tx.query_one(statement, params).await,
        }
    }

    pub async fn prepare(&self, statement: &str) -> Result<Statement, tokio_postgres::Error> {
        match self {
            PGClient::Pool(pool) => pool.get().await.unwrap().prepare(statement).await,
            PGClient::Tx(tx) => tx.prepare(statement).await,
        }
    }
}
