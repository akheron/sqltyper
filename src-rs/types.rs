use postgres_types::Oid;
use std::borrow::Cow;

use super::infer;

#[derive(Debug)]
pub struct StatementDescription<'a> {
    pub sql: Cow<'a, str>,
    pub params: Vec<Type>,
    pub columns: Vec<Field>,
    pub row_count: RowCount,
    pub analyze_error: Option<infer::Error>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RowCount {
    Zero,      // no output rows ever
    One,       // exactly one output row
    ZeroOrOne, // zero or one output row
    Many,      // zero or more output rows
}

type PostgresType = tokio_postgres::types::Type;
type PostgresKind = tokio_postgres::types::Kind;
type PostgresField = tokio_postgres::types::Field;
type PostgresColumn = tokio_postgres::Column;

#[derive(Debug, PartialEq)]
pub struct Type {
    pub schema: String,
    pub name: String,
    pub oid: Oid,
    pub kind: Box<Kind>,
    pub nullable: bool,
}

impl Type {
    pub fn from_postgres(type_: &PostgresType, nullable: bool) -> Self {
        Self {
            schema: type_.schema().to_string(),
            name: type_.name().to_string(),
            oid: type_.oid(),
            kind: Box::new(Kind::from_postgres(type_.kind())),
            nullable,
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum Kind {
    Simple,
    Enum(Vec<String>),
    Pseudo,
    Array(Type),
    Range(Type),
    Domain(Type),
    Composite(Vec<Field>),
}

impl Kind {
    pub fn from_postgres(kind: &PostgresKind) -> Self {
        match kind {
            PostgresKind::Simple => Self::Simple,
            PostgresKind::Enum(variants) => Self::Enum(variants.clone()),
            PostgresKind::Pseudo => Self::Pseudo,
            PostgresKind::Array(elem) => Self::Array(Type::from_postgres(elem, true)),
            PostgresKind::Range(elem) => Self::Range(Type::from_postgres(elem, false)),
            PostgresKind::Domain(elem) => Self::Range(Type::from_postgres(elem, false)),
            // TODO
            _ => Self::Simple,
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct Field {
    pub name: String,
    pub type_: Type,
}

impl Field {
    pub fn from_postgres_field(field: &PostgresField) -> Self {
        Self {
            name: field.name().to_string(),
            type_: Type::from_postgres(field.type_(), false),
        }
    }

    pub fn from_postgres_column(column: &PostgresColumn) -> Self {
        Self {
            name: column.name().to_string(),
            type_: Type::from_postgres(column.type_(), false),
        }
    }
}
