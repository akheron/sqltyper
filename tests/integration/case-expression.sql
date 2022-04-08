Without the ELSE branch the CASE result is always nullable. With
the ELSE branch is non-null if all of the branch results, including
the else branch, are non-null.

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name text,
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

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

name: text
name_no_else: text?
name_nullable: text?

