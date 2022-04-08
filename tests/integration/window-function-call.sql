--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name text NOT NULL,
  age integer NOT NULL,
  shoe_size integer
);

--- query -----------------------------------------------------------------

SELECT
  name,
  sum(age) OVER ()::integer as age_sum,
  avg(shoe_size) OVER age_partition::integer AS shoe_size_avg
FROM person
WINDOW
  temp_window AS (PARTITION BY age),
  age_partition AS (temp_window)

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

name: text
age_sum: int4
shoe_size_avg: int4?

