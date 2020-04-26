-- When no corresponding item rows are found, item_rows is [null] because
-- it is the aggregate of row_to_json, which has already evaluated to null

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  person_id serial PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE item (
  item_id serial PRIMARY KEY,
  person_id integer references person NOT NULL,
  description varchar(255) NOT NULL
);

--- query -----------------------------------------------------------------

SELECT
  name,
  jsonb_agg(row_to_json(item)) as item_rows
FROM person
LEFT JOIN item ON item.person_id = person.person_id
GROUP BY person.person_id, item_id

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

name: string
item_rows: Array<{ item_id: number; person_id: number; description: string}> | [null]

--- expected param types --------------------------------------------------

