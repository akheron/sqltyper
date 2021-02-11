--- setup -----------------------------------------------------------------

CREATE FUNCTION foobarbaz(i integer, j integer) RETURNS integer AS $$
  BEGIN
    RETURN i + j;
  END;
$$ LANGUAGE plpgsql;

CREATE OPERATOR +~+ (
  LEFTARG = integer,
  RIGHTARG = integer,
  FUNCTION = foobarbaz
);

CREATE TABLE person (
  name varchar(255) NOT NULL,
  age integer
);

--- query -----------------------------------------------------------------

SELECT
  age +~+ age AS a
FROM person

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

a: number | null

--- expected param types --------------------------------------------------

--- expected warnings -----------------------------------------------------

Unknown operator '+~+'
