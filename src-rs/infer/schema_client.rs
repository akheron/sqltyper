use crate::ast;
use crate::infer::cache::{Cache, Status};
use crate::infer::error::Error;
use crate::infer::pg_client::PGClient;
use serde::Deserialize;
use std::sync::Arc;
use tokio_postgres::types::{Json, Oid};

#[derive(Debug)]
struct DatabaseTable {
    schema: String,
    columns: Arc<Vec<DatabaseColumn>>,
}

#[derive(Debug, Deserialize)]
pub struct DatabaseColumn {
    pub hidden: bool,
    pub name: String,
    pub nullable: bool,
    pub type_: Oid,
}

type SchemaCache = Cache<Vec<DatabaseTable>>;

#[derive(Clone)]
pub struct SchemaClient<'a> {
    pub pg_client: PGClient<'a>,
    schema_search_order: Arc<Vec<String>>,
    cache: Arc<SchemaCache>,
}

impl<'a> SchemaClient<'a> {
    async fn new(
        pg_client: PGClient<'a>,
    ) -> Result<SchemaClient<'a>, deadpool_postgres::PoolError> {
        let schema_search_order = get_schema_search_order(&pg_client).await?;

        let cache = SchemaCache::new();
        Ok(SchemaClient {
            pg_client,
            schema_search_order: Arc::new(schema_search_order),
            cache: Arc::new(cache),
        })
    }

    pub async fn from_pool(
        pool: deadpool_postgres::Pool,
    ) -> Result<SchemaClient<'a>, deadpool_postgres::PoolError> {
        Self::new(PGClient::Pool(pool)).await
    }

    pub async fn from_tx(
        tx: tokio_postgres::Transaction<'a>,
    ) -> Result<SchemaClient<'a>, deadpool_postgres::PoolError> {
        Self::new(PGClient::Tx(Arc::new(tx))).await
    }

    pub async fn get_table_columns(
        &self,
        table_ref: &ast::TableRef<'_>,
    ) -> Result<Arc<Vec<DatabaseColumn>>, Error> {
        let schema_name_opt = table_ref.schema;
        let table_name = table_ref.table;

        match self.cache.status(table_name) {
            Status::Fetch(notify) => match self.get_tables_with_name(table_name).await {
                Ok(tables) => {
                    let entry = self.cache.insert(notify, table_name, tables);
                    self.find_table(schema_name_opt, table_name, &entry)
                }
                Err(error) => {
                    self.cache.error(notify, error.clone());
                    Err(error)
                }
            },
            Status::Pending(receiver) => {
                let tables = self.cache.wait_for(receiver).await?;
                self.find_table(schema_name_opt, table_name, &tables)
            }
            Status::Done(tables) => self.find_table(schema_name_opt, table_name, &tables),
        }
    }

    async fn get_tables_with_name(&self, table: &str) -> Result<Vec<DatabaseTable>, Error> {
        Ok(self.pg_client.query(
                "\
SELECT schema, json_agg(json_build_object('hidden', hidden, 'name', name, 'nullable', nullable, 'type_', oid))
FROM (
  SELECT
      nspname AS schema,
      attnum < 0 AS hidden,
      attname AS name,
      NOT attnotnull AS nullable,
      atttypid::integer AS oid
  FROM pg_catalog.pg_attribute att
  JOIN pg_catalog.pg_class cls on cls.oid = att.attrelid
  JOIN pg_catalog.pg_namespace nsp ON nsp.oid = cls.relnamespace
  WHERE NOT attisdropped
  AND cls.relkind = 'r'
  AND nsp.nspname = ANY($1)
  AND cls.relname = $2
  ORDER BY nsp.nspname, attnum
) tables
GROUP BY schema;
",
                &[self.schema_search_order.as_ref(), &table],
            )
            .await?
            .iter().map(|row| {
                let schema: String = row.get(0);
                let columns: Json<Vec<DatabaseColumn>> = row.get(1);
                DatabaseTable {schema, columns: Arc::new(columns.0) }
            }).collect())
    }

    fn find_table(
        &self,
        schema_name_opt: Option<&str>,
        table_name: &str,
        tables: &[DatabaseTable],
    ) -> Result<Arc<Vec<DatabaseColumn>>, Error> {
        if let Some(schema_name) = schema_name_opt {
            match tables.iter().find(|table| table.schema == schema_name) {
                None => Err(Error::SchemaTableNotFound {
                    schema: schema_name.to_string(),
                    table: table_name.to_string(),
                }),
                Some(value) => Ok(value.columns.clone()),
            }
        } else if tables.len() == 1 {
            Ok(tables.get(0).unwrap().columns.clone())
        } else if tables.is_empty() {
            Err(Error::TableNotFound {
                table: table_name.to_string(),
            })
        } else {
            Err(Error::AmbiguousTable {
                table: table_name.to_string(),
            })
        }
    }
}

async fn get_schema_search_order(
    pg_client: &PGClient<'_>,
) -> Result<Vec<String>, tokio_postgres::Error> {
    Ok(pg_client
        .query_one("SELECT current_schemas(true)", &[])
        .await?
        .get(0))
}
