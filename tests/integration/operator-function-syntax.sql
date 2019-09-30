-- Some operators and functions have special syntax
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  age integer
);

--- query -----------------------------------------------------------------

SELECT
  (age!)::integer AS age_factorial  -- suffix operator
FROM person
WHERE age NOT BETWEEN SYMMETRIC 300 AND 200

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

age_factorial: number

--- expected param types --------------------------------------------------
