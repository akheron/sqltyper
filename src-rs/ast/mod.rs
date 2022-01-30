mod common;
mod cte;
mod expression;
mod insert;
mod join;
mod select;
mod update;

pub use self::common::*;
pub use self::cte::*;
pub use self::expression::*;
pub use self::insert::*;
pub use self::join::*;
pub use self::select::*;
pub use self::update::*;

#[derive(Debug)]
pub enum Query<'a> {
    Select(Select<'a>),
    Insert(Insert<'a>),
    Update(Update<'a>),
}

#[derive(Debug)]
pub struct AST<'a> {
    pub ctes: Option<Vec<WithQuery<'a>>>,
    pub query: Query<'a>,
}
