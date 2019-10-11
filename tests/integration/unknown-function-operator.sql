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
  foobarbaz(age, age) AS a1,
  age +~+ age AS a2
FROM person

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

a1: number | null
a2: number | null

--- expected param types --------------------------------------------------

--- expected warnings -----------------------------------------------------

Unknown function 'foobarbaz'
Unknown operator '+~+'
