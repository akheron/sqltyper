--- setup -----------------------------------------------------------------

CREATE TABLE person (
  person_id serial PRIMARY KEY,
  email text NOT NULL
);

CREATE TABLE profile (
  profile_id serial PRIMARY KEY,
  person_id integer references person NOT NULL,
  name text NOT NULL
);

--- query -----------------------------------------------------------------

SELECT person_id, email, name FROM person
JOIN profile USING (person_id)

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

person_id: int4
email: text
name: text
