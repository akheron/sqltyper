A custom enum is converted to a union type of string constants

--- setup -----------------------------------------------------------------

CREATE TYPE myenum AS ENUM ('foo', 'bar', 'baz');

CREATE TABLE mytable (
  id serial PRIMARY KEY,
  value myenum NOT NULL,
  other myenum
);

--- query -----------------------------------------------------------------

SELECT * FROM mytable
WHERE value = $1

--- expected row count ----------------------------------------------------

many

--- expected params -------------------------------------------------------

"foo" | "bar" | "baz"

--- expected columns ------------------------------------------------------

id: number
value: "foo" | "bar" | "baz"
other: "foo" | "bar" | "baz" | null
