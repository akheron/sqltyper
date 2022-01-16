use super::Expression;
use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub struct TableRef<'a> {
    pub schema: Option<&'a str>,
    pub table: &'a str,
}

impl<'a> Display for TableRef<'a> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        if let Some(schema) = self.schema {
            write!(f, "{}.{}", schema, self.table)
        } else {
            write!(f, "{}", self.table)
        }
    }
}

#[derive(Debug)]
pub struct UpdateAssignment<'a> {
    pub column: &'a str,
    pub value: Option<Expression<'a>>, // None means DEFAULT
}

#[derive(Debug)]
pub struct WindowDefinition<'a> {
    pub existing_window_name: Option<&'a str>,
    pub partition_by: Option<Vec<Expression<'a>>>,
    pub order_by: Option<Vec<OrderBy<'a>>>,
}

#[derive(Debug)]
pub struct NamedWindowDefinition<'a> {
    pub name: &'a str,
    pub window: WindowDefinition<'a>,
}

#[derive(Debug)]
pub enum Order<'a> {
    Asc,
    Desc,
    Using(&'a str),
}

#[derive(Debug)]
pub enum Nulls {
    First,
    Last,
}

#[derive(Debug)]
pub struct OrderBy<'a> {
    pub expression: Expression<'a>,
    pub order: Option<Order<'a>>,
    pub nulls: Option<Nulls>,
}
