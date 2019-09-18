--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial,
  name varchar(255) not null,
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
