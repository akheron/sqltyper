use crate::infer::param::NullableParams;
use crate::infer::source_columns::Column;
use crate::{parser::parse_sql, types::StatementDescription, StatementRowCount};
use tokio_postgres::GenericClient;

use self::columns::infer_column_nullability;
pub use self::error::Error;
use self::param::infer_param_nullability;
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

pub async fn analyze_statement<'a, C: GenericClient + Sync>(
    client: &C,
    sql: &str,
) -> Result<AnalyzeOutput, Error> {
    let ast = parse_sql(sql)?;

    let row_count = infer_row_count(&ast);
    let params = infer_param_nullability(client, &ast).await?;
    let columns = infer_column_nullability(client, &params, &ast).await?;

    Ok(AnalyzeOutput {
        row_count,
        params,
        columns,
    })
}

pub struct AnalyzeOutput {
    row_count: StatementRowCount,
    params: NullableParams,
    columns: Vec<Column>,
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
                    column.nullable = nullable;
                }
                ValueNullability::Array {
                    nullable,
                    elem_nullable,
                } => {
                    column.nullable = nullable;
                    column.type_ = column.type_.lift_to_array(elem_nullable);
                }
            }
        }
    }
}
