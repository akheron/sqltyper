--- setup -----------------------------------------------------------------

--- query -----------------------------------------------------------------

SELECT
    TRUE as bt,
    FALSE as bf,
    NULL::integer as n,
    1 as int,
    3.1415::real as float1,
    .1415::real as float2,
    3e6::real as float3,
    3E-6::real as float4,

    -- prefix type casts
    bigint '123' as bi,
    bit(5) '10011' as b,
    character varying (200) 'foo bar baz' as vc,
    double precision '1.23' as d,
    int4 '1' as i4,
    time (6) without time zone '20:20:20.123456' as t,
    timestamp with time zone '2020-02-02T20:20:20.123456' as ts

--- expected row count ----------------------------------------------------

one

--- expected column types -------------------------------------------------

bt: boolean
bf: boolean
n: number | null
int: number
float1: number
float2: number
float3: number
float4: number
bi: string
b: string
vc: string
d: number
i4: number
t: string
ts: Date

--- expected param types --------------------------------------------------
