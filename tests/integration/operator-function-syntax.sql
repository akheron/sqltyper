Some operators and functions have special syntax

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name text NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

SELECT
  (age!)::integer AS age_factorial,  -- suffix operator
  oveRLay(name placing 'foo' from 2 for 4) as overlaid,
  position('foo' in name) as pos,
  substring(name from 2 for 3) as sub1,
  substring(name from '%#"o_a#"_' for '#') as sub2,
  trim(both 'xyz' from name) as trim1,
  trim(both from name, 'xyz') as trim2,
  trim(name) as trim3
FROM person
WHERE age NOT BETWEEN SYMMETRIC 300 AND 200

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

age_factorial: int4
overlaid: text
pos: int4
sub1: text
sub2: text
trim1: text
trim2: text
trim3: text
