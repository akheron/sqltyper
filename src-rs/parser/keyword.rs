use strum_macros;

#[derive(Clone, Copy, strum_macros::Display, strum_macros::IntoStaticStr)]
#[strum(serialize_all = "UPPERCASE")]
pub enum Keyword {
    AS,
    CONFLICT,
    DEFAULT,
    FALSE,
    INSERT,
    INTO,
    NULL,
    ON,
    TRUE,
    VALUES,
}
