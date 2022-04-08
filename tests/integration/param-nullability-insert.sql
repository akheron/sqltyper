Assigning an input param directly to a nullable column in INSERT
should make the param nullable. Computing a derived value and then
assigning should not.

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name text NOT NULL,
  age integer,
  height_doubled integer
);

--- query -----------------------------------------------------------------

INSERT INTO person (name, age, height_doubled)
VALUES ($1, $2, $3 * 2)

--- expected row count ----------------------------------------------------

zero

--- expected params -------------------------------------------------------

text
int4?
int4

--- expected columns ------------------------------------------------------
