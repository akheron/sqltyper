mod db;
mod error;
mod param;

use tokio_postgres::GenericClient;

use self::error::Error;
use self::param::infer_param_nullability;
use crate::types::Warning;
use crate::{
    parser::parse_sql,
    types::{StatementDescription, Warn},
};

pub async fn infer_statement_nullability<'a, C: GenericClient>(
    client: &C,
    mut statement: StatementDescription<'a>,
) -> Warn<StatementDescription<'a>> {
    let parse_result = parse_sql(&statement.sql);
    if let Err(err) = parse_result {
        let parse_error = format!("Parse error: {}", err);
        return Warn::warn(
            statement,
            "The internal SQL parser failed to parse the SQL statement.",
            parse_error,
        );
    }
    let ast = parse_result.unwrap();

    let mut warnings: Vec<Warning> = vec![];
    if let Err(err) = infer_param_nullability(client, &ast, &mut statement.params).await {
        warnings.push(err_to_warning(err));
    }

    Warn {
        payload: statement,
        warnings,
    }
}

fn err_to_warning(err: Error) -> Warning {
    Warning {
        summary: "Unexpected error".to_string(),
        description: format!("{}", err),
    }
}
