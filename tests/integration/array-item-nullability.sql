-- Arrai columns are nullable if they don't have the NOT NULL
-- constraint. Furthermore, their items are always nullable.
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  child_ages integer[],
  parent_ages integer[] NOT NULL
);

--- query -----------------------------------------------------------------

SELECT child_ages, parent_ages
FROM person

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

child_ages: Array<number | null> | null
parent_ages: Array<number | null>

--- expected param types --------------------------------------------------
