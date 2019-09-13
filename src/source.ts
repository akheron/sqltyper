import { array } from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as TaskEither from 'fp-ts/lib/TaskEither'

import { SchemaClient, Table } from './schema'
import * as ast from './ast'
import { pipe } from 'fp-ts/lib/pipeable'

export type SourceTable = {
  table: Table
  as: string
}

export function getSourceTables(
  client: SchemaClient,
  from: ast.From | null
): TaskEither.TaskEither<string, SourceTable[]> {
  if (from) {
    return array.traverse(TaskEither.taskEither)([from, ...from.joins], s =>
      getSourceTable(client, s.table.schema, s.table.table, s.as)
    )
  }
  return async () => Either.right([])
}

export function getSourceTable(
  client: SchemaClient,
  schemaName: string | null,
  tableName: string,
  as: string | null
): TaskEither.TaskEither<string, SourceTable> {
  return pipe(
    client.getTable(schemaName, tableName),
    TaskEither.map(table => ({
      table,
      as: as || table.name,
    }))
  )
}
