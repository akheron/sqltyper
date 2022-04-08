--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name text NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

WITH youngsters AS (
  SELECT * FROM person
  WHERE age < $1
)
INSERT INTO person SELECT * FROM youngsters;

--- expected row count ----------------------------------------------------

zero

--- expected params -------------------------------------------------------

int4

--- expected columns ---------------------------------------------------------

