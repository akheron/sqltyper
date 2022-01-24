use crate::ast;
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
    ArraySubquery(Box<ast::SubquerySelect<'a>>),
    BinaryOp(Box<Expression<'a>>, &'a str, Box<Expression<'a>>),
    Case {
        branches: Vec<CaseBranch<'a>>,
        else_: Option<Box<Expression<'a>>>,
    },
    ColumnRef(&'a str),
    Constant(Constant<'a>),
    FunctionCall {
        schema: Option<&'a str>,
        function_name: &'a str,
        arg_list: Vec<Expression<'a>>,
        filter: Option<Box<Expression<'a>>>,
        window: Option<WindowDefinition<'a>>,
    },
    Param(usize),
    ScalarSubquery(Box<SubquerySelect<'a>>),
    TableColumnRef {
        table: &'a str,
        column: &'a str,
    },
}
