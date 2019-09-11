import { array } from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import { TaskEither, taskEither } from 'fp-ts/lib/TaskEither'

import { SchemaClient, Table } from './schema'
import * as ast from './ast'

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
): TaskEither<string, SourceTable[]> {
  if (from) {
    return array.traverse(taskEither)([from, ...from.joins], s =>
      getSourceTable(client, s)
    )
  }
  return async () => Either.right([])
}

function getSourceTable(
  client: SchemaClient,
  source: ast.From | ast.Join
): TaskEither<string, SourceTable> {
  return async () => {
    const table = await client.getTable(source.table)
    if (!table) return Either.left(tableRefToString(source.table))

    return Either.right({
      table,
      as: source.as ? source.as : table.name,
    })
  }
}
