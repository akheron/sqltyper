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
    age AS val1,         -- not null
    shoe_size AS val2    -- not null
FROM person

UNION

SELECT
    height,              -- not null because of WHERE
    weight FROM person   -- may be null
WHERE
    height IS NOT NULL

INTERSECT

SELECT
    x,                   -- not null
    y                    -- not null
FROM dimensions

EXCEPT

SELECT
    z,                   -- may be null (ignored because of EXCEPT)
    w                    -- may be null (ignored because of EXCEPT)
FROM dimensions

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

val1: int4
val2: int4?

