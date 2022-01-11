use super::{Expression, TableRef, AST};

#[derive(Debug)]
pub enum JoinType {
    Inner,
    Left,
    Right,
    Full,
}

#[derive(Debug)]
pub enum JoinCondition<'a> {
    On(Expression<'a>),
    Using(Vec<&'a str>),
    Natural,
}

#[derive(Debug)]
pub enum TableExpression<'a> {
    Table {
        table: TableRef<'a>,
        as_: Option<&'a str>,
    },
    SubQuery {
        query: Box<AST<'a>>,
        as_: &'a str,
    },
    CrossJoin {
        left: Box<TableExpression<'a>>,
        right: Box<TableExpression<'a>>,
    },
    QualifiedJoin {
        left: Box<TableExpression<'a>>,
        join_type: JoinType,
        right: Box<TableExpression<'a>>,
        condition: JoinCondition<'a>,
    },
}
