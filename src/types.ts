export type Oid = number

export type Statement = {
  sql: string
  statementType: StatementType
  columns: StatementColumn[]
  params: Parameter[]
}

export type StatementType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'

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
