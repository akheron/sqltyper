// Generated by sqltyper from functions.sql.
// Do not edit directly. Instead, edit functions.sql and re-run sqltyper.

import * as postgres from '../postgres'

export async function functions(
  sql: postgres.Sql<{}>
): Promise<Array<{ nspname: string; proname: string }>> {
  const result = await sql.unsafe(`SELECT n.nspname, p.proname
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON (n.oid = p.pronamespace)
WHERE p.prokind = 'f'
`)
  return result
}