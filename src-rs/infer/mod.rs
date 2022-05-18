use crate::infer::columns::Columns;
use crate::infer::context::Context;
use crate::infer::db::SchemaClient;
use crate::types::Kind;
use crate::{parser::parse_sql, types::StatementDescription, RowCount};
use serde::Serialize;
use tokio_postgres::Transaction;

use self::columns::infer_column_nullability;
pub use self::error::Error;
use self::param::{infer_param_nullability, NullableParams};
use self::rowcount::infer_row_count;
use self::source_columns::ValueNullability;

mod columns;
mod context;
mod db;
mod error;
mod expression;
mod non_null_expressions;
mod param;
mod rowcount;
mod select_list;
mod source_columns;

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum AnalyzeStatus {
    NotAnalyzed,
    Success,
    Error { error: Error },
}

pub async fn analyze_statement(
    tx: &Transaction<'_>,
    mut statement: StatementDescription,
) -> StatementDescription {
    match do_analyze(tx, &statement.sql).await {
        Ok(output) => {
            output.update_statement(&mut statement);
            statement.analyze_status = AnalyzeStatus::Success;
        }
        Err(error) => statement.analyze_status = AnalyzeStatus::Error { error },
    }
    statement
}

async fn do_analyze(tx: &Transaction<'_>, sql: &str) -> Result<AnalyzeOutput, Error> {
    let client = SchemaClient::new(tx).await?;
    let ast = parse_sql(sql)?;

    let row_count = infer_row_count(&ast);
    let params = infer_param_nullability(&client, &ast).await?;

    let context = Context::new(&client, &params);
    let columns = infer_column_nullability(&context, &ast).await?;

    Ok(AnalyzeOutput {
        row_count,
        params,
        columns,
    })
}

pub struct AnalyzeOutput {
    row_count: RowCount,
    params: NullableParams,
    columns: Columns,
}

impl AnalyzeOutput {
    pub fn update_statement(&self, statement: &mut StatementDescription) {
        statement.row_count = self.row_count;

        for (i, mut param) in statement.params.iter_mut().enumerate() {
            param.nullable = self.params.is_nullable(i + 1);
        }

        for (column, inferred) in statement.columns.iter_mut().zip(&self.columns) {
            match inferred.nullability {
                ValueNullability::Scalar { nullable } => {
                    column.type_.nullable = nullable;
                }
                ValueNullability::Array {
                    nullable,
                    elem_nullable,
                } => {
                    column.type_.nullable = nullable;
                    if let Kind::Array { element_type: elem } = column.type_.kind.as_mut() {
                        elem.nullable = elem_nullable;
                    } else {
                        // TODO: Should it be considered an error if we inferred an array but the actual type is something else?
                    }
                }
            }
        }
    }
}
