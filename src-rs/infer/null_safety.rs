#[derive(Debug, PartialEq)]
pub enum NullSafety {
    Safe,
    Unsafe,
    NeverNull,
}

pub fn operator_null_safety(op: &str) -> NullSafety {
    match op {
        // FALSE AND NULL evaluates to FALSE, TRUE OR NULL evaluates to TRUE, so these operators
        // ase unsafe. They're also not commutitave due to short-circuiting.
        "AND" | "OR" => NullSafety::Unsafe,

        "IS DISTINCT FROM"
        | "IS NOT DISTINCT FROM"
        | "IS NULL"
        | "IS NOT NULL"
        | "ISNULL"
        | "NOTNULL"
        | "IS TRUE"
        | "IS NOT TRUE"
        | "IS FALSE"
        | "IS NOT FALSE"
        | "IS UNKNOWN"
        | "IS NOT UNKNOWN" => NullSafety::NeverNull,

        _ => NullSafety::Safe,
    }
}

pub fn builtin_function_null_safety(function_name: &str) -> NullSafety {
    match function_name {
        // 9.2. Comparison Functions and Operators
        "num_nonnulls" | "num_nulls" => NullSafety::NeverNull,

        // 9.3. Mathematical Functions and Operators
        "pi" | "setseed" => NullSafety::NeverNull,

        // 9.4. String Functions and Operators
        "concat" | "concat_ws" | "pg_client_encoding" | "quote_nullable" => NullSafety::NeverNull,
        "format" => NullSafety::Safe, // TODO: NULL as 2nd parameter does not produce NULL

        // Not yet categorized
        "daterange" | "now" | "count" => NullSafety::NeverNull,

        _ => NullSafety::Safe,
    }
}
