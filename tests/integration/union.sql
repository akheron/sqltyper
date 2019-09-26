-- `SELECT ... UNION/INTERSECT/EXCEPT SELECT ... ` should infer a
-- column as not null if it is not null in all subqueries, ignoring
-- EXCEPT subqueries because their outputs don't contribute to the
-- result
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  age integer NOT NULL,
  shoe_size integer NOT NULL,
  height integer,
  weight integer
);

CREATE TABLE dimensions (
  x integer NOT NULL,
  y integer NOT NULL,
  z integer,
  w integer
);

--- query -----------------------------------------------------------------

SELECT
    age AS val1,
    shoe_size AS val2
FROM person

UNION

SELECT
    height,
    weight FROM person
WHERE
    height IS NOT NULL

INTERSECT

SELECT
    x,
    y
FROM dimensions

EXCEPT

SELECT
    z,
    w
FROM dimensions

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

val1: number
val2: number | null

--- expected param types --------------------------------------------------
