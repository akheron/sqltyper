import * as Either from 'fp-ts/lib/Either'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'
import * as R from 'ramda'
import * as P from 'typed-parser'

import { Client, QueryResult } from './pg'
import { reservedWord } from './parser'
import { Statement, StatementType } from './types'

export function describeStatement(
  client: Client,
  sql: string,
  paramNames: string[]
): TaskEither.TaskEither<string, Statement> {
  return pipe(
    TaskEither.tryCatch(
      () => client.query({ text: sql, describe: true }),
      error => describeError(error as PGError, sql)
    ),
    TaskEither.chain(queryResult =>
      pipe(
        Task.of(getStatementType(sql)),
        TaskEither.map(statementType => ({ queryResult, statementType }))
      )
    ),
    TaskEither.map(({ queryResult, statementType }) =>
      describeResult(sql, statementType, paramNames, queryResult)
    )
  )
}

function describeResult(
  sql: string,
  statementType: StatementType,
  paramNames: string[],
  queryResult: QueryResult<any>
): Statement {
  return {
    statementType,
    columns: queryResult.fields.map(field => ({
      name: field.name,
      nullable: true,
      type: field.dataTypeID,
    })),
    params: R.zipWith(
      (name, type) => ({ name, type }),
      paramNames,
      queryResult.params
    ),
    sql,
  }
}

function getStatementType(sql: string): Either.Either<string, StatementType> {
  // Throws on error, but there should be no error at this point
  // because describe has succeeded on the Postgres server
  return Either.tryCatch(
    () => P.run(statementTypeParser, sql),
    () =>
      'Unsupported statement type (expected one of SELECT, INSERT, UPDATE, DELETE'
  )
}

const statementTypeParser: P.Parser<StatementType> = P.seq(
  P.$2,
  P._,
  P.oneOf(
    reservedWord('SELECT'),
    reservedWord('INSERT'),
    reservedWord('UPDATE'),
    reservedWord('DELETE')
  )
)

type PGError = {
  message: string | undefined
  severity: string | undefined
  code: string | undefined
  detail: string | undefined
  hint: string | undefined
  position: string | undefined
  internalPosition: string | undefined
  internalQuery: string | undefined
  where: string | undefined
  schema: string | undefined
  table: string | undefined
  column: string | undefined
  dataType: string | undefined
  constraint: string | undefined
  file: string | undefined
  line: string | undefined
  routine: string | undefined
}

function describeError(error: PGError, sql: string): string {
  const sourceLines = sql.split('\n')
  const errorPos =
    error.position && findPositionInFile(Number(error.position), sourceLines)
  if (errorPos) {
    return formatError(error, errorPos, sourceLines)
  }
  return error.message || ''
}

type PositionInFile = {
  line: number
  column: number
}

function findPositionInFile(
  characterOffset: number,
  sourceLines: string[]
): PositionInFile | null {
  type Acc = {
    offset: number
    lineNo: number
    result: PositionInFile | null
  }

  const init: Acc = { offset: 0, lineNo: 1, result: null }
  const final = sourceLines.reduce(
    ({ offset, lineNo, result }, line) => ({
      lineNo: lineNo + 1,
      offset: offset + line.length + 1, // +1 for '\n' that was removed by .split('\n')
      result:
        offset <= characterOffset && characterOffset < offset + line.length + 1
          ? { line: lineNo, column: characterOffset - offset }
          : result,
    }),
    init
  )

  return final.result
}

function formatError(
  error: PGError,
  errorPos: PositionInFile,
  sourceLines: string[]
) {
  const result = []
  result.push(`${error.severity}:  ${error.message}`)
  result.push('')
  let line: number
  for (line = Math.max(errorPos.line - 19, 1); line <= errorPos.line; line++) {
    result.push(`${leftPad(String(line), 5)}| ${sourceLines[line - 1]}`)
  }
  result.push(errorMarker(errorPos.column + 7))
  if (error.hint) {
    result.push(`HINT:  ${error.hint}`)
  }
  return result.join('\n')
}

function errorMarker(column: number): string {
  const arr = []
  for (let i = 0; i < column - 1; i++) {
    arr.push(' ')
  }
  arr.push('^')
  return arr.join('')
}

function leftPad(s: string, width: number) {
  while (s.length < width) {
    s = ' ' + s
  }
  return s
}
