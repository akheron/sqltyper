export type Oid = number

export type Statement = {
  sql: string
  columns: StatementColumn[]
  params: Parameter[]
  rowCount: StatementRowCount
}

export type StatementType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'

export type StatementRowCount =
  | 'zero' // no output rows ever
  | 'one' // exatly one output row
  | 'zeroOrOne' // zero or one output row
  | 'many' // zero or more output rows

export type StatementColumn = {
  name: string
  type: Oid
  nullable: boolean
}

export type Parameter = {
  name: string
  type: Oid
}

export type TsType = string
