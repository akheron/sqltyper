In SELECT, params should be non-nullable

--- query -----------------------------------------------------------------

SELECT $1::integer AS output

--- expected row count ----------------------------------------------------

one

--- expected params -------------------------------------------------------

int4

--- expected columns ------------------------------------------------------

output: int4

