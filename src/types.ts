export type Oid = number

export type StatementDescription = {
  sql: string
  columns: NamedValue[]
  params: NamedValue[]
  rowCount: StatementRowCount
}

export type StatementType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'

export type StatementRowCount =
  | 'zero' // no output rows ever
  | 'one' // exatly one output row
  | 'zeroOrOne' // zero or one output row
  | 'many' // zero or more output rows

export type NamedValue = {
  name: string
  type: Oid
  nullable: boolean
}

export type TsType = string
