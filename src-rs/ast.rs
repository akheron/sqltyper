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

#[derive(Debug, Debug)]
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
pub struct Insert<'a> {
    // ctes: WithQuery[]
    pub table: TableRef<'a>,
    pub as_: Option<&'a str>,
    pub columns: Option<Vec<&'a str>>,
    pub values: Values<'a>,
    pub on_conflict: Option<OnConflict<'a>>,
    // returning: SelectListItem[]
}

pub struct UpdateAssignment<'a> {
    pub column: &'a str,
    pub value: Option<Expression<'a>>, // None means DEFAULT
}

#[derive(Debug)]
pub enum AST<'a> {
    Insert(Insert<'a>),
}
