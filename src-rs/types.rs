use std::borrow::Cow;

pub use tokio_postgres::types::{Kind, Type};
use tokio_postgres::Column;

#[derive(Debug)]
pub struct StatementDescription<'a> {
    pub sql: Cow<'a, str>,
    pub params: Vec<UnnamedValue>,
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

#[derive(Debug, Clone, PartialEq)]
pub enum ValueType {
    Any(Type),
    Array { type_: Type, elem_nullable: bool },
}

impl ValueType {
    fn from_type(type_: &Type) -> Self {
        match type_.kind() {
            Kind::Array(elem) => ValueType::Array {
                type_: elem.clone(),
                elem_nullable: true,
            },
            _ => ValueType::Any(type_.clone()),
        }
    }

    pub fn lift_to_array(&self, elem_nullable: bool) -> Self {
        match self {
            ValueType::Any(type_) => ValueType::Array {
                type_: type_.clone(),
                elem_nullable,
            },
            x => x.clone(),
        }
    }
}

impl AsRef<Type> for ValueType {
    fn as_ref(&self) -> &Type {
        match self {
            ValueType::Any(type_) => type_,
            ValueType::Array { type_, .. } => type_,
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct UnnamedValue {
    pub type_: ValueType,
    pub nullable: bool,
}

impl UnnamedValue {
    pub fn new(type_: Type, nullable: bool) -> UnnamedValue {
        UnnamedValue {
            type_: ValueType::Any(type_),
            nullable,
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct NamedValue {
    pub name: String,
    pub type_: ValueType,
    pub nullable: bool,
}

impl NamedValue {
    pub fn new(name: &str, type_: Type, nullable: bool) -> NamedValue {
        NamedValue {
            name: String::from(name),
            type_: ValueType::Any(type_),
            nullable,
        }
    }

    pub fn from_type(name: &str, type_: Type) -> NamedValue {
        NamedValue {
            name: name.to_string(),
            type_: ValueType::Any(type_),
            nullable: true,
        }
    }

    pub fn from_column(column: &Column) -> NamedValue {
        NamedValue {
            name: column.name().to_string(),
            type_: ValueType::from_type(column.type_()),
            nullable: true,
        }
    }
}

#[derive(Debug, PartialEq)]
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
