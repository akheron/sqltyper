import { SchemaClient, Table } from '../schema'
import * as ast from '../ast'
import { InferError, error, isInferError, Failable } from './error'

export type SourceTable = {
  table: Table
  aliases: string[]
}

function tableRefToString(tableRef: ast.TableRef) {
  return `${tableRef.schema || 'public'}.{tableRef.table}`
}

export async function getSourceTables(
  client: SchemaClient,
  from: ast.From | null
): Promise<SourceTable[] | InferError> {
  if (!from) return []

  const sources = await Promise.all(
    [from, ...from.joins].map(s => getSourceTable(client, s))
  )

  const errors = sources.filter(isInferError)
  if (errors.length > 0) return error(errors.map(e => e.message).join(', '))

  return sources as SourceTable[]
}

async function getSourceTable(
  client: SchemaClient,
  source: ast.From | ast.Join
): Promise<SourceTable | InferError> {
  const table = await client.getTable(source.table)
  if (!table) return error(tableRefToString(source.table))

  return {
    table,
    aliases: [table.name, ...(source.as ? [source.as] : [])],
  }
}

export function findColumns(
  ref: ast.Expression.AnyColumnRef
): Failable<string[]> {
  // } else if (ast.Expression.isColumnRef(expression)) {
  //   if (expression.column === '*') return error('TODO: *')
  //   const column = findColumn(sources, expression.column)
  //   if (!column)
  //     return error(`Unknown or ambiguous column: ${expression.column}`)
  //   return pgTypeToTsType(column.type)
}
