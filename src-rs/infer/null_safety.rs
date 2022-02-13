#[derive(Debug, PartialEq)]
pub enum NullSafety {
    Safe,
    Unsafe,
    NeverNull,
}

pub fn operator_null_safety(_op: &str) -> NullSafety {
    // TODO
    NullSafety::Safe
}

pub fn builtin_function_null_safety(_func_name: &str) -> NullSafety {
    // TODO
    NullSafety::Safe
}
