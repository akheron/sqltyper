use lazy_static::lazy_static;
use regex::{Captures, Regex};
use std::fmt::{Display, Formatter};
use std::{borrow::Cow, collections::HashMap};

pub struct PreprocessedSql<'a> {
    pub sql: Cow<'a, str>,
    pub param_names: Vec<String>,
}

lazy_static! {
    static ref NAMED_PARAM: Regex =
        Regex::new(r"\$\{(?P<dname>[a-zA-Z]\w*)\}|(?P<prefix>[^:]):(?P<cname>[a-zA-Z]\w*)")
            .unwrap();
    static ref NUMBERED_PARAM: Regex = Regex::new(r"\$\d+").unwrap();
}

#[derive(Debug)]
pub enum Error {
    MixedParamStyles,
}

impl Display for Error {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::MixedParamStyles => write!(
                f,
                "Mixing positional params (e.g. $1) and named params (e.g. ${{foo}}) is not supported"
            ),
        }
    }
}

pub fn preprocess_sql(sql: &str) -> Result<PreprocessedSql, Error> {
    let has_named_params = NAMED_PARAM.is_match(sql);
    let has_numbered_params = NUMBERED_PARAM.is_match(sql);

    if has_named_params && has_numbered_params {
        Err(Error::MixedParamStyles)
    } else if has_named_params {
        Ok(handle_named_params(sql))
    } else if has_numbered_params {
        Ok(handle_numbered_params(sql))
    } else {
        Ok(PreprocessedSql {
            sql: Cow::Borrowed(sql),
            param_names: Vec::new(),
        })
    }
}

fn handle_named_params(sql: &str) -> PreprocessedSql {
    let mut param_numbers: HashMap<String, usize> = HashMap::new();
    let mut current: usize = 0;

    let processed_sql = NAMED_PARAM.replace_all(sql, |captures: &Captures| {
        let (prefix, capture) = if let Some(dname) = captures.name("dname") {
            ("", dname.as_str())
        } else {
            (
                captures.name("prefix").unwrap().as_str(),
                captures.name("cname").unwrap().as_str(),
            )
        };

        let param_number = param_numbers.get(capture);
        if let Some(num) = param_number {
            format!("{}${}", prefix, num)
        } else {
            current += 1;
            param_numbers.insert(capture.to_owned(), current);
            format!("{}${}", prefix, current)
        }
    });

    let mut params: Vec<(String, usize)> = param_numbers.into_iter().collect();
    params.sort_by(|a, b| a.1.cmp(&b.1));

    PreprocessedSql {
        sql: processed_sql,
        param_names: params.iter().map(|(k, _)| k.into()).collect(),
    }
}

fn handle_numbered_params(sql: &str) -> PreprocessedSql {
    let mut param_names: Vec<String> = NUMBERED_PARAM
        .find_iter(sql)
        .map(|m| String::from(m.as_str()))
        .collect();
    param_names.sort();

    PreprocessedSql {
        sql: Cow::Borrowed(sql),
        param_names,
    }
}

#[test]
fn test_preprocess_sql() {
    let fail = preprocess_sql("SELECT ${foo} $1");
    assert!(fail.is_err());

    let named = preprocess_sql("SELECT ${foo} :bar ${baz}::integer").unwrap();
    assert_eq!(named.sql, "SELECT $1 $2 $3::integer");
    assert_eq!(named.param_names, ["foo", "bar", "baz"]);

    let numbered = preprocess_sql("SELECT $2 $1::integer").unwrap();
    assert_eq!(numbered.sql, "SELECT $2 $1::integer");
    assert_eq!(numbered.param_names, ["$1", "$2"]);
}
