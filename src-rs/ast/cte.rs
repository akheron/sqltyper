use super::Ast;

#[derive(Debug)]
pub struct WithQuery<'a> {
    pub as_: &'a str,
    pub column_names: Option<Vec<&'a str>>,
    pub query: Box<Ast<'a>>,
}
