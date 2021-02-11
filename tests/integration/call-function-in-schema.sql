--- setup -----------------------------------------------------------------

CREATE SCHEMA s;

CREATE FUNCTION s.func() RETURNS boolean AS $$
  SELECT true
$$ LANGUAGE sql;

--- query -----------------------------------------------------------------

SELECT s.func()

--- expected row count ----------------------------------------------------

one

--- expected column types -------------------------------------------------

func: boolean | null

--- expected param types --------------------------------------------------
