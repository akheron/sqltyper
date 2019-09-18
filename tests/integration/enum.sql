--- setup -----------------------------------------------------------------

CREATE TYPE myenum AS ENUM ('foo', 'bar', 'baz');

CREATE TABLE mytable (
  id serial,
  value myenum not null,
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
