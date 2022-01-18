mod cte;
mod expression;
mod insert;
mod join;
mod misc;
mod select;

pub use self::cte::*;
pub use self::expression::*;
pub use self::insert::*;
pub use self::join::*;
pub use self::misc::*;
pub use self::select::*;

#[derive(Debug)]
pub enum Query<'a> {
    Select(Select<'a>),
    Insert(Insert<'a>),
}

#[derive(Debug)]
pub struct AST<'a> {
    pub ctes: Option<Vec<WithQuery<'a>>>,
    pub query: Query<'a>,
}
