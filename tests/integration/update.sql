--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name text NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

UPDATE person SET name = $1, age = $2;

--- expected row count ----------------------------------------------------

zero

--- expected params -------------------------------------------------------

text
int4?

--- expected columns ------------------------------------------------------
