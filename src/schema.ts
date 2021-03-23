import * as Either from 'fp-ts/lib/Either'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'
import * as postgres from './postgres'
import { NullSafety, Oid, SqlFunction } from './types'
import * as sql from './sql'
import { builtinFunctionNullSafety } from './const-utils'
import { asyncCached } from './func-utils'

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

export interface SchemaClient {
  getTable(
    schemaName: string | null,
    tableName: string
  ): TaskEither.TaskEither<string, Table>
  getEnums(): Promise<Enum[]>
  getArrayTypes(): Promise<ArrayType[]>
  getFunction(
    schemaName: string | null,
    functionName: string
  ): TaskEither.TaskEither<string, SqlFunction>
  functionNullSafety(
    schemaName: string | null,
    functionName: string
  ): Task.Task<NullSafety | null>
}

export function schemaClient(postgresClient: postgres.Sql<{}>): SchemaClient {
  const getTable = (
    schemaName: string | null,
    tableName: string
  ): TaskEither.TaskEither<string, Table> => async () => {
    const result = await sql.tableColumns(postgresClient, {
      schemaName: schemaName || 'public',
      tableName,
    })
    if (result.length === 0) {
      return Either.left(`No such table: ${fullName(schemaName, tableName)}`)
    }
    return Either.right({
      name: tableName,
      columns: result.map((col) => ({
        hidden: col.attnum < 0,
        name: col.attname,
        nullable: !col.attnotnull,
        type: col.atttypid,
      })),
    })
  }

  const getEnums = asyncCached(
    async (): Promise<Enum[]> =>
      (await sql.enums(postgresClient)).map((row) => ({
        oid: row.oid,
        name: row.typname,
        labels: row.labels,
      }))
  )

  const getArrayTypes = asyncCached(
    async (): Promise<ArrayType[]> =>
      (await sql.arrayTypes(postgresClient)).map((row) => ({
        oid: row.oid,
        elemType: row.typelem,
      }))
  )

  // TODO: handle overloaded functions
  const getFunction = (
    schemaName: string | null,
    functionName: string
  ): TaskEither.TaskEither<string, SqlFunction> => async () => {
    const allFunctions = await getFunctions()
    const res = allFunctions.find(
      (f) =>
        schemaName !== null &&
        f.schema === schemaName &&
        f.name === functionName
    )
    if (res) {
      return Either.right(res)
    } else {
      return Either.left(
        `No such function: ${fullName(schemaName, functionName)}`
      )
    }
  }

  const getFunctions = asyncCached(
    async (): Promise<SqlFunction[]> =>
      (await sql.functions(postgresClient)).map((row) => ({
        schema: row.nspname,
        name: row.proname,
        nullSafety: 'unsafe',
      }))
  )

  const functionNullSafety = (
    schemaName: string | null,
    functionName: string
  ): Task.Task<NullSafety | null> => {
    const builtin =
      schemaName === null ? builtinFunctionNullSafety(functionName) : null
    if (builtin !== null) return Task.of(builtin)

    return pipe(
      getFunctions,
      Task.map((functions) => {
        const fn = functions.find(
          (fn) =>
            fn.name === functionName &&
            (schemaName === null || fn.schema === schemaName)
        )
        if (fn) return fn.nullSafety
        return null
      })
    )
  }

  return { getTable, getEnums, getArrayTypes, getFunction, functionNullSafety }
}

function fullName(schemaName: string | null, tableName: string): string {
  return (schemaName ? schemaName + '.' : '') + tableName
}
