#[derive(
    Clone, Copy, strum_macros::Display, strum_macros::EnumString, strum_macros::IntoStaticStr,
)]
#[strum(serialize_all = "UPPERCASE")]
pub enum Keyword {
    ALL,
    AND,
    ANY,
    ARRAY,
    AS,
    ASC,
    BETWEEN,
    BIT,
    BOTH,
    BY,
    CASE,
    CHARACTER,
    CONFLICT,
    CONSTRAINT,
    CROSS,
    DAY,
    DECIMAL,
    DEFAULT,
    DESC,
    DELETE,
    DISTINCT,
    DO,
    DOUBLE,
    ELSE,
    END,
    EXCEPT,
    EXISTS,
    FALSE,
    FILTER,
    FIRST,
    FOR,
    FROM,
    FULL,
    GROUP,
    HAVING,
    HOUR,
    ILIKE,
    IN,
    INNER,
    INSERT,
    INTERSECT,
    INTERVAL,
    INTO,
    IS,
    ISNULL,
    JOIN,
    LAST,
    LEADING,
    LEFT,
    LIKE,
    LIMIT,
    MINUTE,
    MONTH,
    NATURAL,
    NOT,
    NOTHING,
    NOTNULL,
    NULL,
    NULLS,
    NUMERIC,
    OFFSET,
    ON,
    OR,
    ORDER,
    OUTER,
    OVER,
    OVERLAY,
    PARTITION,
    PLACING,
    POSITION,
    PRECISION,
    RETURNING,
    RIGHT,
    SECOND,
    SELECT,
    SET,
    SIMILAR,
    SOME,
    SUBSTRING,
    SYMMETRIC,
    THEN,
    TIME,
    TIMESTAMP,
    TRAILING,
    TRIM,
    TRUE,
    TO,
    UNION,
    UNKNOWN,
    UPDATE,
    USING,
    VALUES,
    VARYING,
    WHEN,
    WHERE,
    WINDOW,
    WITH,
    WITHOUT,
    YEAR,
    ZONE,
}