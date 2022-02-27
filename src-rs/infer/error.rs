use nom_supreme::error::ErrorTree;
use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum Error {
    Postgres(tokio_postgres::Error),
    TableNotFound(String),
    TableColumnNotFound { table: String, column: String },
    ColumnNotFound(String),
    ParseError(String),
    UnexpectedNumberOfColumns(String),
}

impl From<tokio_postgres::Error> for Error {
    fn from(err: tokio_postgres::Error) -> Self {
        Error::Postgres(err)
    }
}

impl From<ErrorTree<&str>> for Error {
    fn from(err: ErrorTree<&str>) -> Self {
        Error::ParseError(format!("{}", err))
    }
}

impl Display for Error {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Postgres(err) => write!(f, "{err}"),
            Error::TableNotFound(table) => write!(f, "Table not found: {table}"),
            Error::TableColumnNotFound { table, column } => {
                write!(f, "Column not found: {table}.{column}")
            }
            Error::ColumnNotFound(column) => write!(f, "Column not found: {column}"),
            Error::ParseError(err) => write!(f, "{err}"),
            Error::UnexpectedNumberOfColumns(err) => write!(f, "{err}"),
        }
    }
}
