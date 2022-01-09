use sqltyper::types::StatementRowCount;
use tokio_postgres::types::Type;

#[tokio::test]
async fn test_insert() {
    utils::sql_test(
        "CREATE TABLE person (id SERIAL NOT NULL, name TEXT NOT NULL, age INT)",
        "INSERT INTO person (name, age) VALUES (${name}, ${age})",
        StatementRowCount::Many, // TODO: Row count is not inferred correctly yet
        &[("name", Type::TEXT, false), ("age", Type::INT4, true)],
        &[],
    )
    .await;
}

mod utils {
    use sqltyper::types::{NamedValue, StatementDescription, StatementRowCount};
    use sqltyper::{connect_to_database, sql_to_statement_description};
    use tokio_postgres::types::Type;

    type NamedValueTuple<'a> = (&'a str, Type, bool);

    fn named_value_tuple(value: &NamedValue) -> NamedValueTuple {
        (value.name.as_ref(), value.type_.clone(), value.nullable)
    }

    fn assert_statement(
        statement: &StatementDescription,
        row_count: StatementRowCount,
        params: &[NamedValueTuple],
        columns: &[NamedValueTuple],
    ) {
        assert_eq!(statement.row_count, row_count, "Row count");
        assert_eq!(
            statement
                .params
                .iter()
                .map(named_value_tuple)
                .collect::<Vec<(&str, Type, bool)>>(),
            params,
            "Params"
        );
        assert_eq!(
            statement
                .columns
                .iter()
                .map(named_value_tuple)
                .collect::<Vec<(&str, Type, bool)>>(),
            columns,
            "Columns"
        );
    }

    async fn connect() -> Result<tokio_postgres::Client, tokio_postgres::Error> {
        let config = std::env::var("DATABASE");
        if let Err(std::env::VarError::NotPresent) = config {
            panic!("Environment variable DATABASE not set");
        }
        connect_to_database(&config.unwrap()).await
    }

    async fn get_statement<'a>(
        init_sql: &str,
        sql: &'a str,
    ) -> Result<StatementDescription<'a>, Box<dyn std::error::Error>> {
        let mut client = connect().await?;
        let tx = client.transaction().await?;
        if !init_sql.is_empty() {
            tx.execute(init_sql, &[]).await?;
        }
        let statement = sql_to_statement_description(&tx, sql).await?.payload;
        tx.rollback().await?;
        Ok(statement)
    }

    pub async fn sql_test(
        init_sql: &str,
        sql: &str,
        row_count: StatementRowCount,
        params: &[NamedValueTuple<'_>],
        columns: &[NamedValueTuple<'_>],
    ) {
        let statement = get_statement(init_sql, sql).await.unwrap();
        assert_statement(&statement, row_count, params, columns);
    }
}
