import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'

import { Clients } from './clients'
import {
  generateTypeScript,
  validateStatement,
  TsModule,
  generateIndexModule,
} from './codegen'
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
    TaskEither.chain(stmt =>
      TaskEither.rightTask(inferStatementNullability(clients.schema, stmt))
    )
  )
}

export function generateTSCode(
  clients: Clients,
  sourceFileName: string,
  stmt: StatementDescription,
  funcName: string,
  options?: {
    prettierFileName?: string | undefined
    pgModule?: string | undefined
    verbose?: boolean | undefined
    terminalColumns?: number | undefined
  }
): TaskEither.TaskEither<string, string> {
  const { prettierFileName = null, pgModule = 'pg' } = options || {}

  return pipe(
    TaskEither.right(stmt),
    TaskEither.chain(stmt =>
      TaskEither.rightTask(
        generateTypeScript(
          clients.types,
          sourceFileName,
          pgModule,
          funcName,
          stmt
        )
      )
    ),
    TaskEither.chain(tsCode =>
      prettierFileName != null
        ? TaskEither.rightTask(() => runPrettier(prettierFileName, tsCode))
        : TaskEither.right(tsCode)
    )
  )
}

export { TsModule, TsModuleDir } from './codegen'

export function indexModuleTS(
  tsModules: TsModule[],
  options?: {
    prettierFileName?: string | null | undefined
  }
): Task.Task<string> {
  const { prettierFileName = null } = options || {}
  return pipe(
    Task.of(generateIndexModule(tsModules)),
    Task.chain(tsCode =>
      prettierFileName != null
        ? () => runPrettier(prettierFileName, tsCode)
        : Task.of(tsCode)
    )
  )
}
