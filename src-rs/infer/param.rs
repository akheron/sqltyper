use tokio_postgres::GenericClient;

use crate::infer::db::{get_table_columns, Column};
use crate::infer::error::Error;
use crate::{ast, NamedValue};

/// Mutates `params` to have more accurate nullability info
pub async fn infer_param_nullability<C: GenericClient>(
    client: &C,
    ast: &ast::AST<'_>,
    params: &mut Vec<NamedValue>,
) -> Result<(), Error> {
    match ast {
        ast::AST::Insert(ast::Insert {
            table,
            columns,
            values,
            ..
        }) => {
            if let Some(values_list_params) = find_params_from_values(values) {
                let target_columns = find_insert_columns(client, table, columns).await?;
                combine_param_nullability(target_columns, values_list_params, params);
            }
        }
    }
    Ok(())
}

async fn find_insert_columns<'a, C: GenericClient>(
    client: &C,
    table: &ast::TableRef<'a>,
    target_columns: &Option<Vec<&str>>,
) -> Result<Vec<Column>, Error> {
    let table_columns = get_table_columns(client, table).await?;
    match_insert_columns(target_columns, table_columns)
}

fn match_insert_columns(
    target_columns: &Option<Vec<&str>>,
    mut table_columns: Vec<Column>,
) -> Result<Vec<Column>, Error> {
    match target_columns {
        None => Ok(table_columns
            .into_iter()
            .filter(|col| !col.hidden)
            .collect()),
        Some(column_names) => {
            let mut result: Vec<Column> = Vec::with_capacity(column_names.len());
            for column_name in column_names {
                if let Some(i) = table_columns
                    .iter()
                    .position(|col| col.name == *column_name)
                {
                    result.push(table_columns.swap_remove(i));
                } else {
                    return Err(Error::ColumnNotFound(column_name.to_string()));
                }
            }
            Ok(result)
        }
    }
}

#[cfg(test)]
mod test {
    use crate::infer::db::Column;
    use crate::infer::param::match_insert_columns;

    fn col(name: &str) -> Column {
        Column {
            nullable: false,
            name: name.to_string(),
            hidden: false,
            type_: 5,
        }
    }

    #[test]
    fn test_match_query_columns() {
        assert_eq!(
            match_insert_columns(&None, vec![col("foo"), col("bar")]).unwrap(),
            vec![col("foo"), col("bar")]
        )
    }
}

/// Returns None if DEFAULT VALUES was used
fn find_params_from_values(values: &ast::Values) -> Option<Vec<Vec<Option<usize>>>> {
    match values {
        ast::Values::DefaultValues => None,
        ast::Values::Values(vec) => Some(
            vec.iter()
                .map(|inner| {
                    inner
                        .iter()
                        .map(|value| match value {
                            ast::ValuesValue::Value(ast::Expression::Param(index)) => Some(*index),
                            _ => None,
                        })
                        .collect()
                })
                .collect(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use crate::ast;

    use super::find_params_from_values;

    #[test]
    fn test_find_params_for_values() {
        assert_eq!(find_params_from_values(&ast::Values::DefaultValues), None);
        assert_eq!(
            find_params_from_values(&ast::Values::Values(vec![
                vec![
                    ast::ValuesValue::Default,                          // => None
                    ast::ValuesValue::Value(ast::Expression::Param(1)), // => Some(1)
                    ast::ValuesValue::Value(ast::Expression::Constant(ast::Constant::True)) // => None
                ],
                vec![
                    ast::ValuesValue::Default // => None
                ]
            ])),
            Some(vec![vec![None, Some(1), None], vec![None]])
        );
    }
}

fn combine_param_nullability(
    target_columns: Vec<Column>,
    values_list_params: Vec<Vec<Option<usize>>>,
    params: &mut Vec<NamedValue>,
) {
    for values_params in values_list_params {
        for i in 0..values_params.len() {
            if let Some(param_index) = values_params[i] {
                let target_column = &target_columns[i];
                params[param_index - 1].nullable = target_column.nullable;
            }
        }
    }
}
