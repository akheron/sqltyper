--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name varchar(255) CONSTRAINT nonempty CHECK (name <> '')
);

--- query -----------------------------------------------------------------

INSERT INTO person (name)
VALUES (${name})
ON CONFLICT (name) DO UPDATE SET name = ${defaultName}

--- expected row count ----------------------------------------------------

zero

--- expected column types -------------------------------------------------

--- expected param types --------------------------------------------------

name: string | null
defaultName: string | null
