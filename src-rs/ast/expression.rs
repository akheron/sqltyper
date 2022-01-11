#[derive(Debug)]
pub enum Constant<'a> {
    True,
    False,
    Null,
    Number(&'a str),
    String(&'a str),
}

#[derive(Debug)]
pub enum Expression<'a> {
    ColumnRef(&'a str),
    TableColumnRef { table: &'a str, column: &'a str },
    Constant(Constant<'a>),
    Param(usize),
    BinaryOp(Box<Expression<'a>>, &'a str, Box<Expression<'a>>),
}
