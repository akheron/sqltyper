import * as Either from 'fp-ts/lib/Either'

import * as pg from './pg'
import { SchemaClient, schemaClient } from './schema'
import { TypeClient, typeClient } from './tstype'

export type Clients = {
  pg: pg.Client
  schema: SchemaClient
  types: TypeClient
}

export async function connect(
  connectionString?: string | undefined
): Promise<Either.Either<string, Clients>> {
  const pgClient = new pg.Client(
    connectionString == null ? undefined : { connectionString }
  )
  try {
    await pgClient.connect()
  } catch (err) {
    return Either.left(`Error connecting to database: ${err.message}`)
  }

  const schema = schemaClient(pgClient)
  const types = await typeClient(pgClient)

  return Either.right({ pg: pgClient, schema, types })
}

export async function disconnect(clients: Clients): Promise<void> {
  await clients.pg.end()
}

export async function clearCache(clients: Clients): Promise<Clients> {
  // The type client caches stuff about user-defined SQL types.
  // Recreate it to clear the cache.
  const types = await typeClient(clients.pg)
  return { ...clients, types }
}
