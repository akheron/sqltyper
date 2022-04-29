pub use crate::infer::AnalyzeStatus;
use postgres_types::Oid;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct StatementDescription {
    pub sql: String,
    pub params: Vec<Type>,
    pub columns: Vec<Field>,
    pub row_count: RowCount,
    pub analyze_status: AnalyzeStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RowCount {
    Zero,      // no output rows ever
    One,       // exactly one output row
    ZeroOrOne, // zero or one output row
    Many,      // zero or more output rows
}

type PgType = tokio_postgres::types::Type;
type PgKind = tokio_postgres::types::Kind;
type PgField = tokio_postgres::types::Field;
type PgColumn = tokio_postgres::Column;

#[derive(Debug, PartialEq, Serialize)]
pub struct Type {
    pub schema: String,
    pub name: String,
    pub nullable: bool,
    pub oid: Oid,
    pub kind: Box<Kind>,
}

impl Type {
    pub fn from_pg(type_: &PgType, nullable: bool) -> Self {
        Self {
            schema: type_.schema().to_string(),
            name: type_.name().to_string(),
            oid: type_.oid(),
            kind: Box::new(Kind::from_pg(type_.kind())),
            nullable,
        }
    }
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "variant", rename_all = "snake_case")]
pub enum Kind {
    Simple,
    Enum { values: Vec<String> },
    Pseudo,
    Array { element_type: Type },
    Range { subtype: Type },
    Domain { underlying_type: Type },
    Composite { fields: Vec<Field> },
}

impl Kind {
    pub fn from_pg(kind: &PgKind) -> Self {
        match kind {
            PgKind::Enum(variants) => Self::Enum {
                values: variants.clone(),
            },
            PgKind::Pseudo => Self::Pseudo,
            PgKind::Array(elem) => Self::Array {
                element_type: Type::from_pg(elem, true),
            },
            PgKind::Range(subtype) => Self::Range {
                subtype: Type::from_pg(subtype, false),
            },
            PgKind::Domain(underlying_type) => Self::Domain {
                underlying_type: Type::from_pg(underlying_type, false),
            },
            PgKind::Composite(fields) => Self::Composite {
                fields: fields
                    .iter()
                    .map(|field| Field {
                        name: field.name().to_string(),
                        type_: Type::from_pg(field.type_(), true),
                    })
                    .collect(),
            },

            // PostgresKind is #[non_exhaustive], so there must be a match-all arm
            _ => Self::Simple,
        }
    }
}

#[derive(Debug, PartialEq, Serialize)]
pub struct Field {
    pub name: String,

    #[serde(rename = "type")]
    pub type_: Type,
}

impl Field {
    pub fn from_pg_field(field: &PgField) -> Self {
        Self {
            name: field.name().to_string(),
            type_: Type::from_pg(field.type_(), false),
        }
    }

    pub fn from_pg_column(column: &PgColumn) -> Self {
        Self {
            name: column.name().to_string(),
            type_: Type::from_pg(column.type_(), false),
        }
    }
}
