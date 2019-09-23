import * as Either from 'fp-ts/lib/Either'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { Client } from './pg'
import { Oid } from './types'
import * as sql from './sql'

export type Table = {
  name: string
  columns: Column[]
}

export type Column = {
  hidden: boolean
  name: string
  nullable: boolean
  type: Oid
}

export type Enum = {
  oid: Oid
  name: string
  labels: string[]
}

export type SchemaClient = ReturnType<typeof schemaClient>

export function schemaClient(pgClient: Client) {
  function getTable(
    schemaName: string | null,
    tableName: string
  ): TaskEither.TaskEither<string, Table> {
    return async () => {
      const tblResult = await sql.tableOid(pgClient, {
        schemaName: schemaName || 'public',
        tableName,
      })
      if (tblResult == null)
        return Either.left(
          `No such table: ${fullTableName(schemaName, tableName)}`
        )

      const colResult = await sql.tableColumns(pgClient, {
        tableOid: tblResult.oid,
      })
      return Either.right({
        name: tableName,
        columns: colResult.map(col => ({
          hidden: col.attnum < 0,
          name: col.attname,
          nullable: !col.attnotnull,
          type: col.atttypid,
        })),
      })
    }
  }

  async function getEnums(): Promise<Enum[]> {
    const result = await pgClient.query<{
      oid: number
      typname: string
      labels: string[]
    }>(
      `
SELECT
  oid,
  typname,
  array(
    SELECT enumlabel
    FROM pg_catalog.pg_enum e
    WHERE e.enumtypid = t.oid
    ORDER BY e.enumsortorder
  )::text[] AS labels
FROM pg_type t
WHERE t.typtype = 'e'
`
    )

    return result.rows.map(row => ({
      oid: row.oid,
      name: row.typname,
      labels: row.labels,
    }))
  }

  return { getTable, getEnums }
}

function fullTableName(schemaName: string | null, tableName: string): string {
  return (schemaName ? schemaName + '.' : '') + tableName
}
