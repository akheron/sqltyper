-- array(subquery) is never NULL in itself. The nullability of the
-- array items is determined by the nullability of the source
-- expression.
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  age integer
);

--- query -----------------------------------------------------------------

SELECT
  array(SELECT age FROM person) AS ages,
  array(SELECT age FROM person WHERE age > 0) AS positive_ages

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

ages: Array<number | null>
positive_ages: Array<number>

--- expected param types --------------------------------------------------
