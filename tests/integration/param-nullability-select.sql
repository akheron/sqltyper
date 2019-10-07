-- In SELECT, params should be non-nullable
--- setup -----------------------------------------------------------------

--- query -----------------------------------------------------------------

SELECT ${param}::integer AS output

--- expected row count ----------------------------------------------------

one

--- expected column types -------------------------------------------------

output: number

--- expected param types --------------------------------------------------

param: number
