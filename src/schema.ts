import * as Either from 'fp-ts/lib/Either'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { Client } from './pg'
import { Oid } from './types'

export type Table = {
  name: string
  columns: Column[]
}

export type Column = {
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
      const tblResult = await pgClient.query(
        `
SELECT c.oid
FROM pg_catalog.pg_class c
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE
    c.relkind = 'r'
    AND n.nspname = $1
    AND c.relname = $2
`,
        [schemaName || 'public', tableName]
      )
      if (tblResult.rowCount === 0)
        return Either.left(
          `No such table: ${fullTableName(schemaName, tableName)}`
        )
      const tableOid = tblResult.rows[0].oid

      const colResult = await pgClient.query(
        `
SELECT attname, atttypid, attnotnull
FROM pg_attribute
WHERE
    attrelid = $1
    AND attnum > 0
ORDER BY attnum
`,
        [tableOid]
      )

      const columns: {
        attname: string
        atttypid: Oid
        attnotnull: boolean
      }[] = colResult.rows

      return Either.right({
        name: tableName,
        columns: columns.map(col => ({
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
    FROM pg_enum e
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

export function setTableColumnsAsNullable(table: Table): Table {
  return {
    ...table,
    columns: table.columns.map(column => ({ ...column, nullable: true })),
  }
}
