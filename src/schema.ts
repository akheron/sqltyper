import { ClientBase } from 'pg'
import * as ast from './ast'

export type Table = {
  name: string
  columns: Column[]
}

export type Column = {
  name: string
  nullable: boolean
  type: string
}

export type Enum = {
  name: string
  fields: string[]
}

export type SchemaClient = ReturnType<typeof schemaClient>

export function schemaClient(pgClient: ClientBase) {
  return {
    async getTable(tableRef: ast.TableRef): Promise<Table | null> {
      const result = await pgClient.query(
        `
SELECT column_name, is_nullable, udt_name
FROM information_schema.columns
WHERE table_schema = $1 AND table_name = $2
`,
        [tableRef.schema || 'public', tableRef.table]
      )
      if (result.rowCount === 0) return null

      const columns: {
        column_name: string
        is_nullable: string
        udt_name: string
      }[] = result.rows

      return {
        name: tableRef.table,
        columns: columns.map(col => ({
          name: col.column_name,
          nullable: col.is_nullable === 'YES',
          type: col.udt_name,
        })),
      }
    },

    async getType(typeName: string): Promise<Enum | null> {
      const result = await pgClient.query(
        `
SELECT oid FROM pg_type WHERE typtype = 'e' AND typname = $1
`,
        [typeName]
      )
      if (result.rowCount != 1) return null

      const oid: number = result.rows[0].oid

      const labels: { enumlabel: string }[] = (await pgClient.query(
        `SELECT enumlabel FROM pg_enum WHERE enumtypid = $1 ORDER BY enumsortorder`,
        [oid]
      )).rows

      return {
        name: typeName,
        fields: labels.map(row => row.enumlabel),
      }
    },
  }
}
