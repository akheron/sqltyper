use crate::ast;
use crate::infer::error::Error;
use serde::Deserialize;
use tokio_postgres::types::{Json, Oid};
use tokio_postgres::{GenericClient, Row};

#[derive(Debug, PartialEq)]
pub struct Column {
    pub hidden: bool,
    pub name: String,
    pub nullable: bool,
    pub type_: Oid,
}

pub async fn get_table_columns<C: GenericClient + Sync>(
    client: &C,
    table: &ast::TableRef<'_>,
) -> Result<Vec<Column>, Error> {
    let schema_search_order = match table.schema {
        None => get_schema_search_order(client).await?,
        Some(schema) => vec![schema.to_string()],
    };

    let rows = client
        .query(
            "\
SELECT schema, json_agg(json_build_object('num', num, 'name', name, 'type_id', type_id, 'not_null', not_null))
FROM (
  SELECT
      nspname AS schema,
      attnum AS num,
      attname AS name,
      atttypid::integer AS type_id,
      attnotnull AS not_null
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
            &[&schema_search_order, &table.table],
        )
        .await?;

    if let Some(columns) = find_table(&schema_search_order, &rows) {
        Ok(columns
            .into_iter()
            .map(|column| Column {
                hidden: column.num < 0,
                name: column.name,
                nullable: !column.not_null,
                type_: column.type_id,
            })
            .collect())
    } else {
        Err(Error::TableNotFound(format!("{}", table)))
    }
}

#[derive(Deserialize)]
struct ColumnInfo {
    num: i32,
    name: String,
    type_id: Oid,
    not_null: bool,
}

fn find_table(schema_search_order: &[String], rows: &[Row]) -> Option<Vec<ColumnInfo>> {
    for schema in schema_search_order {
        let row_opt = rows.iter().find(|row| {
            let row_schema: &str = row.get(0);
            schema == row_schema
        });
        if let Some(row) = row_opt {
            let result: Json<Vec<ColumnInfo>> = row.get(1);
            return Some(result.0);
        }
    }
    None
}

async fn get_schema_search_order<C: GenericClient + Sync>(
    client: &C,
) -> Result<Vec<String>, Error> {
    Ok(client
        .query_one("SELECT current_schemas(true)", &[])
        .await?
        .get(0))
}
