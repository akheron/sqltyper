--- setup -----------------------------------------------------------------

--- query -----------------------------------------------------------------

SELECT
    TRUE as t,
    FALSE as f,
    NULL::integer as n,
    1 as int,
    3.1415::real as float1,
    .1415::real as float2,
    3e6::real as float3,
    3E-6::real as float4,
    'foo' as str

--- expected row count ----------------------------------------------------

one

--- expected column types -------------------------------------------------

t: boolean
f: boolean
n: number | null
int: number
float1: number
float2: number
float3: number
float4: number
str: string

--- expected param types --------------------------------------------------
