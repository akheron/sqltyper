-- The ${min} parameter is used multiple times here. Both should be
-- mapped to $1.
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  age integer,
  shoe_size integer
);

--- query -----------------------------------------------------------------

SELECT * FROM person
WHERE
    age >= ${min} AND
    shoe_size >= ${min}

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

age: number
shoe_size: number

--- expected param types --------------------------------------------------

min: number
