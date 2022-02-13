use super::{Expression, Returning, TableRef};

#[derive(Debug)]
pub struct Delete<'a> {
    pub table: TableRef<'a>,
    pub as_: Option<&'a str>,
    pub where_: Option<Expression<'a>>,
    pub returning: Option<Returning<'a>>,
}
