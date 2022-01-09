use crate::ast;
use crate::infer::error::Error;
use tokio_postgres::types::Oid;
use tokio_postgres::GenericClient;

#[derive(Debug, PartialEq)]
pub struct Column {
    pub hidden: bool,
    pub name: String,
    pub nullable: bool,
    pub type_: Oid,
}

pub async fn get_table_columns<C: GenericClient>(
    client: &C,
    table: &ast::TableRef<'_>,
) -> Result<Vec<Column>, Error> {
    let rows = client
        .query(
            "\
SELECT attnum, attname, atttypid, attnotnull, attisdropped
FROM pg_catalog.pg_attribute attr
JOIN pg_catalog.pg_class cls on attr.attrelid = cls.oid
JOIN pg_catalog.pg_namespace nsp ON nsp.oid = cls.relnamespace
WHERE
cls.relkind = 'r'
AND nsp.nspname = $1
AND cls.relname = $2
ORDER BY attnum",
            &[&table.schema.unwrap_or("public"), &table.table],
        )
        .await?;

    if rows.is_empty() {
        return Err(Error::TableNotFound(format!("{}", table)));
    }

    let mut result: Vec<Column> = Vec::new();
    for row in rows {
        let dropped: bool = row.get("attisdropped");
        if dropped {
            continue;
        }

        let attnum: i16 = row.get("attnum");
        let attname: String = row.get("attname");
        let attnotnull: bool = row.get("attnotnull");
        let atttypid: Oid = row.get("atttypid");
        result.push(Column {
            hidden: attnum < 0,
            name: attname,
            nullable: !attnotnull,
            type_: atttypid,
        })
    }
    Ok(result)
}
