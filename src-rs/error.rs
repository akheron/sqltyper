use crate::preprocess;
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "variant", rename_all = "snake_case")]
pub enum Error {
    Preprocess {
        error: preprocess::Error,
    },
    SqlStatement {
        message: String,
        detail: Option<String>,
        hint: Option<String>,
    },
    Postgres {
        error: String,
    },
}

impl From<preprocess::Error> for Error {
    fn from(error: preprocess::Error) -> Self {
        Error::Preprocess { error }
    }
}

impl From<tokio_postgres::Error> for Error {
    fn from(error: tokio_postgres::Error) -> Self {
        if let Some(db_error) = error.as_db_error() {
            Error::SqlStatement {
                message: db_error.message().to_string(),
                detail: db_error.detail().map(|s| s.to_string()),
                hint: db_error.hint().map(|s| s.to_string()),
            }
        } else {
            Error::Postgres {
                error: error.to_string(),
            }
        }
    }
}
