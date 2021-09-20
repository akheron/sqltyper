# sqltyper - Type your SQL queries!

[![tests](https://github.com/akheron/sqltyper/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/akheron/sqltyper/actions/workflows/tests.yml)

SQL is a typed language, but most solutions for using an SQL database from typed
languages don't make use of that typing information in a way that would actually
help you catch bugs during development.

**sqltyper** takes raw PostgreSQL queries and generates TypeScript functions
that run those queries **AND** are typed correctly. The typings are generated by
analyzing the schema from a running database.

This way, your SQL queries and the TypeScript code that uses them are validated
at **compile time**. No more runtime errors because of SQL queries!

For example, assume your PostgreSQL database has a table like this:

```
 Table "person"

 Column      Type      Nullable
-----------+---------+----------
 name      | text    | not null
 age       | integer | not null
 shoe_size | integer | nullable
```

The following SQL query in `find-persons.sql`:

```sql
SELECT
  initcap(name) as name_capitalized,
  age,
  shoe_size
FROM person
WHERE
    name LIKE ${namePattern} AND
    age > ${minimumAge}
```

Converts to `find-persons.ts`:

```typescript
import { ClientBase } from 'pg'

interface ResultRow {
  name_capitalized: string
  age: number
  shoe_size: number | null
}

interface Params {
  namePattern: string
  minimumAge: number
}

export function findPersons(client: ClientBase, params: Params): Promise<ResultRow[]> {
  ...
}
```

sqltyper analyses the query without actually executing it, so it's perfectly
safe to use it with any query.

## Installation

```
npm install --save-dev sqltyper
```

The generated TypeScript code uses [node-postgres], [postgres.js], or
[pg-promise] to execute the queries, so either `pg`, `postgres`, or `pg-promise`
is a required runtime dependency:

```
npm install --save pg
# or
npm install --save postgres@beta
# or
npm install --save pg-promise
```

At the time of writing, you need to install the `@beta` verson of postgres.js to
get TypeScript support.

## Tutorial

Assuming you have a TypeScrip app and a bunch of SQL queries, put them in files
in a single directory, like this:

```
src/
|-- app.ts
|-- ...
`-- sqls/
    |-- my-query.sql
    `-- other-query.sql
```

In the SQL files, input parameters can be specified with either `${paramName}`
or `:paramName` syntax.

Run sqltyper on the `sqls` directory:

```
npx sqltyper --database postgres://user:pass@host/dbname src/sqls

# or yarn sqltyper, or ./node_modules/.bin/sqltyper, ...
```

sqltyper connects to the PostgreSQL database you give in the `--database`
option, finds out the input and output types of each of the SQL queries, and
outputs the corresponding TypeScript functions in the same directory.

You should now have the following files:

```
src/
|-- app.ts
|-- ...
`-- sqls/
    |-- index.ts
    |-- my-query.sql
    |-- my-query.ts
    |-- other-query.sql
    `-- other-query.ts
```

Each `.sql` file got a `.ts` file next to it. Each `.ts` file exports a single
function, whose name is the `.sql` file name with the extension removed and
camelCased. Furthermore, it generates an `index.ts` file that re-exports all
these functions.

In `app.ts`, import the SQL query functions:

```
import * as sql from './sql'
```

And that's it! Now you can use `sql.myQuery()` and `sql.otherQuery()` to run the
queries in a type-safe manner.

These functions take a `Client` or `Pool` from [node-postgres] as the first
argument, and possible query parameters as the second parameter.

They will return one of the following, wrapped in a `Promise`:

- An array of result objects, with object keys corresponding to output column
  names. Note that all of the output columns in your query must have a unique
  name, because otherwise some of them would be not accessible.

- A single result object or `null` if the query only ever returns zero or one
  row (e.g. `SELECT` query with `LIMIT 1`).

- A number which denotes the number of affected rows (e.g. `INSERT`, `UPDATE` or
  `DELETE` without a `RETURNING` clause).

## CLI

```
sqltyper [options] DIRECTORY...
```

Generate TypeScript functions for SQL statements in all files in the given
directories. For each input file, the output file name is generated by removing
the file extension and appending `.ts`.

Each output file will export a single function whose name is a camelCased
version of the basename of the input file.

sqltyper connects to the database to infer the parameter and output column types
of each SQL statement. It does this without actually executing the SQL queries,
so it's safe to run against any database.

Options:

`--database`, `-d`

Database URI to connect to, e.g. `-d postgres://user:pass@localhost:5432/mydb`.
If not given, uses the [connecting logic] of node-postgres that relies on [libpq
environment variables].

`--ext`, `-e`

File extensions to consider, e.g. `-e sql,psql`. Default: `sql`.

`--verbose`, `-v`

Give verbose output about problems with inferring statement nullability.
Default: `false`.

`--watch`, `-w`

Watch files and run the conversion when something changes. Default: `false`.

`--target`, `-t`

Whether to generate code for `pg` ([node-postgres]), `postgres` ([postgres.js]),
or `pg-promise` ([pg-promise]). Default: `pg`.

`--module`, `-m`

Where to import node-postgres or postgres.js from. Default: `pg` for
node-postgres, `postgres` for postgres.js.

`--pg-module` (deprecated)

Alias of `--module`.

`--check`,`-c`

Check whether all output files are up-to-date without actually updating them. If
they are, exit with status 0, otherwise exit with status 1. Useful for CI or
pre-commit hooks. Default: `false`.

`--prettify`, `-p`

Apply [prettier] to generated TypeScript files. [prettier] must be installed and
configured for your project. Default: `false`.

`--index`

Whether to generate and `index.ts` file that re-exports all the generated
functions. Default: `true`.

[connecting logic]: https://node-postgres.com/features/connecting
[libpq environment variables]:
  https://www.postgresql.org/docs/current/libpq-envars.html
[prettier]: https://prettier.io/

## How does it work?

sqltyper connects to your database to look up the schema: which types there are,
which tables there are, what columns and constraints the tables have, etc. The
only queries it executes look up this information from various `pg_catalog.*`
tables.

First, it substitutes any `${paramName}` and `:paramName` strings with `$1`,
`$2`, etc.

Then, it creates a prepared statement from the query, and then asks PostgreSQL
to describe the prepared statement. PostgreSQL will reply with parameter types
for `$1`, `$2`, etc., and columns types of the result rows.

However, this is not enough! In SQL basically anything anywhere can be `NULL`,
so if sqltyper stopped here all the types would have to be e.g.
`integer | null`, `string | null` and so on. For this reason, sqltyper also
parses the SQL query with its built-in SQL parser and then starts finding out
which expressions can never be `NULL`. It employs `NOT NULL` constraints,
nullability guarantees of functions and operators, `WHERE` clause expressions,
etc. to rule out as many possibilities of `NULL` as possible, and amends the
original statement description with this information.

It also uses the parsing result to find out the possible number of results. For
example, `UPDATE`, `DELETE` and `INSERT` queries without a `RETURNING` clause
will return the number of affected rows instead of any columns. Furthermore, a
`SELECT` query with `LIMIT 1` will resolve to `ResultRow | null` instead of
`ResultRow[]`.

Then, it outputs a TypeScript function that is correctly typed, and when run,
executes your query and converts input and output data to/from PostgreSQL.

## About versioning

sqltyper follows [semantic versioning](https://semver.org), but enhancements to
the parser and inferring logic are considered bug fixes, and thus only the patch
version is incremented for releases that only contain these changes. The
reasoning behind this is that all PostgreSQL syntax and semantics that sqltyper
fails to support is a bug.

Other enhancements, like adding more CLI options, code generation targets, etc.
are considered new features as usual.

## Prior art

The main motivator for sqltyper was [sqlτyped] by Joni Freeman. It does more or
less the same as sqltyper, but for Scala, and is designed to be used with MySQL.
It uses JDBC, and is implemented as a Scala macro rather than an offline code
generation tool.

## Releasing

```
$ yarn version --new-version <major|minor|patch>
$ yarn publish
$ git push origin main --tags
```

Open https://github.com/akheron/sqltyper/releases, edit the draft release,
select the newest version tag, adjust the description as needed.

[node-postgres]: https://node-postgres.com/
[postgres.js]: https://github.com/porsager/postgres
[pg-promise]: http://vitaly-t.github.io/pg-promise/
[sqlτyped]: https://github.com/jonifreeman/sqltyped
