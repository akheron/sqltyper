export type Oid = number

export type StatementDescription = {
  sql: string
  columns: NamedValue[]
  params: NamedValue[]
  rowCount: StatementRowCount
  warnings: Warning[]
}

export type Warning = {
  summary: string
  description: string
}

export type StatementType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'

export type StatementRowCount =
  | 'zero' // no output rows ever
  | 'one' // exatly one output row
  | 'zeroOrOne' // zero or one output row
  | 'many' // zero or more output rows

export type NamedValue = {
  name: string
  type: ValueType
  nullable: boolean
}

export type ValueType =
  | ValueType.Array // We know it's an array because an array constructor was used
  | ValueType.Any // Can also be array or any other value type

export namespace ValueType {
  export type Array = {
    kind: 'Array'
    oid: Oid
    elemNullable: boolean
  }

  export function array(oid: Oid, elemNullable: boolean): Array {
    return { kind: 'Array', oid, elemNullable }
  }

  export type Any = {
    kind: 'Any'
    oid: Oid
  }

  export function any(oid: Oid): Any {
    return { kind: 'Any', oid }
  }

  export function walk<T>(
    valueType: ValueType,
    handlers: {
      array: (value: Array) => T
      any: (value: Any) => T
    }
  ): T {
    switch (valueType.kind) {
      case 'Array':
        return handlers.array(valueType)
      case 'Any':
        return handlers.any(valueType)
    }
  }
}

export type TsType = string
