--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

SELECT *
FROM (
  SELECT * FROM person
  WHERE age < ${maximumAge}
) AS youngsters

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

id: number
name: string
age: number

--- expected param types --------------------------------------------------

maximumAge: number
