use std::collections::HashMap;

use tokio_postgres::GenericClient;

use crate::ast;
use crate::infer::columns::get_output_columns;
use crate::infer::error::Error;
use crate::infer::param::NullableParams;
use crate::infer::source_columns::Column;

pub enum Context<'a> {
    Root,
    Derived {
        parent: &'a Context<'a>,
        virtual_tables: Option<HashMap<String, Vec<Column>>>,
    },
}

impl<'a> Context<'a> {
    pub fn root() -> Context<'a> {
        Context::Root
    }

    pub fn derive<'b>(parent: &'b Context<'b>) -> Context<'b> {
        Context::Derived {
            parent,
            virtual_tables: None,
        }
    }

    pub fn get_table(&self, table: &ast::TableRef) -> Option<&Vec<Column>> {
        match self {
            Context::Root => None,
            Context::Derived {
                parent,
                virtual_tables,
            } => match table.schema {
                Some(_) => None,
                None => match virtual_tables {
                    None => parent.get_table(table),
                    Some(v) => v.get(table.table).or_else(|| parent.get_table(table)),
                },
            },
        }
    }

    fn borrow_mut(&mut self) -> Option<ContextMutRef> {
        match self {
            Context::Root => None,
            Context::Derived { virtual_tables, .. } => Some(ContextMutRef(
                virtual_tables.get_or_insert_with(HashMap::new),
            )),
        }
    }
}

struct ContextMutRef<'a>(&'a mut HashMap<String, Vec<Column>>);

impl<'a> ContextMutRef<'a> {
    fn add_cte(&mut self, cte: &ast::WithQuery, columns: &[Column]) {
        self.0.insert(
            cte.as_.to_string(),
            match cte.column_names {
                None => columns
                    .iter()
                    .map(|column| Column {
                        name: column.name.to_string(),
                        nullability: column.nullability,
                    })
                    .collect(),
                Some(ref names) => columns
                    .iter()
                    .zip(names)
                    .map(|(column, name)| Column {
                        name: name.to_string(),
                        nullability: column.nullability,
                    })
                    .collect(),
            },
        );
    }
}

pub async fn get_context_for_ctes<'a, C: GenericClient + Sync>(
    client: &C,
    param_nullability: &NullableParams,
    parent: &'a Context<'a>,
    ctes_opt: &Option<Vec<ast::WithQuery<'_>>>,
) -> Result<Option<Context<'a>>, Error> {
    if let Some(ctes) = ctes_opt {
        let mut result = Context::derive(parent);
        for cte in ctes {
            // "Virtual tables" from previous WITH queries are available
            let columns =
                get_output_columns(client, &result, param_nullability, cte.query.as_ref()).await?;
            result.borrow_mut().unwrap().add_cte(cte, &columns);
        }
        Ok(Some(result))
    } else {
        Ok(None)
    }
}
