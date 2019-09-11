import * as R from 'ramda'
import { pipe } from 'fp-ts/lib/pipeable'
import { array } from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'

import * as ast from './ast'
import { Client } from './pg'
import { parse } from './parser'
import { SchemaClient, schemaClient } from './schema'
import { Statement } from './types'

import { SourceTable, getSourceTables } from './source'

export function inferStatementNullability(
  pgClient: Client,
  stmt: Statement
): TaskEither.TaskEither<string, Statement> {
  const parseResult = parse(stmt.sql)
  if (Either.isRight(parseResult)) {
    return pipe(
      inferColumnNullability(schemaClient(pgClient), parseResult.right),
      TaskEither.chain(columnNullability =>
        Task.of(applyColumnNullability(stmt, columnNullability))
      )
    )
  } else {
    console.warn(
      `WARNING: The internal SQL parser failed to parse the SQL \
statement. The inferred types may be inaccurate with respect to nullability.`
    )
    console.warn(`Parse error: ${parseResult.left.explain()}`)
    return Task.of(Either.right(stmt))
  }
}

type ColumnNullability = boolean[]

export function inferColumnNullability(
  client: SchemaClient,
  ast: ast.AST
): TaskEither.TaskEither<string, ColumnNullability> {
  return pipe(
    getSourceTables(client, ast.from),
    TaskEither.chain(sourceTables =>
      Task.of(
        pipe(
          ast.selectList.map(item =>
            inferSelectListItemNullability(sourceTables, item)
          ),
          array.sequence(Either.either),
          Either.map(R.flatten)
        )
      )
    )
  )
}

function applyColumnNullability(
  stmt: Statement,
  columnNullability: ColumnNullability
): Either.Either<string, Statement> {
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

function inferSelectListItemNullability(
  sourceTables: SourceTable[],
  selectListItem: ast.SelectListItem
): Either.Either<string, ColumnNullability> {
  if (ast.SelectListItem.isAllFields(selectListItem)) {
    return Either.right(
      pipe(
        sourceTables.map(sourceTable => sourceTable.table.columns),
        R.flatten,
        R.map(column => column.nullable)
      )
    )
  } else if (ast.SelectListItem.isAllTableFields(selectListItem)) {
    return pipe(
      findSourceTable(sourceTables, selectListItem.tableName),
      Either.map(sourceTable => sourceTable.table.columns),
      Either.map(columns => columns.map(column => column.nullable))
    )
  } else {
    return pipe(
      inferExpressionNullability(sourceTables, selectListItem.expression),
      Either.map(x => [x])
    )
  }
}

function inferExpressionNullability(
  sourceTables: SourceTable[],
  expression: ast.Expression
): Either.Either<string, boolean> {
  if (ast.Expression.isConstant(expression)) {
    // TODO: We only support number literals now
    return Either.right(false)
  } else if (ast.Expression.isPositional(expression)) {
    return Either.right(false)
  } else if (ast.Expression.isTableColumnRef(expression)) {
    return pipe(
      findSourceTableColumn(sourceTables, expression.table, expression.column),
      Either.map(column => column.nullable)
    )
  } else if (ast.Expression.isColumnRef(expression)) {
    return pipe(
      findSourceColumn(sourceTables, expression.column),
      Either.map(column => column.nullable)
    )
  } else if (ast.Expression.isUnaryOp(expression)) {
    return inferExpressionNullability(sourceTables, expression.expression)
  } else if (ast.Expression.isBinaryOp(expression)) {
    return (
      inferExpressionNullability(sourceTables, expression.lhs) ||
      inferExpressionNullability(sourceTables, expression.lhs)
    )
  } else if (ast.Expression.isFunctionCall(expression)) {
    return pipe(
      expression.argList.map(arg =>
        inferExpressionNullability(sourceTables, arg)
      ),
      array.sequence(Either.either),
      Either.map(R.any(R.identity))
    )
  } else {
    throw new Error('never reached')
  }
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
