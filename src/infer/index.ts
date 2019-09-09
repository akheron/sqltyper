import * as R from 'ramda'

import * as ast from '../ast'
import { SchemaClient, Table, Column } from '../schema'
import { InferError, error, isInferError } from './error'
import { getSourceTables } from './source'

export async function inferTypes(
  client: SchemaClient,
  statement: ast.AST
): Promise<Either<InferError, StatementType>> {
  const sourceTables = await getSourceTables(client, statement.from)
  if (isInferError(sourceTables)) return sourceTables

  const output: OutputTypes[]
  statement.selectlist.map((item, index) => {
    inferSelectListExpressionType(item.expression, sourceTables)
  })
  try {
    statement.selectList.forEach((item, index) => {
      const exprType = inferExpressionType(item.expression, sources)
      if (isInferError(exprType)) throw exprType

      const target = selectListTarget(item.as, item.expression, index)
      if (output.has(target))
        throw error(`${target} exists in output more than once`)

      output.set(target, exprType)
    })
  } catch (e) {
    return e as InferError
  }

  return { output, input: [] }
}

function selectListTarget(
  as: string | null,
  expr: ast.Expression,
  index: number
): string {
  if (as) return as
  if (
    (ast.Expression.isSchemaTableColumnRef(expr) ||
      ast.Expression.isTableColumnRef(expr) ||
      ast.Expression.isColumnRef(expr)) &&
    expr.column != '*'
  ) {
    return expr.column
  }
  return `_${index}`
}

function inferExpressionType(
  expression: ast.Expression,
  sources: Sources
): TsType | InferError {
  if (ast.Expression.isConstant(expression)) {
    // TODO: We only support number literals now
    return 'number'
  } else if (ast.Expression.isPositional(expression)) {
    return error('Positional parameter not allowed here')
  } else if (ast.Expression.isSchemaTableColumnRef(expression)) {
    return error('TODO: schema tables')
  } else if (ast.Expression.isTableColumnRef(expression)) {
    const table = sources.get(expression.table)
    if (!table) return error(`Unknown source table ${expression.table}`)

    if (expression.column === '*') return error('TODO: *')

    const idx = table.columns.findIndex(
      ({ name }) => name === expression.column
    )
    if (idx === -1)
      return error(
        `Unknown source column ${expression.table}.${expression.column}`
      )

    return pgTypeToTsType(table.columns[idx].type)
  } else if (ast.Expression.isColumnRef(expression)) {
    if (expression.column === '*') return error('TODO: *')
    const column = findColumn(sources, expression.column)
    if (!column)
      return error(`Unknown or ambiguous column: ${expression.column}`)
    return pgTypeToTsType(column.type)
  } else {
    return error('TODO: operators')
  }
}

function findColumn(sources: Sources, columnName: string): Column | null {
  const found = R.flatten(
    [...sources.entries()].map(([_, table]) => table.columns)
  ).filter(column => column.name === columnName)

  if (found.length !== 1) return null
  return found[0]
}

function pgTypeToTsType(pgType: string): TsType | InferError {
  switch (pgType) {
    case 'int4':
      return 'number'
    case 'varchar':
      return 'string'
    default:
      return error(`Unknown PostgreSQL type ${pgType}`)
  }
}
