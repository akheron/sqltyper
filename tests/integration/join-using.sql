--- setup -----------------------------------------------------------------

CREATE TABLE person (
  person_id serial PRIMARY KEY,
  email text NOT NULL
);

CREATE TABLE profile (
  profile_id serial PRIMARY KEY,
  person_id integer references person NOT NULL,
  name varchar(255) NOT NULL
);

--- query -----------------------------------------------------------------

SELECT person_id, email, name FROM person
JOIN profile USING (person_id)

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

person_id: number
email: string
name: string

--- expected param types --------------------------------------------------
