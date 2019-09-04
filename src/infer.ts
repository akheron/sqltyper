import * as R from 'ramda'

import * as ast from './ast'
import { SchemaClient, Table, Column } from './schema'

export type TsType = 'number' | 'string' | 'boolean'
export type Output = Map<string, TsType>

export type InferResult = {
  output: Output
  input: TsType[]
}

type Sources = Map<string, Table>

export type InferError = {
  kind: 'InferError'
  message: string
}

function error(message: string): InferError {
  return { kind: 'InferError', message }
}

export function isInferError(value: any): value is InferError {
  return value && value.kind === 'InferError'
}

export async function inferTypes(
  client: SchemaClient,
  statement: ast.AST
): Promise<InferResult | InferError> {
  const sources = await getDataSources(client, statement.from)
  if (isInferError(sources)) return sources

  const output: Output = new Map()
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
  //if (ast.Expression.isField(expr)) return expr.chain[expr.chain.length - 1]
  return `_${index}`
}

async function getDataSources(
  client: SchemaClient,
  from: ast.From | null
): Promise<Sources | InferError> {
  const result: Sources = new Map()
  if (!from) return result

  const sources = [
    {
      schema: 'public',
      tableName: from.table,
      sourceNames: aliases(from.table, from.as),
    },
    ...from.joins.map(join => ({
      schema: 'public',
      tableName: join.table,
      sourceNames: aliases(join.table, join.as),
    })),
  ]

  try {
    await Promise.all(
      sources.map(async ({ schema, tableName, sourceNames }) => {
        const table = await client.getTable(schema, tableName)
        if (!table)
          throw error(`No such table in database: ${schema}.${tableName}`)

        sourceNames.forEach(sourceName => result.set(sourceName, table))
      })
    )
  } catch (e) {
    return e as InferError
  }

  return result
}

function aliases(tableName: string, as: string | null) {
  return [tableName].concat(as ? [as] : [])
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
  } else if (ast.Expression.isIdentifier(expression)) {
    return error('TODO: identifiers')
    /*
    const chain = expression.chain
    if (chain.length === 1) {
      const columnName = chain[0]
      const column = findColumn(sources, columnName)
      if (!column) return error(`Unknown or ambiguous column: ${columnName}`)
      return pgTypeToTsType(column.type)
    } else if (chain.length === 2) {
      const [tableName, columnName] = chain
      const table = sources.get(tableName)
      if (!table) return error(`Unknown source table ${tableName}`)

      const idx = table.columns.findIndex(({ name }) => name === columnName)
      if (idx === -1)
        return error(`Unknown source column ${tableName}.${columnName}`)

      return pgTypeToTsType(table.columns[idx].type)
    } else {
      const chainStr = chain.join('.')
      return error(`Unsupported identifier chain longer than 2: ${chainStr}`)
    }
    */
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
