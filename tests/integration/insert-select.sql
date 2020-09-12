--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name varchar(255) NOT NULL,
  age integer,
  shoe_size integer
);

CREATE TABLE other (
  text varchar(255) NOT NULL,
  number integer NOT NULL,
  other_number integer
);

--- query -----------------------------------------------------------------

INSERT INTO person (name, age, shoe_size)
SELECT text, number, other_number FROM other
RETURNING *

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

name: string
age: number | null
shoe_size: number | null

--- expected param types --------------------------------------------------
