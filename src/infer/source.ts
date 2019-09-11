import { SchemaClient, Table } from '../schema'
import * as ast from '../ast'
import { InferError, fail, ok } from './error'
import { TaskEither, taskEither } from 'fp-ts/lib/TaskEither'
import { array } from 'fp-ts/lib/Array'

export type SourceTable = {
  table: Table
  as: string
}

function tableRefToString(tableRef: ast.TableRef) {
  return `${tableRef.schema || 'public'}.{tableRef.table}`
}

export function getSourceTables(
  client: SchemaClient,
  from: ast.From | null
): TaskEither<InferError, SourceTable[]> {
  if (from) {
    return array.traverse(taskEither)([from, ...from.joins], s =>
      getSourceTable(client, s)
    )
  }
  return async () => ok([])
}

function getSourceTable(
  client: SchemaClient,
  source: ast.From | ast.Join
): TaskEither<InferError, SourceTable> {
  return async () => {
    const table = await client.getTable(source.table)
    if (!table) return fail(tableRefToString(source.table))

    return ok({
      table,
      as: source.as ? source.as : table.name,
    })
  }
}

/*
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
*/
