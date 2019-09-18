Assigning an input param directly to a nullable column in INSERT
should make the param nullable. Computing a derived value and then
assigning should not.

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  age integer,
  height_doubled integer
);

--- query -----------------------------------------------------------------

INSERT INTO person (name, age, height_doubled)
VALUES (${name}, ${age}, ${height} * 2)

--- expected row count ----------------------------------------------------

zero

--- expected column types -------------------------------------------------

--- expected param types --------------------------------------------------

name: string
age: number | null
height: number
