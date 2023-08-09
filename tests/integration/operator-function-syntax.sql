-- Some operators and functions have special syntax
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name varchar(255) NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

SELECT
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

--- expected column types -------------------------------------------------

overlaid: string
pos: number
sub1: string
sub2: string
trim1: string
trim2: string
trim3: string

--- expected param types --------------------------------------------------
