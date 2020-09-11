--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name varchar(255) NOT NULL,
  age INT
);

--- query -----------------------------------------------------------------

/* foo */

-- foo
SELECT
/* bar */
  name -- foo
  , /*aaaa*/age--lol
  /* baz */--bar
FROM person
WHERE age IS NOT /*quux*/ NULL

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

name: string
age: number

--- expected param types --------------------------------------------------
