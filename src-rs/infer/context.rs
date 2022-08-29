use async_recursion::async_recursion;
use std::collections::HashMap;

use crate::ast;
use crate::infer::columns::{infer_column_nullability, Column, Columns};
use crate::infer::error::Error;
use crate::infer::param::NullableParams;
use crate::infer::schema_client::SchemaClient;

pub struct Context<'a> {
    pub client: &'a SchemaClient<'a>,
    pub param_nullability: &'a NullableParams,
    env: Env<'a>,
}

impl<'a> Context<'a> {
    pub fn new(client: &'a SchemaClient<'a>, param_nullability: &'a NullableParams) -> Self {
        Self {
            env: Env::new(),
            client,
            param_nullability,
        }
    }

    #[async_recursion]
    pub async fn for_ctes(
        parent: &'a Self,
        ctes_opt: &Option<Vec<ast::WithQuery<'_>>>,
    ) -> Result<Option<Self>, Error> {
        if let Some(ctes) = ctes_opt {
            let mut new_context = parent.derive();
            for cte in ctes {
                // "Virtual tables" from previous WITH queries are available
                let columns = infer_column_nullability(&new_context, cte.query.as_ref()).await?;
                new_context.env.borrow_mut().add_cte(cte, columns);
            }
            Ok(Some(new_context))
        } else {
            Ok(None)
        }
    }

    pub fn get_table(&self, table: &ast::TableRef) -> Option<&Columns> {
        self.env.get_table(table)
    }

    fn derive(&'a self) -> Self {
        Self {
            env: self.env.derive(),
            ..*self
        }
    }
}

pub struct Env<'a> {
    parent: Option<&'a Env<'a>>,
    virtual_tables: Option<HashMap<String, Columns>>,
}

impl<'a> Env<'a> {
    pub fn new() -> Self {
        Self {
            parent: None,
            virtual_tables: None,
        }
    }

    pub fn derive(&'a self) -> Self {
        Self {
            parent: Some(self),
            virtual_tables: None,
        }
    }

    fn get_table_from_parent(&self, table: &ast::TableRef) -> Option<&Columns> {
        self.parent.and_then(|p| p.get_table(table))
    }

    pub fn get_table(&self, table: &ast::TableRef) -> Option<&Columns> {
        match table.schema {
            Some(_) => None,
            None => match &self.virtual_tables {
                None => self.get_table_from_parent(table),
                Some(v) => v
                    .get(table.table)
                    .or_else(|| self.get_table_from_parent(table)),
            },
        }
    }

    fn borrow_mut(&mut self) -> EnvMutRef {
        EnvMutRef(self.virtual_tables.get_or_insert_with(HashMap::new))
    }
}

struct EnvMutRef<'a>(&'a mut HashMap<String, Columns>);

impl<'a> EnvMutRef<'a> {
    fn add_cte(&mut self, cte: &ast::WithQuery, columns: Columns) {
        self.0.insert(
            cte.as_.to_string(),
            match cte.column_names {
                None => columns
                    .into_iter()
                    .map(|mut column| Column {
                        name: std::mem::take(&mut column.name),
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
