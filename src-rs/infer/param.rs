use std::collections::HashMap;

// use crate::parser::ast;

#[derive(Debug)]
pub struct ParamNullability(HashMap<u32, bool>);

impl ParamNullability {
    fn new() -> ParamNullability {
        return ParamNullability(HashMap::new());
    }

    fn put(&mut self, param_index: u32, nullable: bool) {
        self.0.insert(param_index, nullable);
    }

    /// is_nullable(n) tells whether $n is nullable
    pub fn is_nullable(&self, param_index: u32) -> &bool {
        self.0.get(&param_index).unwrap_or(&true)
    }
}

// pub fn infer_param_nullability(statement: &ast::Statement) -> ParamNullability {
//     let mut result = ParamNullability::new();
//     match statement {
//         ast::Statement::Insert {
//             table_name,
//             columns,
//             source,
//             ..
//         } => {
//             let num_columns = columns.len();
//             match &**source {
//                 ast::Query {
//                     body: ast::SetExpr::Values(values),
//                     ..
//                 } => {
//                     println!("{}", values);
//                 }
//                 _ => {}
//             };
//         }
//         ast::Statement::Update {
//             table_name,
//             assignments,
//             ..
//         } => {}
//         _ => {}
//     }
//     result
// }

// fn find_params_from_values() {}
