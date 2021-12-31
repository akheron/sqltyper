#[derive(Debug)]
pub struct TableRef<'a> {
    pub schema: Option<&'a str>,
    pub table: &'a str,
}

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
    Foo,
    Constant(Constant<'a>),
    Param(&'a str),
    BinaryOp(Box<Expression<'a>>, &'a str, Box<Expression<'a>>),
}

#[derive(Debug)]
pub enum ValuesValue<'a> {
    Default,
    Value(Expression<'a>),
}

#[derive(Debug)]
pub enum Values<'a> {
    DefaultValues,
    Values(Vec<Vec<ValuesValue<'a>>>),
}

#[derive(Debug)]
pub struct Insert<'a> {
    // ctes: WithQuery[]
    pub table: TableRef<'a>,
    pub as_: Option<&'a str>,
    pub columns: Option<Vec<&'a str>>,
    pub values: Values<'a>, // | Select
                            // onConflict: UpdateAssignment[]
                            // returning: SelectListItem[]
}

#[derive(Debug)]
pub enum AST<'a> {
    Insert(Insert<'a>),
}
