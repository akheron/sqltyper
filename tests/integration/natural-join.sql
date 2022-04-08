--- setup -----------------------------------------------------------------

CREATE TABLE person (
  person_id serial PRIMARY KEY,
  email text NOT NULL
);

CREATE TABLE profile (
  profile_id serial PRIMARY KEY,
  person_id integer references person NOT NULL,
  name text NOT NULL,
  time timestamptz NOT NULL
);

--- query -----------------------------------------------------------------

SELECT person_id, email, name FROM person
NATURAL JOIN profile

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

person_id: int4
email: text
name: text
