# Changelog

## 0.2.4

- **Enhancements**
  - Add support for `INSERT ... ON CONFLICT ...`

## 0.2.3

- **Enhancements**
  - Emit warnings about unknown SQL functions and operators (#18)

## 0.2.2

- **Enhancements**
  - More condensed console output (#14)
  - Don't write files if they're up to date (#13)
  - Add a comment noting that `.ts` files are generated (#12)
  - Infer parameter nullability correctly (#10)

## 0.2.1

- **Enhancements**

  - Infer the row count of a "calculator" SELECT statement as one
  - Support boolean, null and float constants
  - Support the CASE expression

- **Bug fixes**
  - Treat qualified and unqualified column as equal if the column name
    is the same
  - Param is not replaced correctly if it's used more than once

## 0.2.0

- Enhance nullability infering with logical operators (`AND`, `OR`, `NOT`)
- Add support for more functions and operators
  - Comparison
  - Mathimatical
  - Add support for string functions with special syntax
- Add `--check` CLI option
- Better warning messages

## 0.1.0

Initial release
