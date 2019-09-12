// Mimics the default type conversion of node-postgres:
// https://github.com/brianc/node-pg-types/blob/master/lib/textParsers.js

import * as ts from 'typescript'
import { Oid, TsType, StatementColumn } from './types'
import { Client } from './pg'
import { schemaClient } from './schema'

type UnPromise<T extends Promise<any>> = T extends Promise<infer U> ? U : never
export type TypeClient = UnPromise<ReturnType<typeof typeClient>>

export async function typeClient(pgClient: Client) {
  const enums = await makeEnumMap(pgClient)

  function tsType(pgType: Oid, nullable: boolean): TsType {
    const result = builtinTypes.get(pgType) || enums.get(pgType) || defaultType
    return nullable ? `${result} | null` : result
  }

  function columnType(column: StatementColumn): { name: string; type: TsType } {
    return {
      name: column.name,
      type: tsType(column.type, column.nullable),
    }
  }

  return {
    tsType,
    columnType,
  }
}

export const builtinTypes = new Map<Oid, TsType>([
  [20, 'string'], // int8
  [21, 'number'], // int2
  [23, 'number'], // int4
  [26, 'number'], // oid
  [700, 'number'], // float4/real
  [701, 'number'], // float8/double
  [16, 'boolean'], // bool
  [1082, 'Date'], // date
  [1114, 'Date'], // timestamp without timezone
  [1184, 'Date'], // timestamp
  [600, '{ x: number; y: number }'], // point
  [651, 'string[]'], // cidr[]
  [718, '{ x: number; y: number; radius: number }'], // circle
  [1000, 'boolean[]'], // bool array
  [1001, 'Buffer[]'], // bytea array
  [1005, 'number[]'], // _int2
  [1007, 'number[]'], // _int4
  [1028, 'number[]'], // oid[]
  [1016, 'string[]'], // _int8
  [1017, '{ x: number; y: number }[]'], // point[]
  [1021, 'number[]'], // _float4
  [1022, 'number[]'], // _float8
  [1231, 'string[]'], // _numeric
  [1014, 'string[]'], // char
  [1015, 'string[]'], // varchar
  [1008, 'string[]'],
  [1009, 'string[]'],
  [1040, 'string[]'], // macaddr[]
  [1041, 'string[]'], // inet[]
  [1115, 'Date[]'], // timestamp without time zone[]
  [1182, 'Date[]'], // _date
  [1185, 'Date[]'], // timestamp with time zone[]
  [1186, '{ hours: number; minutes: number, seconds: number }'], // interval
  [1187, '{ hours: number; minutes: number, seconds: number }[]'], // interval array
  [17, 'Buffer'], // bytea
  // TODO: JSON could be typed more accurately because it only has
  // string, number, boolean, null, and objects and arrays of them
  [114, 'any'], // json
  [3802, 'any'], // jsonb
  [199, 'any[]'], // json[]
  [3807, 'any[]'], // jsonb[]
  [3907, 'string[]'], // numrange[]
  [2951, 'string[]'], // uuid[]
  [791, 'string[]'], // money[]
  [1183, 'string[]'], // time[]
  [1270, 'string[]'], // timetz[]
])

async function makeEnumMap(pgClient: Client): Promise<Map<Oid, TsType>> {
  const enums = await schemaClient(pgClient).getEnums()
  return new Map(
    enums.map(enumType => [
      enumType.oid,
      tsUnion(enumType.labels.map(tsStringLiteral)),
    ])
  )
}

export const defaultType: TsType = 'string'

function tsUnion(arr: TsType[]): TsType {
  return arr.join(' | ')
}

function tsStringLiteral(str: string): string {
  return ts
    .createPrinter()
    .printNode(
      ts.EmitHint.Expression,
      ts.createStringLiteral(str),
      ts.createSourceFile('', '', ts.ScriptTarget.Latest)
    )
}
