--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name text NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

SELECT *
FROM (
  SELECT * FROM person
  WHERE age < $1
) AS youngsters

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

int4

--- expected columns ------------------------------------------------------

id: int4
name: text
age: int4
