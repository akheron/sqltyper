--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name text CONSTRAINT nonempty CHECK (name <> '')
);

--- query -----------------------------------------------------------------

INSERT INTO person (name)
VALUES ($1)
ON CONFLICT (name) DO UPDATE SET name = $2

--- expected row count ----------------------------------------------------

zero

--- expected params -------------------------------------------------------

text?
text?

--- expected columns ------------------------------------------------------
