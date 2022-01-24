use std::borrow::Cow;

pub use tokio_postgres::types::Type;
use tokio_postgres::Column;

#[derive(Debug)]
pub struct StatementDescription<'a> {
    pub sql: Cow<'a, str>,
    pub params: Vec<NamedValue>,
    pub columns: Vec<NamedValue>,
    pub row_count: StatementRowCount,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StatementRowCount {
    Zero,      // no output rows ever
    One,       // exactly one output row
    ZeroOrOne, // zero or one output row
    Many,      // zero or more output rows
}

#[derive(Debug, PartialEq, Eq)]
pub struct NamedValue {
    pub name: String,
    pub type_: Type,
    pub nullable: bool,
}

impl NamedValue {
    pub fn new(name: &str, type_: Type, nullable: bool) -> NamedValue {
        NamedValue {
            name: String::from(name),
            type_,
            nullable,
        }
    }

    pub fn from_type(name: &str, type_: Type) -> NamedValue {
        NamedValue {
            name: name.to_string(),
            type_,
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

#[derive(Debug)]
pub struct Warning {
    pub summary: String,
    pub description: String,
}

#[derive(Debug)]
pub struct Warn<T> {
    pub payload: T,
    pub warnings: Vec<Warning>,
}

impl<T> Warn<T> {
    pub fn of(payload: T) -> Warn<T> {
        Warn {
            payload,
            warnings: vec![],
        }
    }

    pub fn warn<S1: Into<String>, S2: Into<String>>(
        payload: T,
        summary: S1,
        description: S2,
    ) -> Warn<T> {
        Warn {
            payload,
            warnings: vec![Warning {
                summary: summary.into(),
                description: description.into(),
            }],
        }
    }
}
