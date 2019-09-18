--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial,
  name varchar(255) not null,
  age integer
);

--- query -----------------------------------------------------------------

SELECT * FROM person
WHERE age > ${minimumAge}

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

id: number
name: string
age: number | null

--- expected param types --------------------------------------------------

minimumAge: number
