use utils::test;

#[tokio::test]
async fn test_insert() {
    test(
        &["CREATE TABLE person (id int, age int, flag bool, CONSTRAINT unique_id UNIQUE (id))"],
        &[
            "INSERT INTO person DEFAULT VALUES",
            "INSERT INTO person (id, age) VALUES (1, 2), (3, 4)",
            "INSERT INTO person AS p VALUES (1, 2) ON CONFLICT DO NOTHING",
            "INSERT INTO person VALUES (1, 2) ON CONFLICT ON CONSTRAINT unique_id DO NOTHING",
            "INSERT INTO person VALUES (1, 2) ON CONFLICT DO NOTHING",
            "INSERT INTO person VALUES (1, 2) ON CONFLICT (id) DO UPDATE SET age = 1, flag = true",
            "INSERT INTO person VALUES (1, 2) ON CONFLICT ON CONSTRAINT unique_id DO UPDATE SET age = 1, flag = true",
            "INSERT INTO person VALUES (1, 2) RETURNING *",
            "INSERT INTO person VALUES (1, 2) RETURNING id AS a, age - 1 b, flag",
            "INSERT INTO person VALUES (1) ON CONFLICT DO NOTHING RETURNING *",
        ],
    )
    .await;
}

mod utils {
    use crate::connect_to_database;
    use crate::parser::parse_sql;
    use tokio_postgres::{Client, Transaction};

    pub async fn test(init_sqls: &[&str], tests: &[&str]) {
        let mut client = connect().await.unwrap();
        let tx = init(&mut client, init_sqls).await.unwrap();
        for test in tests {
            assert_prepare(&tx, test).await;
            assert_parse(test);
        }
        tx.rollback().await.unwrap();
    }

    async fn init<'a>(
        client: &'a mut Client,
        init_sqls: &[&str],
    ) -> Result<Transaction<'a>, Box<dyn std::error::Error>> {
        let tx = client.transaction().await?;
        for init_sql in init_sqls {
            tx.execute(*init_sql, &[]).await?;
        }
        Ok(tx)
    }

    async fn connect() -> Result<tokio_postgres::Client, tokio_postgres::Error> {
        let config = std::env::var("DATABASE");
        if let Err(std::env::VarError::NotPresent) = config {
            panic!("Environment variable DATABASE not set");
        }
        connect_to_database(&config.unwrap()).await
    }

    async fn assert_prepare(tx: &Transaction<'_>, input: &str) {
        if let Err(err) = tx.prepare(input).await {
            panic!("sql statement failed to prepare: {}\nerror: {}", input, err)
        }
    }

    fn assert_parse(input: &str) {
        if let Err(err) = parse_sql(input) {
            panic!(
                "sql statement failed to parse: {}\nparse error: {}",
                input, err
            );
        }
    }
}
