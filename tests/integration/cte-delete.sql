--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

WITH youngsters AS (
  SELECT * FROM person
  WHERE age < ${maximumAge}
)
DELETE FROM person WHERE age = (SELECT max(age) FROM youngsters)
RETURNING age;

--- expected row count ----------------------------------------------------

many

--- expected column types ----------------------------------------------------

age: number

--- expected param types --------------------------------------------------

maximumAge: number
