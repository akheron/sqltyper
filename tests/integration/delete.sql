--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name text NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

DELETE FROM person WHERE name = $1 AND age = $2;

--- expected row count ----------------------------------------------------

zero

--- expected params -------------------------------------------------------

text
int4

--- expected columns ---------------------------------------------------------
