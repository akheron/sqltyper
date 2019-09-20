import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'

import { Clients } from './clients'
import { generateTypeScript, validateStatement } from './codegen'
import { describeStatement } from './describe'
import { inferStatementNullability } from './infer'
import { preprocessSQL } from './preprocess'
import { runPrettier } from './prettify'
import { StatementDescription } from './types'

export function sqlToStatementDescription(
  clients: Clients,
  sql: string
): TaskEither.TaskEither<string, StatementDescription> {
  return pipe(
    Task.of(sql),
    Task.map(preprocessSQL),
    TaskEither.chain(processed =>
      describeStatement(clients.pg, processed.sql, processed.paramNames)
    ),
    TaskEither.chain(stmt => Task.of(validateStatement(stmt))),
    TaskEither.chain(stmt => inferStatementNullability(clients.schema, stmt))
  )
}

export function sqlToTS(
  clients: Clients,
  sql: string,
  funcName: string,
  prettierFileName?: string | null | undefined
): TaskEither.TaskEither<string, string> {
  return pipe(
    sqlToStatementDescription(clients, sql),
    TaskEither.chain(stmt =>
      TaskEither.rightTask(generateTypeScript(clients.types, funcName, stmt))
    ),
    TaskEither.chain(tsCode =>
      prettierFileName != null
        ? TaskEither.rightTask(() => runPrettier(prettierFileName, tsCode))
        : TaskEither.right(tsCode)
    )
  )
}
