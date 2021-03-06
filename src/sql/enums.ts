// Generated by sqltyper from enums.sql.
// Do not edit directly. Instead, edit enums.sql and re-run sqltyper.

import * as postgres from '../postgres'

export async function enums(
  sql: postgres.Sql<{}>
): Promise<Array<{ oid: number; typname: string; labels: Array<string> }>> {
  const result = await sql.unsafe(`SELECT
  oid,
  typname,
  array(
    SELECT enumlabel
    FROM pg_catalog.pg_enum e
    WHERE e.enumtypid = t.oid
    ORDER BY e.enumsortorder
  )::text[] AS labels
FROM pg_catalog.pg_type t
WHERE t.typtype = 'e'
`)
  return result
}
