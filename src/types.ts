export type Oid = number

export type StatementType = {
  columns: {
    name: string
    type: Oid
    nullable: boolean
  }[]
  params: Oid[]
}
