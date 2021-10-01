--- setup -----------------------------------------------------------------

CREATE TABLE test (
  foo integer NOT NULL,
  bar integer,
  baz integer
);

--- query -----------------------------------------------------------------

SELECT
    1 IN (foo, :param) AS a,
    1 IN (foo, bar) AS b,
    1 + NULL IN (1, 2, 3) AS c,
    1 IN ((SELECT foo FROM test LIMIT 1), 1, 2) AS d
FROM test

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

a: boolean
b: boolean | null
c: boolean | null
d: boolean

--- expected param types --------------------------------------------------

param: number
