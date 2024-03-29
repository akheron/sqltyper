--- setup -----------------------------------------------------------------

--- query -----------------------------------------------------------------

SELECT
    TRUE as t,
    FALSE as f,
    1 as n1,

    -- simple type casts
    NULL::integer as n2,
    3.1415::real as f1,
    .1415::real as f2,
    3e6::real as f3,
    3E-6::real as f4,

    -- special type casts
    '10011'::bit(5) as s_b,
    'foo bar baz'::character varying (200) as s_vc,
    '1.23'::double precision as s_d,
    '20:20:20.123456'::time (6) without time zone as s_t,
    '2020-02-02T20:20:20.123456'::timestamp with time zone as s_ts,
    '1'::interval minute to second as s_int,

    -- prefix type casts
    bigint '123' as p_bi,
    bit(5) '10011' as p_b,
    character varying (200) 'foo bar baz' as p_vc,
    double precision '1.23' as p_d,
    int4 '1' as p_i4,
    time (6) without time zone '20:20:20.123456' as p_t,
    timestamp with time zone '2020-02-02T20:20:20.123456' as p_ts,
    interval (1) '1' as p_int

--- expected row count ----------------------------------------------------

one

--- expected column types -------------------------------------------------

t: boolean
f: boolean
n1: number
n2: number | null
f1: number
f2: number
f3: number
f4: number
s_b: string
s_vc: string
s_d: number
s_t: string
s_ts: Date
s_int: { hours: number; minutes: number; seconds: number }
p_bi: string
p_b: string
p_vc: string
p_d: number
p_i4: number
p_t: string
p_ts: Date
p_int: { hours: number; minutes: number; seconds: number }

--- expected param types --------------------------------------------------
