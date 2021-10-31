pub use tokio_postgres::types::Type;
use tokio_postgres::Column;

#[derive(Debug)]
pub struct StatementDescription {
    pub sql: String,
    pub params: Vec<NamedValue>,
    pub columns: Vec<NamedValue>,
    pub row_count: StatementRowCount,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum StatementRowCount {
    Zero,      // no output rows ever
    One,       // exatly one output row
    ZeroOrOne, // zero or one output row
    Many,      // zero or more output rows
}

#[derive(Debug, PartialEq, Eq)]
pub struct NamedValue {
    name: String,
    type_: Type,
    nullable: bool,
}

impl NamedValue {
    pub fn new(name: &str, type_: Type, nullable: bool) -> NamedValue {
        return NamedValue {
            name: String::from(name),
            type_,
            nullable,
        };
    }

    pub fn from_type(name: &str, type_: &Type) -> NamedValue {
        NamedValue {
            name: name.to_string(),
            type_: type_.clone(),
            nullable: true,
        }
    }

    pub fn from_column(column: &Column) -> NamedValue {
        NamedValue {
            name: column.name().to_string(),
            type_: column.type_().clone(),
            nullable: true,
        }
    }
}
