use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum Error {
    Postgres(tokio_postgres::Error),
    TableNotFound(String),
    ColumnNotFound(String),
}

impl From<tokio_postgres::Error> for Error {
    fn from(err: tokio_postgres::Error) -> Self {
        Error::Postgres(err)
    }
}

impl Display for Error {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Postgres(err) => write!(f, "{}", err),
            Error::TableNotFound(table) => write!(f, "Table not found: {}", table),
            Error::ColumnNotFound(column) => write!(f, "Column not found: {}", column),
        }
    }
}
