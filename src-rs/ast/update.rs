use crate::ast::{Expression, SelectListItem, TableExpression, TableRef, UpdateAssignment};

#[derive(Debug)]
pub struct Update<'a> {
    pub table: TableRef<'a>,
    pub as_: Option<&'a str>,
    pub updates: Vec<UpdateAssignment<'a>>,
    pub from: Option<TableExpression<'a>>,
    pub where_: Option<Expression<'a>>,
    pub returning: Option<Vec<SelectListItem<'a>>>,
}
