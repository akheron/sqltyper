Assigning an input param directly to a nullable column in UPDATE
should make the param nullable. Computing a derived value and then
assigning should not.

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  constant integer,
  age integer,
  name text NOT NULL,
  height_doubled integer
);

--- query -----------------------------------------------------------------

UPDATE person
SET
    constant = 42,
    age = $1,
    name = $2,
    height_doubled = $3 * 2
WHERE id = $4

--- expected row count ----------------------------------------------------

zero

--- expected params -------------------------------------------------------

int4?
text
int4
int4

--- expected columns ------------------------------------------------------
