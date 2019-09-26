-- `WHERE expr IS NOT NULL` or `WHERE expr NOTNULL` should infer
-- `expr` as not null. It should also recurse to safe operators and
-- functions.
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  age integer,
  shoe_size integer,
  height integer,
  weight integer
);

--- query -----------------------------------------------------------------

SELECT
  age,
  shoe_size,
  height,  -- not null because height + 5 is not null and + is safe
  weight   -- not null because bool(weight) is not null and bool() is safe
FROM person
WHERE
  age IS NOT NULL AND
  shoe_size NOTNULL AND
  height + 5 IS NOT NULL AND
  bool(weight) IS NOT NULL

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

age: number
shoe_size: number
height: number
weight: number

--- expected param types --------------------------------------------------
