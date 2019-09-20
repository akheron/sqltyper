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
--   ... as not null if 'func' is null-safe
--
-- * If the top-level of the WHERE clause is an AND chain, the same
--   applies to each AND operand.
--
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  age integer,
  shoe_size integer,
  height integer
);

--- query -----------------------------------------------------------------

SELECT
  age + 5 as age_plus_5,
  shoe_size,
  height
FROM person
WHERE
  age + 5 < 60 AND
  shoe_size = 45 AND
  bool(height)

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

age_plus_5: number
shoe_size: number
height: number

--- expected param types --------------------------------------------------
