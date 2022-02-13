use tokio_postgres::Client;

use crate::{parser::parse_sql, types::StatementDescription};

use self::columns::infer_column_nullability;
use self::error::Error;
use self::param::infer_param_nullability;
use self::rowcount::infer_row_count;
use self::source_columns::ValueNullability;

mod columns;
mod context;
mod db;
mod error;
mod non_null_expressions;
mod null_safety;
mod param;
mod rowcount;
mod select_list;
mod source_columns;

pub async fn infer_statement_nullability<'a>(
    client: &Client,
    statement: &mut StatementDescription<'a>,
) -> Result<(), Error> {
    let ast = parse_sql(&statement.sql)?;

    let param_nullability = infer_param_nullability(client, &ast).await?;
    for (i, mut param) in statement.params.iter_mut().enumerate() {
        param.nullable = param_nullability.is_nullable(i + 1);
    }

    let columns = infer_column_nullability(client, &param_nullability, &ast).await?;
    for (column, inferred) in statement.columns.iter_mut().zip(columns) {
        match inferred.nullability {
            ValueNullability::Scalar { nullable } => {
                column.nullable = nullable;
            }
            ValueNullability::Array {
                nullable,
                elem_nullable,
            } => {
                column.nullable = nullable;
                column.type_ = column.type_.to_array_type(elem_nullable);
            }
        }
    }

    statement.row_count = infer_row_count(&ast);
    Ok(())
}
