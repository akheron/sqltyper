--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name text NOT NULL,
  age integer NOT NULL,
  shoe_size integer
);

--- query -----------------------------------------------------------------

SELECT initcap(name) as name_capitalized, age, shoe_size
FROM person
WHERE
    name LIKE ${namePattern} AND
    age > ${minimumAge}

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

name_capitalized: string
age: number
shoe_size: number | null

--- expected param types --------------------------------------------------

namePattern: string
minimumAge: number
