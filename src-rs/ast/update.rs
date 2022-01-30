use crate::ast::{Expression, Returning, TableExpression, TableRef, UpdateAssignment};

#[derive(Debug)]
pub struct Update<'a> {
    pub table: TableRef<'a>,
    pub as_: Option<&'a str>,
    pub updates: Vec<UpdateAssignment<'a>>,
    pub from: Option<TableExpression<'a>>,
    pub where_: Option<Expression<'a>>,
    pub returning: Option<Returning<'a>>,
}
