--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name text NOT NULL,
  age integer,
  shoe_size integer
);

--- query -----------------------------------------------------------------

SELECT
  initcap(name) as name_capitalized,
  age,
  shoe_size
FROM person
WHERE
    name LIKE $1 AND
    age > $2

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

text
int4

--- expected columns ------------------------------------------------------

name_capitalized: text
age: int4
shoe_size: int4?

