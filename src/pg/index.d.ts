import stream = require('stream')
import { ConnectionOptions } from 'tls'

export interface ConnectionConfig {
  user?: string
  database?: string
  password?: string
  port?: number
  host?: string
  connectionString?: string
  keepAlive?: boolean
  stream?: stream.Duplex
  statement_timeout?: false | number
  connectionTimeoutMillis?: number
  keepAliveInitialDelayMillis?: number
}

export interface ClientConfig extends ConnectionConfig {
  ssl?: boolean | ConnectionOptions
}

export interface FieldDef {
  name: string
  tableID: number
  columnID: number
  dataTypeID: number
  dataTypeSize: number
  dataTypeModifier: number
  format: string
}

export interface QueryResultBase {
  command: string
  rowCount: number
  oid: number
  fields: FieldDef[]
  params: number[]
}

export interface QueryResultRow {
  [column: string]: any
}

export interface QueryResult<R extends QueryResultRow = any>
  extends QueryResultBase {
  rows: R[]
}

export interface QueryArrayResult<R extends any[] = any[]>
  extends QueryResultBase {
  rows: R[]
}

export interface QueryConfig<I extends any[] = any[]> {
  name?: string
  text: string
  values?: I
  describe?: boolean
}

export class ClientBase {
  constructor(config?: string | ClientConfig)
  connect(): Promise<void>
  end(): Promise<void>

  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryConfig: QueryConfig<I>
  ): Promise<QueryResult<R>>
  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    values?: I
  ): Promise<QueryResult<R>>
}

export class Client extends ClientBase {}

export class Pool {
  query<R extends QueryResultRow = any, I extends any[] = any[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    values?: I
  ): Promise<QueryResult<R>>
}
