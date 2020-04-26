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

SELECT
  person.person_id,
  json_build_object(
    'name', name,
    'email', email
  ) as details
FROM person
JOIN profile ON person.person_id = profile.person_id

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

person_id: number
details: { name: string; email: string }

--- expected param types --------------------------------------------------
