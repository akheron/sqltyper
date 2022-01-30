mod db;
mod error;
mod param;
mod rowcount;

use tokio_postgres::GenericClient;

use self::error::Error;
use self::param::infer_param_nullability;
use self::rowcount::infer_row_count;
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
    match infer_param_nullability(client, &ast).await {
        Err(error) => warnings.push(err_to_warning(error)),
        Ok(param_nullability) => {
            for (i, mut param) in statement.params.iter_mut().enumerate() {
                param.nullable = param_nullability.is_nullable(i + 1);
            }
        }
    };

    statement.row_count = infer_row_count(&ast);

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
