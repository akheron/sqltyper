--- setup -----------------------------------------------------------------

CREATE TABLE person (
  name varchar(255) NOT NULL,
  age integer
);

CREATE VIEW view_person AS SELECT name FROM person

--- query -----------------------------------------------------------------

SELECT * FROM view_person

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

name: string | null

--- expected param types --------------------------------------------------

