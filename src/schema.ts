import * as R from 'ramda'
import { Client } from './pg'
import * as ast from './ast'
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

export type PGFunction = {
  name: string
  kind: 'function' | 'procedure' | 'aggregate' | 'window'
  signatures: {
    paramTypes: Oid[]
    paramsWithDefaults: number
    returnType: Oid
  }[]
}

export type OperatorSignature =
  | {
      kind: 'infix'
      leftType: Oid
      rightType: Oid
    }
  | {
      kind: 'prefix'
      rightType: Oid
    }
  | {
      kind: 'postfix'
      leftType: Oid
    }

export type Operator = {
  name: string
  signatures: OperatorSignature[]
}

export type Enum = {
  oid: Oid
  name: string
  labels: string[]
}

export type SchemaClient = ReturnType<typeof schemaClient>

export function schemaClient(pgClient: Client) {
  return {
    async getTable(tableRef: ast.TableRef): Promise<Table | null> {
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
        [tableRef.schema || 'public', tableRef.table]
      )
      if (tblResult.rowCount === 0) return null
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

      return {
        name: tableRef.table,
        columns: columns.map(col => ({
          name: col.attname,
          nullable: !col.attnotnull,
          type: col.atttypid,
        })),
      }
    },

    async getFunctions(): Promise<PGFunction[]> {
      const { rows } = await pgClient.query<{
        proname: string
        nspname: string
        prokind: 'f' | 'p' | 'a' | 'w'
        prorettype: Oid
        pronargdefaults: number
        proargtypes: string
      }>(
        `
SELECT
    proname,
    prokind,
    prorettype,
    pronargs,
    pronargdefaults,
    proargtypes
FROM pg_catalog.pg_proc p
ORDER BY proname
`
      )

      return R.groupWith(R.eqProps('proname'), rows).map(funcs => ({
        name: funcs[0].proname,
        kind: toFunctionKind(funcs[0].prokind),
        signatures: funcs.map(func => ({
          paramTypes: func.proargtypes.split(/\s+/).map(Number),
          paramsWithDefaults: func.pronargdefaults,
          returnType: func.prorettype,
        })),
      }))
    },

    async getOperators(): Promise<Operator[]> {
      const { rows } = await pgClient.query<{
        oprname: string
        oprkind: 'b' | 'l' | 'r'
        oprleft: Oid | null
        oprright: Oid | null
        oprresult: Oid
      }>(`
SELECT
  oprname,
  oprkind,
  oprleft,
  oprright,
  oprresult
FROM pg_operator
`)
      return R.groupWith(R.eqProps('oprname'), rows).map(opers => ({
        name: opers[0].oprname,
        signatures: opers.map(oper => {
          switch (oper.oprkind) {
            case 'b':
              return {
                kind: 'infix',
                leftType: oper.oprleft as Oid,
                rightType: oper.oprright as Oid,
              }
            case 'l':
              return {
                kind: 'prefix',
                rightType: oper.oprright as Oid,
              }
            case 'r':
              return {
                kind: 'postfix',
                leftType: oper.oprleft as Oid,
              }
          }
        }),
      }))
    },

    async getEnums(): Promise<Enum[]> {
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
    },
  }
}

function toFunctionKind(kind: 'f' | 'p' | 'a' | 'w'): PGFunction['kind'] {
  switch (kind) {
    case 'f':
      return 'function'
    case 'p':
      return 'procedure'
    case 'a':
      return 'aggregate'
    case 'w':
      return 'window'
  }
}
