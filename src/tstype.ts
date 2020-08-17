import * as ts from 'typescript'
import * as Option from 'fp-ts/lib/Option'
import * as Task from 'fp-ts/lib/Task'
import { pipe } from 'fp-ts/lib/pipeable'

import { NamedValue, ValueType, Oid, TsType } from './types'
import { Client } from './pg'
import { schemaClient } from './schema'

export interface TypeClient {
  tsType(valueType: ValueType, nullable: boolean): Task.Task<TsType>
  columnType(column: NamedValue): Task.Task<{ name: string; type: TsType }>
}

export async function typeClient(pgClient: Client): Promise<TypeClient> {
  let arrayTypes: Map<Oid, Oid> | null = null
  let enums: Map<Oid, string> | null = null

  function valueTsType(oid: Oid): string {
    return nodePgBuiltinTypes.get(oid) || enums?.get(oid) || defaultType
  }

  function arrayTsType(oid: Oid, elemNullable: boolean): Option.Option<string> {
    if (!nodePgBuiltinArrayTypes.get(oid)) {
      // node-postgres won't convert this value to an array
      return Option.none
    }

    const elemOid = arrayTypes?.get(oid)
    if (!elemOid) {
      // This type is not an array according to
      // makeArrayTypesMap. Should not happen.
      return Option.none
    }

    const elemType = valueTsType(elemOid) + (elemNullable ? ' | null' : '')
    return Option.some(`Array<${elemType}>`)
  }

  function tsType(valueType: ValueType, nullable: boolean): Task.Task<TsType> {
    return async () => {
      if (arrayTypes == null) arrayTypes = await makeArrayTypesMap(pgClient)
      if (enums == null) enums = await makeEnumMap(pgClient)

      const result = ValueType.walk(valueType, {
        array: ({ oid, elemNullable }) =>
          pipe(
            arrayTsType(oid, elemNullable),
            Option.getOrElse(() => defaultType)
          ),

        any: ({ oid }) =>
          pipe(
            // If it's an array type its items can be NULL, unless we
            // know how the array was constructed (see the array handler
            // above).
            arrayTsType(oid, true),
            Option.getOrElse(() => valueTsType(oid))
          ),
      })

      return nullable ? `${result} | null` : result
    }
  }

  function columnType(
    column: NamedValue
  ): Task.Task<{ name: string; type: TsType }> {
    return pipe(
      tsType(column.type, column.nullable),
      Task.map(type => ({
        name: column.name,
        type,
      }))
    )
  }

  return {
    tsType,
    columnType,
  }
}

// Equals to default type conversion of node-postgres:
// https://github.com/brianc/node-pg-types/blob/master/lib/textParsers.js
//
// Note that array types have been removed, since we handle them
// specially.
//
export const nodePgBuiltinTypes = new Map<Oid, TsType>([
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
  [718, '{ x: number; y: number; radius: number }'], // circle
  [1186, '{ hours: number; minutes: number, seconds: number }'], // interval
  [17, 'Buffer'], // bytea
  // TODO: JSON could be typed more accurately because it only has
  // string, number, boolean, null, and objects and arrays of them
  [114, 'any'], // json
  [3802, 'any'], // jsonb
])

export const nodePgBuiltinArrayTypes = new Map<Oid, TsType>([
  [651, 'string[]'], // cidr[]
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
  [1187, '{ hours: number; minutes: number, seconds: number }[]'], // interval array
  [199, 'any[]'], // json[]
  [3807, 'any[]'], // jsonb[]
  [3907, 'string[]'], // numrange[]
  [2951, 'string[]'], // uuid[]
  [791, 'string[]'], // money[]
  [1183, 'string[]'], // time[]
  [1270, 'string[]'], // timetz[]
])

export const defaultType: TsType = 'string'

async function makeArrayTypesMap(pgClient: Client): Promise<Map<Oid, Oid>> {
  const arrayTypes = await schemaClient(pgClient).getArrayTypes()
  return new Map(arrayTypes.map(({ oid, elemType }) => [oid, elemType]))
}

async function makeEnumMap(pgClient: Client): Promise<Map<Oid, TsType>> {
  const enums = await schemaClient(pgClient).getEnums()
  return new Map(
    enums.map(enumType => [
      enumType.oid,
      tsUnion(enumType.labels.map(tsStringLiteral)),
    ])
  )
}

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
