use lazy_static::lazy_static;
use regex::{Captures, Regex};
use std::collections::HashMap;

pub struct PreprocessedSql {
    pub sql: String,
    pub param_names: Vec<String>,
}

lazy_static! {
    static ref NAMED_PARAM: Regex =
        Regex::new(r"\$\{(?P<dname>[a-zA-Z]\w*)\}|(?P<prefix>[^:]):(?P<cname>[a-zA-Z]\w*)")
            .unwrap();
    static ref NUMBERED_PARAM: Regex = Regex::new(r"\$\d+").unwrap();
}

pub fn preprocess_sql(sql: &str) -> Result<PreprocessedSql, &'static str> {
    let has_named_params = NAMED_PARAM.is_match(sql);
    let has_numbered_params = NUMBERED_PARAM.is_match(sql);

    if has_named_params && has_numbered_params {
        Err("Cannot mix named parameters (e.g. ${foo}, :foo) and numbered parameters (e.g. $1) in the same statement")
    } else if has_named_params {
        Ok(handle_named_params(sql))
    } else if has_numbered_params {
        Ok(handle_numbered_params(sql))
    } else {
        Ok(PreprocessedSql {
            sql: sql.to_owned(),
            param_names: vec![],
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
        sql: String::from(processed_sql),
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
        sql: sql.to_string(),
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
