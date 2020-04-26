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
  row_to_json(person) as person_row_json,
  row_to_json(profile) as profile_row_json
FROM person
JOIN profile ON person.person_id = profile.person_id;

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

person_row_json: { person_id: number; email: string }
profile_row_json: { profile_id: number; person_id: number; name: string} | null

--- expected param types --------------------------------------------------
