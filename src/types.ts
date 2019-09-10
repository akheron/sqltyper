export type Oid = number

export type StatementColumn = {
  name: string
  type: Oid
  nullable: boolean
}

export type Parameter = {
  name: string
  type: Oid
}

export type Statement = {
  sql: string
  columns: StatementColumn[]
  params: Parameter[]
}

export type TsType = string
