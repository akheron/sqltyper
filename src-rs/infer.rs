mod param;

use tokio_postgres::GenericClient;

// use self::param::infer_param_nullability;
use crate::parser::parse_sql;

pub struct Error {
    msg: String,
}

impl Error {
    pub fn from_str(msg: &str) -> Error {
        Error {
            msg: String::from(msg),
        }
    }

    pub fn from_string(msg: String) -> Error {
        Error { msg }
    }
}

pub fn infer_statement_nullability<C>(client: &C, sql: &str) -> Result<(), Error>
where
    C: GenericClient,
{
    // let param_nullability = infer_param_nullability(statement);
    Ok(())
}
