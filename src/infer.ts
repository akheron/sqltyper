import * as R from 'ramda'
import { pipe } from 'fp-ts/lib/pipeable'
import { array } from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'

import * as ast from './ast'
import { parse } from './parser'
import { SchemaClient } from './schema'
import { StatementDescription, StatementRowCount } from './types'

import { SourceTable, getSourceTables, getSourceTable } from './source'

export function inferStatementNullability(
  schemaClient: SchemaClient,
  statement: StatementDescription
): TaskEither.TaskEither<string, StatementDescription> {
  return pipe(
    TaskEither.fromEither(parse(statement.sql)),
    TaskEither.chain(parseResult =>
      pipe(
        inferOutputNullability(schemaClient, statement, parseResult),
        TaskEither.map(stmt => inferSingleRow(stmt, parseResult))
      )
    ),
    TaskEither.orElse(parseErrorStr => {
      console.warn(
        `WARNING: The internal SQL parser failed to parse the SQL \
statement. The inferred types may be inaccurate with respect to nullability.`
      )
      // tslint-disable-next-line no-console
      console.warn(`Parse error: ${parseErrorStr}`)
      return TaskEither.right(statement)
    })
  )
}

export function inferOutputNullability(
  client: SchemaClient,
  statement: StatementDescription,
  tree: ast.AST
): TaskEither.TaskEither<string, StatementDescription> {
  return pipe(
    inferColumnNullability(client, tree),
    TaskEither.chain(columnNullability =>
      TaskEither.fromEither(
        applyColumnNullability(statement, columnNullability)
      )
    )
  )
}

type ColumnNullability = boolean[]

function inferColumnNullability(
  client: SchemaClient,
  tree: ast.AST
): TaskEither.TaskEither<string, ColumnNullability> {
  return pipe(
    ast.walk(tree, {
      select: ({ from, selectList }) =>
        pipe(
          getSourceTables(client, from),
          TaskEither.chain(sourceTables =>
            Task.of(inferSelectListNullability(sourceTables, selectList))
          )
        ),
      insert: ({ table, as, returning }) =>
        pipe(
          getSourceTable(client, null, table, as),
          TaskEither.chain(sourceTable =>
            Task.of(inferSelectListNullability([sourceTable], returning))
          )
        ),
      update: ({ table, as, from, returning }) =>
        pipe(
          getSourceTables(client, from),
          TaskEither.chain(sourceTables =>
            pipe(
              getSourceTable(client, null, table, as),
              TaskEither.map(t => [t, ...sourceTables])
            )
          ),
          TaskEither.chain(sourceTables =>
            Task.of(inferSelectListNullability(sourceTables, returning))
          )
        ),
      delete: ({ table, as, returning }) =>
        pipe(
          getSourceTable(client, null, table, as),
          TaskEither.chain(sourceTable =>
            Task.of(inferSelectListNullability([sourceTable], returning))
          )
        ),
    })
  )
}

function applyColumnNullability(
  stmt: StatementDescription,
  columnNullability: ColumnNullability
): Either.Either<string, StatementDescription> {
  if (columnNullability.length != stmt.columns.length) {
    return Either.left(`BUG: Non-equal number of columns: \
inferred ${columnNullability.length}, actual ${stmt.columns.length}`)
  }
  return Either.right({
    ...stmt,
    columns: R.zipWith(
      (column, nullable) => ({ ...column, nullable }),
      stmt.columns,
      columnNullability
    ),
  })
}

function inferSelectListNullability(
  sourceTables: SourceTable[],
  selectList: ast.SelectListItem[]
): Either.Either<string, ColumnNullability> {
  return pipe(
    selectList.map(item => inferSelectListItemNullability(sourceTables, item)),
    array.sequence(Either.either),
    Either.map(R.flatten)
  )
}

function inferSelectListItemNullability(
  sourceTables: SourceTable[],
  selectListItem: ast.SelectListItem
): Either.Either<string, ColumnNullability> {
  return ast.SelectListItem.walk(selectListItem, {
    allFields: () =>
      Either.right(
        pipe(
          sourceTables.map(sourceTable => sourceTable.table.columns),
          R.flatten,
          R.map(column => column.nullable)
        )
      ),

    allTableFields: ({ tableName }) =>
      pipe(
        findSourceTable(sourceTables, tableName),
        Either.map(sourceTable => sourceTable.table.columns),
        Either.map(columns => columns.map(column => column.nullable))
      ),

    selectListExpression: ({ expression }) =>
      pipe(
        inferExpressionNullability(sourceTables, expression),
        Either.map(x => [x])
      ),
  })
}

function inferExpressionNullability(
  sourceTables: SourceTable[],
  expression: ast.Expression
): Either.Either<string, boolean> {
  return ast.Expression.walk<Either.Either<string, boolean>>(expression, {
    // A column reference may evaluate to NULL if the column doesn't
    // have a NOT NULL constraint
    tableColumnRef: ({ table, column }) =>
      pipe(
        findSourceTableColumn(sourceTables, table, column),
        Either.map(column => column.nullable)
      ),

    // A column reference may evaluate to NULL if the column doesn't
    // have a NOT NULL constraint
    columnRef: ({ column }) =>
      pipe(
        findSourceColumn(sourceTables, column),
        Either.map(column => column.nullable)
      ),

    // A unary operator returns NULL if its operand is NULL
    unaryOp: ({ operand }) => inferExpressionNullability(sourceTables, operand),

    // A binary operator returns NULL if any of its operands is NULL
    binaryOp: ({ lhs, rhs }) =>
      inferExpressionNullability(sourceTables, lhs) ||
      inferExpressionNullability(sourceTables, rhs),

    // A function call returns NULL if any of its arguments is NULL
    functionCall: ({ argList }) =>
      pipe(
        argList.map(arg => inferExpressionNullability(sourceTables, arg)),
        array.sequence(Either.either),
        Either.map(R.any(R.identity))
      ),

    // A constant is never NULL
    constant: () => Either.right(false),

    // A positional parameter can be NULL
    positional: () => Either.right(true),
  })
}

function inferSingleRow(
  statement: StatementDescription,
  parseResult: ast.AST
): StatementDescription {
  const rowCount: StatementRowCount = ast.walk(parseResult, {
    select: ({ limit }) =>
      limit && limit.count && isConstantExprOf('1', limit.count)
        ? 'zeroOrOne' // LIMIT 1 => zero or one rows
        : 'many',

    insert: ({ values, returning }) =>
      ast.Values.walk(values, {
        // INSERT INTO xxx DEFAULT VALUES always creates a single row
        defaultValues: () => 'one',
        exprValues: exprValues =>
          returning.length
            ? // Check the length of the VALUES expression list
              exprValues.values.length === 1
              ? 'one'
              : 'many'
            : // No RETURNING, no output
              'zero',
      }),

    update: ({ returning }) =>
      returning.length
        ? 'many'
        : // No RETURNING, no output
          'zero',

    delete: ({ returning }) =>
      returning.length
        ? 'many'
        : // No RETURNING, no output
          'zero',
  })

  return { ...statement, rowCount }
}

function isConstantExprOf(expectedValue: string, expr: ast.Expression) {
  return ast.Expression.walkConstant(
    expr,
    false,
    ({ valueText }) => valueText === expectedValue
  )
}

function findSourceTable(sourceTables: SourceTable[], tableName: string) {
  return pipe(
    sourceTables.find(sourceTable => sourceTable.as === tableName),
    Either.fromNullable(`Unknown table ${tableName}`)
  )
}

function findSourceTableColumn(
  sourceTables: SourceTable[],
  tableName: string,
  columnName: string
) {
  return pipe(
    findSourceTable(sourceTables, tableName),
    Either.chain(table =>
      pipe(
        table.table.columns.find(column => column.name === columnName),
        Either.fromNullable(`Unknown column ${tableName}.${columnName}`)
      )
    )
  )
}

function findSourceColumn(sourceTables: SourceTable[], columnName: string) {
  return pipe(
    sourceTables.map(sourceTable => sourceTable.table.columns),
    R.flatten,
    R.find(column => column.name === columnName),
    Either.fromNullable(`Unknown column ${columnName}`)
  )
}
