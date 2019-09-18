--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial,
  constant integer,
  name varchar(255) not null,
  age integer,
  height_doubled integer
);

--- query -----------------------------------------------------------------

UPDATE person
SET
    constant = 42,
    name = ${name},
    age = ${age},
    height_doubled = ${height} * 2
WHERE id = ${id}

--- expected row count ----------------------------------------------------

zero

--- expected column types -------------------------------------------------

--- expected param types --------------------------------------------------

name: string
age: number | null
height: number
id: number
