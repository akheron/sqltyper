Non-nullability inferred from WHERE should "propagate" inside
complex expressions

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name varchar(255) NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

SELECT
  upper(name) as complex_name,
  age - 5 < 10 AND age + 5 > 12 AS complex_age
FROM person
WHERE age IS NOT NULL

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

complex_name: text
complex_age: bool
