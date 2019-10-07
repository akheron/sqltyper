-- Without the ELSE branch the CASE result is always nullable. With
-- the ELSE branch is non-null if all of the branch results, including
-- the else branch, are non-null.
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name varchar(255),
  age integer
);

--- query -----------------------------------------------------------------

SELECT
    CASE WHEN name IS NULL THEN 'unknown'
         WHEN name IS NOT NULL AND age >= 18 THEN name
         ELSE 'minor'
    END AS name,
    CASE WHEN name IS NULL THEN 'unknown'
         WHEN name IS NOT NULL AND age >= 18 THEN name
    END AS name_no_else,
    CASE WHEN age >= 18 THEN name
         ELSE 'minor'
    END AS name_nullable

FROM person

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

name: string
name_no_else: string | null
name_nullable: string | null

--- expected param types --------------------------------------------------
