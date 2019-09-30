-- FALSE AND NULL evaluates to FALSE, so we must not expect anything
-- about b if `a and b` evaluates to false.
--- setup -----------------------------------------------------------------

CREATE TABLE tbl (
  condition1 boolean,
  condition2 boolean
);

--- query -----------------------------------------------------------------

SELECT condition1, condition2
FROM tbl
WHERE NOT NOT NOT (condition1 AND condition2)

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

condition1: boolean
condition2: boolean | null

--- expected param types --------------------------------------------------
