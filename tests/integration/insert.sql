--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name text NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

INSERT INTO person (name, age) VALUES ($1, $2);

--- expected row count ----------------------------------------------------

zero

--- expected params -------------------------------------------------------

text
int4?

--- expected columns ------------------------------------------------------
