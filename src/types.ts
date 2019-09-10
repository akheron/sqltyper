export type Oid = number

export type StatementColumn = {
  name: string
  type: Oid
  nullable: boolean
}

export type StatementType = {
  columns: StatementColumn[]
  params: Oid[]
}

export type TsType = string
