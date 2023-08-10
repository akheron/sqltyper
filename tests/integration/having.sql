`HAVING expr` works like `WHERE expr` when it comes to nullability.
See e.g. ./where.sql.

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  age integer NOT NULL,
  height integer,
  shoe_size integer
);

--- query -----------------------------------------------------------------

SELECT
  age,
  sum(height)::integer AS height_sum,
  count(shoe_size)::integer AS shoe_size_count
FROM person
GROUP BY age
HAVING
  sum(height) IS NOT NULL

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

age: int4
height_sum: int4
shoe_size_count: int4
