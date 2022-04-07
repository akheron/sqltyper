--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name text NOT NULL,
  age integer,
  shoe_size integer
);

CREATE TABLE other (
  text text NOT NULL,
  number integer NOT NULL,
  other_number integer
);

--- query -----------------------------------------------------------------

INSERT INTO person (name, age, shoe_size)
SELECT text, number, other_number FROM other
RETURNING *

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

name: text
age: int4?
shoe_size: int4?
