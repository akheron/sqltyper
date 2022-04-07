--- setup -----------------------------------------------------------------

CREATE TABLE test (
  nullable1 integer,
  nullable2 integer,
  nullable3 integer,
  nullable4 integer,
  notnull1 integer NOT NULL,
  notnull2 integer NOT NULL,
  notnull3 integer NOT NULL
);

--- query -----------------------------------------------------------------

SELECT
  nullable1 AS out1,
  nullable2 = ANY(SELECT nullable3 FROM test) AS out2,
  nullable4 = SOME(SELECT notnull1 FROM test) AS out3,
  notnull2 = ALL(SELECT notnull3 FROM test) AS out4,
  '1990-01-01'::date <@ ANY(SELECT daterange('1900-01-01', '2000-01-01', '[)')) as out5
FROM test
WHERE nullable1 = ANY(SELECT 1 UNION SELECT 2)

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

out1: int4
out2: bool?
out3: bool?
out4: bool
out5: bool
