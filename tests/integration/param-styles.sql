Mixed use of ${param} and :param styles

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name varchar(255) NOT NULL,
  age INT
);

--- query -----------------------------------------------------------------

SELECT name, age::integer as age
FROM person
WHERE age <> :integer
AND age = ${bar}
AND name LIKE :bazQuux

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

name: string
age: number

--- expected param types --------------------------------------------------

integer: number
bar: number
bazQuux: string
