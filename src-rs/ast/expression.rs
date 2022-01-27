use crate::ast::{SubquerySelect, WindowDefinition};

#[derive(Clone, Debug)]
pub enum Constant<'a> {
    True,
    False,
    Null,
    Number(&'a str),
    String(&'a str),
}

#[derive(Debug)]
pub struct CaseBranch<'a> {
    pub condition: Expression<'a>,
    pub result: Expression<'a>,
}

#[derive(Debug)]
pub enum Expression<'a> {
    AnySomeAllSubquery {
        lhs: Box<Expression<'a>>,
        op: &'a str,
        comparison: &'a str,
        subquery: Box<SubquerySelect<'a>>,
    },
    AnySomeAllArray {
        lhs: Box<Expression<'a>>,
        op: &'a str,
        comparison: &'a str,
        rhs: Box<Expression<'a>>,
    },
    ArraySubquery(Box<SubquerySelect<'a>>),
    BinaryOp(Box<Expression<'a>>, &'a str, Box<Expression<'a>>),
    Case {
        branches: Vec<CaseBranch<'a>>,
        else_: Option<Box<Expression<'a>>>,
    },
    ColumnRef(&'a str),
    Constant(Constant<'a>),
    Exists(Box<SubquerySelect<'a>>),
    FunctionCall {
        schema: Option<&'a str>,
        function_name: &'a str,
        arg_list: Vec<Expression<'a>>,
        filter: Option<Box<Expression<'a>>>,
        window: Option<WindowDefinition<'a>>,
    },
    InSubquery {
        lhs: Box<Expression<'a>>,
        op: &'a str,
        subquery: Box<SubquerySelect<'a>>,
    },
    InExprList {
        lhs: Box<Expression<'a>>,
        op: &'a str,
        expr_list: Vec<Expression<'a>>,
    },
    Param(usize),
    ScalarSubquery(Box<SubquerySelect<'a>>),
    TableColumnRef {
        table: &'a str,
        column: &'a str,
    },
    TernaryOp {
        lhs: Box<Expression<'a>>,
        op: &'a str,
        rhs1: Box<Expression<'a>>,
        rhs2: Box<Expression<'a>>,
    },
    UnaryOp {
        op: &'a str,
        expr: Box<Expression<'a>>,
    },
    TypeCast {
        lhs: Box<Expression<'a>>,
        target_type: &'a str,
    },
}
