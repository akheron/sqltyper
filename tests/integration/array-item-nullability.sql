-- Array columns are nullable if they don't have the NOT NULL
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

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

child_ages: [int4?]?
parent_ages: [int4?]

