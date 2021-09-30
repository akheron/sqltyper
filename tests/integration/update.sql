--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

UPDATE person SET name = ${name}, age = ${age};

--- expected row count ----------------------------------------------------

zero

--- expected column types ----------------------------------------------------

--- expected param types --------------------------------------------------

name: string
age: number | null
