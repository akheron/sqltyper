--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name varchar(255) NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

SELECT * FROM person

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

name: string
age: number | null

--- expected param types --------------------------------------------------
