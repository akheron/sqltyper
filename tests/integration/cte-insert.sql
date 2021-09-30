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
INSERT INTO person SELECT * FROM youngsters;

--- expected row count ----------------------------------------------------

zero

--- expected column types ----------------------------------------------------

--- expected param types --------------------------------------------------

maximumAge: number
