mod expression;
mod insert;
mod join;
mod misc;
mod select;

pub use self::expression::*;
pub use self::insert::*;
pub use self::join::*;
pub use self::misc::*;
pub use self::select::*;

#[derive(Debug)]
pub enum AST<'a> {
    Select(Select<'a>),
    Insert(Insert<'a>),
}
