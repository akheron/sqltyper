`table1 RIGHT JOIN table2 ON condition` should infer all columns of
`table1` as nullable

--- setup -----------------------------------------------------------------

CREATE TABLE person (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  age integer
);

CREATE TABLE book (
  id serial,
  name varchar(255) NOT NULL,
  author_id integer NOT NULL REFERENCES person(id)
)

--- query -----------------------------------------------------------------

SELECT
  person.name as person_name,
  book.name as book_name
FROM person
RIGHT JOIN book ON book.author_id = person.id

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

person_name: string | null
book_name: string

--- expected param types --------------------------------------------------
