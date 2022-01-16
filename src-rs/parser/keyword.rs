use strum_macros;

#[derive(
    Clone, Copy, strum_macros::Display, strum_macros::EnumString, strum_macros::IntoStaticStr,
)]
#[strum(serialize_all = "UPPERCASE")]
pub enum Keyword {
    ALL,
    AS,
    ASC,
    BY,
    CONFLICT,
    CONSTRAINT,
    CROSS,
    DEFAULT,
    DESC,
    DISTINCT,
    DO,
    EXCEPT,
    FALSE,
    FIRST,
    FROM,
    FULL,
    GROUP,
    HAVING,
    INNER,
    INSERT,
    INTERSECT,
    INTO,
    JOIN,
    LAST,
    LEFT,
    LIMIT,
    NATURAL,
    NOTHING,
    NULL,
    NULLS,
    OFFSET,
    ON,
    ORDER,
    OUTER,
    PARTITION,
    RETURNING,
    RIGHT,
    SELECT,
    SET,
    TRUE,
    UNION,
    UPDATE,
    USING,
    VALUES,
    WHERE,
    WINDOW,
}
