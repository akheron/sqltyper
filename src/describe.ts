import * as TaskEither from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/function'
import * as R from 'ramda'

import { StatementDescription, ValueType } from './types'
import { Sql, DescribeResult, PostgresError } from './postgres'

export function describeStatement(
  postgresClient: Sql<{}>,
  sql: string,
  paramNames: string[]
): TaskEither.TaskEither<string, StatementDescription> {
  return pipe(
    TaskEither.tryCatch(
      () => postgresClient.describe(sql),
      (error) =>
        error instanceof postgresClient.PostgresError
          ? errorToString(error, sql)
          : (error as globalThis.Error).message || ''
    ),
    TaskEither.map((result) => describeResult(sql, paramNames, result))
  )
}

function describeResult(
  sql: string,
  paramNames: string[],
  result: DescribeResult
): StatementDescription {
  return {
    columns: result.columns.map((field) => ({
      name: field.name,
      nullable: true, // columns are nullable by default
      type: ValueType.any(field.type),
    })),
    rowCount: 'many',
    params: R.zipWith(
      (name, type) => ({
        name,
        nullable: false, // params are non-nullable by default
        type: ValueType.any(type),
      }),
      paramNames,
      result.params
    ),
    sql,
  }
}

export function errorToString(error: PostgresError, sql: string): string {
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
  error: PostgresError,
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
