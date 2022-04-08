`table1 LEFT JOIN table2 ON condition` should infer all columns of
`table2` as nullable

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name text NOT NULL,
  age integer
);

CREATE TABLE book (
  id serial,
  name text NOT NULL,
  author_id integer NOT NULL REFERENCES person(id)
);

--- query -----------------------------------------------------------------

SELECT
  person.name as person_name,
  book.name as book_name
FROM person
LEFT JOIN book ON book.author_id = person.id

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

--- expected columns ------------------------------------------------------

person_name: text
book_name: text?
