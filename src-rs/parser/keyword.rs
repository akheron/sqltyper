use strum_macros;

#[derive(Clone, Copy, strum_macros::Display, strum_macros::IntoStaticStr)]
#[strum(serialize_all = "UPPERCASE")]
pub enum Keyword {
    AS,
    CONFLICT,
    CONSTRAINT,
    DEFAULT,
    DO,
    FALSE,
    INSERT,
    INTO,
    NOTHING,
    NULL,
    ON,
    RETURNING,
    SET,
    TRUE,
    UPDATE,
    VALUES,
}
