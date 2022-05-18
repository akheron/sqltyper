use nom_supreme::error::ErrorTree;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "variant", rename_all = "snake_case")]
pub enum Error {
    Postgres {
        message: String,
    },
    ParseError {
        message: String,
    },
    SchemaTableNotFound {
        schema: String,
        table: String,
    },
    TableNotFound {
        table: String,
    },
    AmbiguousTable {
        table: String,
    },
    SchemaTableColumnNotFound {
        schema: String,
        table: String,
        column: String,
    },
    TableColumnNotFound {
        table: String,
        column: String,
    },
    ColumnNotFound {
        column: String,
    },
    UnexpectedNumberOfColumns {
        message: String,
    },
}

impl From<tokio_postgres::Error> for Error {
    fn from(err: tokio_postgres::Error) -> Self {
        Error::Postgres {
            message: format!("{}", err),
        }
    }
}

impl From<ErrorTree<&str>> for Error {
    fn from(err: ErrorTree<&str>) -> Self {
        Error::ParseError {
            message: format!("{}", err),
        }
    }
}
