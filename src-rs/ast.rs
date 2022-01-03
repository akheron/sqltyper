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
    ColumnRef(&'a str),
    TableColumnRef { table: &'a str, column: &'a str },
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
pub enum ConflictTarget<'a> {
    IndexColumns(Vec<&'a str>),
    Constraint(&'a str),
}

#[derive(Debug)]
pub enum ConflictAction<'a> {
    DoNothing,
    DoUpdate(Vec<UpdateAssignment<'a>>),
}

#[derive(Debug)]
pub struct OnConflict<'a> {
    pub conflict_target: Option<ConflictTarget<'a>>,
    pub conflict_action: ConflictAction<'a>,
}

#[derive(Debug)]
pub struct ExpressionAs<'a> {
    pub expr: Expression<'a>,
    pub as_: Option<&'a str>,
}

#[derive(Debug)]
pub enum Returning<'a> {
    AllColumns,
    Expressions(Vec<ExpressionAs<'a>>),
}

#[derive(Debug)]
pub struct Insert<'a> {
    // ctes: WithQuery[]
    pub table: TableRef<'a>,
    pub as_: Option<&'a str>,
    pub columns: Option<Vec<&'a str>>,
    pub values: Values<'a>,
    pub on_conflict: Option<OnConflict<'a>>,
    pub returning: Option<Returning<'a>>,
}

#[derive(Debug)]
pub struct UpdateAssignment<'a> {
    pub column: &'a str,
    pub value: Option<Expression<'a>>, // None means DEFAULT
}

#[derive(Debug)]
pub enum AST<'a> {
    Insert(Insert<'a>),
}
