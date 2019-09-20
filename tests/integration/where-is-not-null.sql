`WHERE expr IS NOT NULL` should infer `expr` as not null, even if
`expr` is something more than a column reference. Should also support
the non-standard NOTNULL operator.

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  age integer,
  shoe_size integer,
  height integer
);

--- query -----------------------------------------------------------------

SELECT
  age,
  shoe_size,
  height,
  height + 5 as height_plus_5,
  height / 2 as height_per_2
  FROM person
WHERE
  age IS NOT NULL AND
  shoe_size NOTNULL AND
  height + 5 IS NOT NULL AND
  height / 2 NOTNULL

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

age: number
shoe_size: number
height: number | null
height_plus_5: number
height_per_2: number

--- expected param types --------------------------------------------------
