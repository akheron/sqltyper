use super::{Expression, NamedWindowDefinition, OrderBy, TableExpression};

#[derive(Debug)]
pub enum Distinct<'a> {
    All,
    Distinct,
    Expression(Vec<Expression<'a>>),
}

#[derive(Debug)]
pub enum SelectListItem<'a> {
    // SELECT expr [ AS name ]
    SelectListExpression {
        expression: Expression<'a>,
        as_: Option<&'a str>,
    },

    // SELECT tbl.*
    AllTableFields {
        table_name: &'a str,
    },

    // SELECT *
    AllFields,
}

#[derive(Debug)]
pub struct SelectBody<'a> {
    pub distinct: Distinct<'a>,
    pub select_list: Vec<SelectListItem<'a>>,
    pub from: Option<TableExpression<'a>>,
    pub where_: Option<Expression<'a>>,
    pub group_by: Vec<Expression<'a>>,
    pub having: Option<Expression<'a>>,
    pub window: Vec<NamedWindowDefinition<'a>>,
}

#[derive(Debug)]
pub enum SelectOpType {
    Union,
    Intersect,
    Except,
}

#[derive(Debug)]
pub enum DuplicatesType {
    Distinct,
    All,
}

#[derive(Debug)]
pub struct SelectOp<'a> {
    pub op: SelectOpType,
    pub duplicates: DuplicatesType,
    pub select: SelectBody<'a>,
}

#[derive(Debug)]
pub struct Limit<'a> {
    pub count: Option<Expression<'a>>,
    pub offset: Option<Expression<'a>>,
}

#[derive(Debug)]
pub struct Select<'a> {
    pub body: SelectBody<'a>,
    pub set_ops: Vec<SelectOp<'a>>,
    pub order_by: Vec<OrderBy<'a>>,
    pub limit: Option<Limit<'a>>,
}
