-- Because NULL evaluates to FALSE, an expression appearing in the
-- WHERE clause means that the expression must not evaluate to NULL in
-- the result set. The following rules follow:
--
-- * `WHERE expr` should infer `expr` as not null
--
-- * `WHERE expr1 op expr2` should infer `expr1` and `expr2` as not
--   null if `op` is null-safe
--
-- * `WHERE func(expr1, expr2, ...)` should infer `expr1`, `expr2`,
--   ... as not null if `func` is null-safe
--
-- * `WHERE expr IN (...)` should infer `expr` as not null
--
-- * If the top-level of the WHERE clause is an AND chain, the same
--   applies to each AND operand.
--
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  age integer,
  shoe_size integer,
  height integer,
  weight integer,
  name text,
  arm_length integer
);

--- query -----------------------------------------------------------------

SELECT
  age + 5 AS age_plus_5,
  shoe_size,
  height,
  weight,
  concat(name, 'foo') AS name_foo,
  name,
  arm_length
FROM person
WHERE age + 5 < 60
  AND shoe_size = 45
  AND bool(height) IS NOT NULL
  AND weight IS NOT NULL
   -- concat is neverNull, so this doesn't mark name as non-null
  AND concat(name, 'foo') IS NOT NULL
  AND arm_length IN (1, 2, NULL)

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

age_plus_5: int4
shoe_size: int4
height: int4
weight: int4
name_foo: text
name: text?
arm_length: int4

