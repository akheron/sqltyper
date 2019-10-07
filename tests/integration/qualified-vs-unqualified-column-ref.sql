-- If a column name is used qualified in WHERE ... IS NOT NULL and
-- unqualified in the select list (or vice versa), we should still be
-- able to infer it as not null.
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  age integer,
  shoe_size integer
);

--- query -----------------------------------------------------------------

SELECT
    person.age,
    shoe_size
FROM person
WHERE
    age IS NOT NULL AND
    person.shoe_size IS NOT NULL

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

age: number
shoe_size: number

--- expected param types --------------------------------------------------
