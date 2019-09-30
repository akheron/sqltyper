-- Some operators and function have special syntax
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

SELECT
  age
FROM person
WHERE age NOT BETWEEN SYMMETRIC 300 AND 200

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

age: number

--- expected param types --------------------------------------------------
