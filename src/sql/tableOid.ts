import { ClientBase } from '../pg'

export async function tableOid(
  client: ClientBase,
  params: { schemaName: string; tableName: string }
): Promise<{ oid: number } | null> {
  const result = await client.query(
    `\
SELECT c.oid
FROM pg_catalog.pg_class c
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE
    c.relkind = 'r'
    AND n.nspname = $1
    AND c.relname = $2
LIMIT 1
`,
    [params.schemaName, params.tableName]
  )
  return result.rows.length ? result.rows[0] : null
}
