import * as R from 'ramda'
import { Pool } from 'pg'

type Schema = {
  tables: Map<string, Table>
  types: Map<string, Enum>
}

type Table = {
  name: string
  columns: Column[]
}

type Column = {
  name: string
  nullable: boolean
  type: string
}

type Enum = {
  name: string
  fields: string[]
}

export async function schema(connectionString: string): Promise<Schema> {
  const client = new Pool({ connectionString })

  const tables = await getTables(client)
  const types = await getTypes(client)
  client.end()

  return { tables, types }
}

async function getTables(client: Pool): Promise<Map<string, Table>> {
  const columns = (await client.query(
    `
SELECT table_name, column_name, is_nullable, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name
`
  )).rows as {
    table_name: string
    column_name: string
    is_nullable: string
    udt_name: string
  }[]
  return new Map(
    R.groupWith(R.eqProps('table_name'), columns).map(rows => [
      rows[0].table_name,
      {
        name: rows[0].table_name,
        columns: rows.map(row => ({
          name: row.column_name,
          nullable: row.is_nullable === 'YES',
          type: row.udt_name,
        })),
      },
    ])
  )
}

async function getTypes(client: Pool): Promise<Map<string, Enum>> {
  const result = (await client.query(`
SELECT oid, typname FROM pg_type WHERE typtype = 'e'
`)).rows as {
    oid: number
    typname: string
  }[]
  return new Map(
    await Promise.all(
      result.map(
        async (row): Promise<[string, Enum]> => [
          row.typname,
          {
            name: row.typname,
            fields: ((await client.query(
              `SELECT enumlabel FROM pg_enum WHERE enumtypid = $1 ORDER BY enumsortorder`,
              [row.oid]
            )).rows as { enumlabel: string }[]).map(row => row.enumlabel),
          },
        ]
      )
    )
  )
}
