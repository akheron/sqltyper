use tokio_postgres::types::Type;

use sqltyper::types::StatementRowCount;

use self::utils::test;

#[tokio::test]
async fn test_select_cte() {
    test(
        "CREATE TEMPORARY TABLE person (id serial, name varchar(255) NOT NULL, age integer)",
        "WITH youngsters AS (SELECT * FROM person WHERE age < ${maximumAge}) SELECT * FROM youngsters",
        StatementRowCount::Many,
        &[("maximumAge", Type::INT4, false)],
        &[("id", Type::INT4, false), ("name", Type::VARCHAR, false), ("age", Type::INT4, false)
        ],
    ).await;
}

#[tokio::test]
async fn test_insert() {
    test(
        "CREATE TEMPORARY TABLE person (id SERIAL NOT NULL, name TEXT NOT NULL, age INT)",
        "INSERT INTO person (name, age) VALUES (${name}, ${age})",
        StatementRowCount::Zero,
        &[("name", Type::TEXT, false), ("age", Type::INT4, true)],
        &[],
    )
    .await;
}

#[tokio::test]
async fn test_update() {
    test(
        "CREATE TEMPORARY TABLE person (id serial PRIMARY KEY, constant integer, age integer, name varchar(255) NOT NULL, height_doubled integer)",
        "UPDATE person SET constant = 42, age = ${age}, name = ${name}, height_doubled = ${height} * 2 WHERE id = ${id}",
        StatementRowCount::Zero,
        &[("age", Type::INT4, true), ("name", Type::VARCHAR, false), ("height", Type::INT4, false), ("id", Type::INT4, false)],
        &[],
    ).await;
}

mod utils {
    use tokio_postgres::types::Type;

    use sqltyper::types::{NamedValue, StatementDescription, StatementRowCount, Warn, Warning};
    use sqltyper::{connect_to_database, sql_to_statement_description};

    type NamedValueTuple<'a> = (&'a str, Type, bool);

    fn named_value_tuple(value: &NamedValue) -> NamedValueTuple {
        (
            value.name.as_ref(),
            value.type_.as_ref().clone(),
            value.nullable,
        )
    }

    fn assert_statement(
        statement_with_warnings: &Warn<StatementDescription>,
        row_count: StatementRowCount,
        params: &[NamedValueTuple],
        columns: &[NamedValueTuple],
    ) {
        let statement = &statement_with_warnings.payload;
        let warnings = &statement_with_warnings.warnings;

        assert_eq!(*warnings, Vec::<Warning>::new());
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
    ) -> Result<Warn<StatementDescription<'a>>, Box<dyn std::error::Error>> {
        let client = connect().await?;
        if !init_sql.is_empty() {
            client.execute(init_sql, &[]).await?;
        }
        let result = sql_to_statement_description(&client, sql).await?;
        Ok(result)
    }

    pub async fn test(
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
