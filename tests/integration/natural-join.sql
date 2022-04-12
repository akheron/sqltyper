-- With NATURAL JOIN the join condition columns are inferred as
-- non-nullable (person_id and email in this case)
--- setup -----------------------------------------------------------------

CREATE TABLE person (
  person_id serial PRIMARY KEY,
  email text,
  updated timestamptz NOT NULL
);

CREATE TABLE profile (
  profile_id serial PRIMARY KEY,
  person_id integer REFERENCES person,
  email text,
  name text
);

--- query -----------------------------------------------------------------

SELECT person_id, email, name, updated FROM person
NATURAL JOIN profile

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

person_id: int4
email: text
name: text?
updated: timestamptz
