--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name varchar(255) NOT NULL,
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

--- expected column types -------------------------------------------------

name: string
age_sum: number
shoe_size_avg: number | null

--- expected param types --------------------------------------------------
