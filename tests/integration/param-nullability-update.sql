Assigning an input param directly to a nullable column in UPDATE
should make the param nullable. Computing a derived value and then
assigning should not.

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  constant integer,
  age integer,
  name varchar(255) NOT NULL,
  height_doubled integer
);

--- query -----------------------------------------------------------------

UPDATE person
SET
    constant = 42,
    age = ${age},
    name = ${name},
    height_doubled = ${height} * 2
WHERE id = ${id}

--- expected row count ----------------------------------------------------

zero

--- expected column types -------------------------------------------------

--- expected param types --------------------------------------------------

age: number | null
name: string
height: number
id: number
