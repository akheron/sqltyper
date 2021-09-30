--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

DELETE FROM person WHERE name = ${name} AND age = ${age};

--- expected row count ----------------------------------------------------

zero

--- expected column types ----------------------------------------------------

--- expected param types --------------------------------------------------

name: string
age: number
