import { ClientBase } from '../pg'

export async function arrayTypes(
  client: ClientBase
): Promise<Array<{ oid: number; typelem: number }>> {
  const result = await client.query(`\
SELECT oid, typelem
FROM pg_catalog.pg_type
WHERE typlen = -1 AND typelem != 0 AND typarray = 0
`)
  return result.rows
}
