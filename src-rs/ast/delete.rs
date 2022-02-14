use super::{Expression, SelectListItem, TableRef};

#[derive(Debug)]
pub struct Delete<'a> {
    pub table: TableRef<'a>,
    pub as_: Option<&'a str>,
    pub where_: Option<Expression<'a>>,
    pub returning: Option<Vec<SelectListItem<'a>>>,
}
