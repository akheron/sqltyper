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
    ).await;
}

#[tokio::test]
async fn test_select_basic() {
    test(
        &["CREATE TABLE person (id int, age int, flag bool)"],
        &[
            "SELECT 1",
            "SELECT * FROM person",
            "SELECT p.* FROM person AS p",
            "SELECT id FROM person",
            "SELECT id, age - 5, flag FROM person",
            "SELECT id FROM person WHERE true",
            "SELECT id, age + 5 FROM person GROUP BY id, age + 5",
            "SELECT id FROM person GROUP BY id HAVING true",
            "SELECT * FROM person ORDER BY id DESC, age USING < NULLS LAST, flag ASC",
            "SELECT * FROM person LIMIT ALL",
            "SELECT * FROM person LIMIT $1 OFFSET $2 * 10",
        ],
    )
    .await;
}

#[tokio::test]
async fn test_select_distinct() {
    test(
        &["CREATE TABLE person (id int, age int, flag bool)"],
        &[
            "SELECT ALL age FROM person",
            "SELECT DISTINCT age FROM person",
            "SELECT DISTINCT ON (age, flag) id FROM person",
            "SELECT DISTINCT ON (age / 5) id FROM person",
        ],
    )
    .await;
}

#[tokio::test]
async fn test_select_from() {
    test(
        &[
            "CREATE TABLE person (id int, age int, flag bool)",
            "CREATE TABLE book (id int, title text)",
            "CREATE TABLE food (id int, name text)",
        ],
        &[
            "SELECT * FROM public.person",
            "SELECT * FROM person p",
            "SELECT * FROM person, book",
            "SELECT * FROM person CROSS JOIN book",
            "SELECT * FROM person CROSS JOIN book CROSS JOIN food",
            "SELECT * FROM person JOIN book USING (id)",
            "SELECT * FROM person INNER JOIN book USING (id)",
            "SELECT * FROM person LEFT JOIN book USING (id)",
            "SELECT * FROM person LEFT OUTER JOIN book USING (id)",
            "SELECT * FROM person RIGHT JOIN book USING (id)",
            "SELECT * FROM person FULL JOIN book USING (id)",
            "SELECT * FROM person JOIN book ON true JOIN food ON false",
            "SELECT * FROM person NATURAL JOIN book",
            "SELECT * FROM person NATURAL LEFT OUTER JOIN book",
        ],
    )
    .await;
}

#[tokio::test]
async fn select_window() {
    test(
        &["CREATE TABLE person (id int, age int, flag bool)"],
        &[
            "SELECT * FROM person WINDOW w1 AS (PARTITION BY id, age)",
            "SELECT * FROM person WINDOW w1 AS (ORDER BY id DESC, age USING < NULLS FIRST)",
            "SELECT * FROM person WINDOW w1 AS (PARTITION BY id), w2 AS (w1 ORDER BY id)",
        ],
    )
    .await;
}

#[tokio::test]
async fn select_set_ops() {
    test(
        &["CREATE TABLE person (id int, age int, flag bool)"],
        &[
            "SELECT id FROM person UNION ALL SELECT age FROM person",
            "SELECT id FROM person INTERSECT DISTINCT SELECT age FROM person",
            "SELECT id FROM person EXCEPT SELECT age FROM person",
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
