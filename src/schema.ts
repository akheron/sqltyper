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

export type ArrayType = {
  oid: Oid
  elemType: Oid
}

export type SchemaClient = ReturnType<typeof schemaClient>

export function schemaClient(pgClient: Client) {
  function getTable(
    schemaName: string | null,
    tableName: string
  ): TaskEither.TaskEither<string, Table> {
    return async () => {
      const result = await sql.tableColumns(pgClient, {
        schemaName: schemaName || 'public',
        tableName,
      })
      if (result.length === 0) {
        return Either.left(
          `No such table: ${fullTableName(schemaName, tableName)}`
        )
      }
      return Either.right({
        name: tableName,
        columns: result.map(col => ({
          hidden: col.attnum < 0,
          name: col.attname,
          nullable: !col.attnotnull,
          type: col.atttypid,
        })),
      })
    }
  }

  async function getEnums(): Promise<Enum[]> {
    return (await sql.enums(pgClient)).map(row => ({
      oid: row.oid,
      name: row.typname,
      labels: row.labels,
    }))
  }

  async function getArrayTypes(): Promise<ArrayType[]> {
    return (await sql.arrayTypes(pgClient)).map(row => ({
      oid: row.oid,
      elemType: row.typelem,
    }))
  }

  return { getTable, getEnums, getArrayTypes }
}

function fullTableName(schemaName: string | null, tableName: string): string {
  return (schemaName ? schemaName + '.' : '') + tableName
}
