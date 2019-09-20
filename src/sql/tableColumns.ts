import { ClientBase } from '../pg'

export async function tableColumns(
  client: ClientBase,
  params: { tableOid: number }
): Promise<
  Array<{
    attnum: number
    attname: string
    atttypid: number
    attnotnull: boolean
  }>
> {
  const result = await client.query(
    `\
SELECT attnum, attname, atttypid, attnotnull
FROM pg_catalog.pg_attribute
WHERE attrelid = $1
ORDER BY attnum
`,
    [params.tableOid]
  )
  return result.rows
}
