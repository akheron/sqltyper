use super::{Expression, SelectListItem, SubquerySelect, TableRef, UpdateAssignment};

#[derive(Debug)]
pub enum ValuesValue<'a> {
    Default,
    Value(Expression<'a>),
}

#[derive(Debug)]
pub enum Values<'a> {
    DefaultValues,
    ExpressionValues(Vec<Vec<ValuesValue<'a>>>),
    Query(SubquerySelect<'a>),
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
pub struct Insert<'a> {
    pub table: TableRef<'a>,
    pub as_: Option<&'a str>,
    pub columns: Option<Vec<&'a str>>,
    pub values: Values<'a>,
    pub on_conflict: Option<OnConflict<'a>>,
    pub returning: Option<Vec<SelectListItem<'a>>>,
}