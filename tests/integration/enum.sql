A custom enum is be converted to a union type of string constants

--- setup -----------------------------------------------------------------

CREATE TYPE myenum AS ENUM ('foo', 'bar', 'baz');

CREATE TABLE mytable (
  id serial PRIMARY KEY,
  value myenum NOT NULL,
  other myenum
);

--- query -----------------------------------------------------------------

SELECT * FROM mytable
WHERE value = ${value}

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

id: number
value: "foo" | "bar" | "baz"
other: "foo" | "bar" | "baz" | null

--- expected param types --------------------------------------------------

value: "foo" | "bar" | "baz"
