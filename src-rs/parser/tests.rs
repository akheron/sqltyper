use utils::test;

#[tokio::test]
async fn test_expression_subqueries() {
    test(
        &["CREATE TABLE person (age integer)"],
        &[
            "SELECT array(SELECT age FROM person)",
            "SELECT (SELECT age FROM PERSON)",
        ],
    )
    .await;
}

#[tokio::test]
async fn test_expression_case() {
    test(
        &[],
        &[
            "SELECT CASE WHEN true THEN 1 ELSE 0 END",
            "SELECT CASE WHEN true THEN 1 END",
        ],
    )
    .await;
}

#[tokio::test]
async fn test_expression_special_function_call() {
    test(
        &[],
        &[
            "SELECT overlay('Txxxxas' placing 'hom' from 2)",
            "SELECT overlay('Txxxxas' placing 'hom' from 2 for 4)",
            "SELECT position('om' IN 'Thomas')",
            "SELECT substring('Thomas' from 2 for 3)",
            "SELECT substring('Thomas' from 3)",
            "SELECT substring('Thomas' for 2)",
            "SELECT trim(both 'xyz' from 'yxTomxx')",
            "SELECT trim(leading from 'yxTomxx', 'xyz')",
            "SELECT trim(both 'yxTomxx', 'xyz')",
            "SELECT trim(trailing from 'abc   ')",
            "SELECT trim('  abc  ')",
        ],
    )
    .await;
}

#[tokio::test]
async fn test_expression_function_call() {
    test(
        &[r#"
CREATE TABLE person (age integer);

CREATE SCHEMA s;
CREATE FUNCTION s.func() RETURNS boolean AS $$
  SELECT true
$$ LANGUAGE sql;
"#],
        &[
            "SELECT count(*) FROM person",
            "SELECT now()",
            "SELECT sqrt(2)",
            "SELECT make_date(1999, 1, 2)",
            "SELECT age, count(*) OVER () FROM person",
            "SELECT count(*) FILTER (WHERE age > 0) OVER () FROM person",
            "SELECT count(*) OVER (PARTITION BY age) FROM person",
            "SELECT count(*) OVER (ORDER BY age) FROM person",
            "SELECT count(*) FILTER (WHERE age > 0) OVER (PARTITION BY age ORDER BY age) FROM person",
            "SELECT s.func()",
        ],
    )
    .await;
}

#[tokio::test]
async fn test_expression_typecast() {
    test(
        &[],
        &[
            // simple type casts
            "SELECT NULL::integer",
            "SELECT 3.1415::real",
            "SELECT .1415::real",
            "SELECT 3e6::real",
            "SELECT 3E-6::real",
            // special type casts
            "SELECT '10011'::bit(5)",
            "SELECT 'foo bar baz'::character varying (200)",
            "SELECT '1.23'::double precision",
            "SELECT '20:20:20.123456'::time (6) without time zone",
            "SELECT '2020-02-02T20:20:20.123456'::timestamp with time zone",
            "SELECT '1'::interval minute to second",
            // prefix type casts
            "SELECT bigint '123'",
            "SELECT bit(5) '10011'",
            "SELECT character varying (200) 'foo bar baz'",
            "SELECT double precision '1.23'",
            "SELECT int4 '1'",
            "SELECT time (6) without time zone '20:20:20.123456'",
            "SELECT timestamp with time zone '2020-02-02T20:20:20.123456'",
            "SELECT interval (1) '1'",
        ],
    )
    .await;
}

#[tokio::test]
async fn test_expression_operators() {
    test(
        &["CREATE TABLE person (id int, friends text[])"],
        &[
            "SELECT friends[id - 1] FROM person",
            "SELECT - + -5 ^ (-8) + (7 * 5 % 2 / 1) - 77",
            "SELECT friends[0] || friends[1] = ANY ('{foo, bar}'::text[]) FROM person",
            "SELECT '1999-12-31'::date <@ ALL ('{}'::daterange[])",
            "SELECT 1 IN (1, 2, 3), 2 NOT IN (SELECT id FROM person)",
            "SELECT 0 BETWEEN -5 AND 5, 99 NOT BETWEEN SYMMETRIC -5 AND 5",
            "SELECT EXISTS (SELECT * FROM person) IS TRUE",
            "SELECT id IS NULL, friends IS NOT NULL FROM person",
            "SELECT NOT true AND true OR 123 <= id FROM person",
            "SELECT id IS DISTINCT FROM 123, id IS NOT DISTINCT FROM 321 FROM person",
            "SELECT friends[0] LIKE '%roy', friends[0] NOT LIKE '%roy' FROM person",
            "SELECT friends[0] ILIKE '%roy', friends[0] NOT ILIKE '%roy' FROM person",
            "SELECT friends[0] SIMILAR TO 'roy', friends[0] NOT SIMILAR TO 'roy' FROM person",
            // "SELECT friends[0] SIMILAR TO 'roy' ESCAPE '', friends[0] NOT SIMILAR TO 'roy' ESCAPE '' FROM person",
        ],
    )
    .await;
}

#[tokio::test]
async fn test_cte() {
    test(
        &["CREATE TABLE person (id int, age int, flag bool)"],
        &[
            "WITH foo AS (SELECT id FROM person) SELECT * FROM foo",
            "WITH foo (bar, baz) AS (SELECT id, age FROM person) SELECT baz, bar FROM foo",
            "WITH foo AS (SELECT id, age FROM person), bar AS (SELECT id FROM foo) SELECT * FROM bar",
            "WITH foo AS (SELECT id, age FROM person), bar AS (SELECT id FROM foo) SELECT * FROM bar",
            "WITH foo AS (SELECT id, age FROM person) INSERT INTO person WITH bar AS (SELECT id, age FROM foo) SELECT * FROM bar"
        ],
    )
    .await;
}

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
            "INSERT INTO person VALUES (1, 2) ON CONFLICT (id) DO UPDATE SET age = 1, flag = DEFAULT",
            "INSERT INTO person VALUES (1, 2) ON CONFLICT ON CONSTRAINT unique_id DO UPDATE SET age = 1, flag = true",
            "INSERT INTO person VALUES (1, 2) RETURNING *",
            "INSERT INTO person VALUES (1, 2) RETURNING id AS a, age - 1 b, flag",
            "INSERT INTO person VALUES (1) ON CONFLICT DO NOTHING RETURNING *",
            "INSERT INTO person VALUES (1) ON CONFLICT DO NOTHING RETURNING person.*",
            "INSERT INTO person SELECT 1, 2, true",
            "INSERT INTO person (id, age, flag) SELECT 1, 2, true",
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
            "SELECT DISTINCT ON (age / 5) id, flag FROM person",
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
            "SELECT * FROM pg_catalog.pg_class",
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

#[tokio::test]
async fn test_update() {
    test(
        &["CREATE TABLE person (id int, age int, flag bool)"],
        &[
            "UPDATE person AS p SET id = $1, age = DEFAULT",
            "WITH foo AS (SELECT id FROM person) UPDATE person SET age = f.id FROM foo f",
            "UPDATE person AS p SET id = $1, age = DEFAULT RETURNING *",
            "UPDATE person AS p SET id = $1, age = DEFAULT RETURNING age, flag",
        ],
    )
    .await;
}

#[tokio::test]
async fn test_delete() {
    test(
        &["CREATE TABLE person (id int, age int, flag bool)"],
        &[
            "DELETE FROM person",
            "DELETE FROM person AS p",
            "DELETE FROM person WHERE id = $1",
            "DELETE FROM person RETURNING *",
            "DELETE FROM person WHERE id = $1 RETURNING id",
        ],
    )
    .await;
}

mod utils {
    use crate::connect_to_database;
    use crate::parser::parse_sql;
    use tokio_postgres::Transaction;

    pub async fn test(init_sqls: &[&str], tests: &[&str]) {
        // Run in transaction to rollback all changes automatically
        let mut client = connect().await.unwrap();
        let tx = client.transaction().await.unwrap();

        for init_sql in init_sqls {
            tx.batch_execute(*init_sql).await.unwrap();
        }
        for test in tests {
            assert_prepare(&tx, test).await;
            assert_parse(test);
        }
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