use crate::ast;
use crate::infer::error::Error;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::watch::{channel, Receiver, Sender};
use tokio_postgres::types::{Json, Oid};
use tokio_postgres::Transaction;

#[derive(Debug)]
enum Message {
    Initial,
    Done(Arc<Vec<DatabaseTable>>),
    Error(Error),
}

impl Message {
    fn to_result(&self) -> Result<Arc<Vec<DatabaseTable>>, Error> {
        match self {
            Message::Initial => panic!("Unexpected Initial state"),
            Message::Done(value) => Ok(value.clone()),
            Message::Error(error) => Err(error.clone()),
        }
    }
}

enum CacheSlot<T> {
    Pending(Receiver<Message>),
    Done(Arc<T>),
}

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

pub struct SchemaClient<'a> {
    tx: &'a Transaction<'a>,
    schema_search_order: Vec<String>,

    /// The key is a table name without schema, value is a Vec of all tables with
    /// that name. If the Vec is empty, no table with this name exists in any schema.
    cache: Mutex<HashMap<String, CacheSlot<Vec<DatabaseTable>>>>,
}

impl<'a> SchemaClient<'a> {
    pub async fn new(tx: &'a Transaction<'a>) -> Result<SchemaClient<'a>, Error> {
        let schema_search_order = get_schema_search_order(tx).await?;

        Ok(SchemaClient {
            tx,
            schema_search_order,
            cache: Mutex::new(HashMap::new()),
        })
    }

    pub async fn get_table_columns(
        &self,
        table_ref: &ast::TableRef<'_>,
    ) -> Result<Arc<Vec<DatabaseColumn>>, Error> {
        let schema_name_opt = table_ref.schema;
        let table_name = table_ref.table;

        enum Status {
            Fetch(Sender<Message>),
            Pending(Receiver<Message>),
            Done(Arc<Vec<DatabaseTable>>),
        }

        let status = {
            let mut data = self.cache.lock().unwrap();
            if let Some(value) = data.get(table_name) {
                match value {
                    CacheSlot::Pending(receiver) => Status::Pending(receiver.clone()),
                    CacheSlot::Done(value) => Status::Done(value.clone()),
                }
            } else {
                let (tx, rx) = channel(Message::Initial);
                data.insert(table_name.into(), CacheSlot::Pending(rx));
                Status::Fetch(tx)
            }
        };

        match status {
            Status::Fetch(notify) => match self.get_tables_with_name(table_name).await {
                Ok(tables) => {
                    let tables = Arc::new(tables);

                    // The receiver is stored in the cache slot before being replaced here by the
                    // actual value. Keep the receiver around so that the channel is still open
                    // when send() is called below, even if there are no listeners.
                    let _receiver = {
                        let mut data = self.cache.lock().unwrap();
                        data.insert(table_name.into(), CacheSlot::Done(tables.clone()))
                    };

                    notify.send(Message::Done(tables.clone())).unwrap();
                    self.find_table(schema_name_opt, table_name, &tables)
                }
                Err(error) => {
                    notify.send(Message::Error(error.clone())).unwrap();
                    Err(error)
                }
            },
            Status::Pending(mut receiver) => {
                receiver.changed().await.unwrap();
                let tables = receiver.borrow().to_result()?;
                self.find_table(schema_name_opt, table_name, &tables)
            }
            Status::Done(tables) => self.find_table(schema_name_opt, table_name, &tables),
        }
    }

    async fn get_tables_with_name(&self, table: &str) -> Result<Vec<DatabaseTable>, Error> {
        Ok(self.tx
            .query(
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
                &[&self.schema_search_order, &table],
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
        } else if tables.len() == 0 {
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

async fn get_schema_search_order(tx: &Transaction<'_>) -> Result<Vec<String>, Error> {
    Ok(tx
        .query_one("SELECT current_schemas(true)", &[])
        .await?
        .get(0))
}
