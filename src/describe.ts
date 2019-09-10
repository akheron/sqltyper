import * as R from 'ramda'
import { Either, left, right } from 'fp-ts/lib/Either'
import { Client, QueryResult } from './pg'
import { Statement } from './types'

export async function describeStatement(
  client: Client,
  sql: string,
  paramNames: string[]
): Promise<Either<string, Statement>> {
  try {
    const queryResult = await client.query({ text: sql, describe: true })
    return right(describeResult(sql, paramNames, queryResult))
  } catch (error) {
    return left(describeError(error, sql))
  }
}

function describeResult(
  sql: string,
  paramNames: string[],
  queryResult: QueryResult<any>
): Statement {
  return {
    sql,
    columns: queryResult.fields.map(field => ({
      name: field.name,
      type: field.dataTypeID,
      nullable: true,
    })),
    params: R.zipWith(
      (name, type) => ({ name, type }),
      paramNames,
      queryResult.params
    ),
  }
}

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
  const { result } = sourceLines.reduce(
    ({ offset, lineNo, result }, line) => ({
      offset: offset + line.length + 1, // +1 for '\n' that was removed by .split('\n')
      lineNo: lineNo + 1,
      result:
        offset <= characterOffset && characterOffset < offset + line.length + 1
          ? { line: lineNo, column: characterOffset - offset }
          : result,
    }),
    init
  )

  return result
}

function formatError(
  error: PGError,
  errorPos: PositionInFile,
  sourceLines: string[]
) {
  const result = []
  const lineNoStr = `LINE ${errorPos.line}: `
  result.push(`${error.severity}:  ${error.message}`)
  result.push(`${lineNoStr}${sourceLines[errorPos.line - 1]}`)
  result.push(errorMarker(errorPos.column + lineNoStr.length))
  if (error.hint) result.push(`HINT:  ${error.hint}`)
  return result.join('\n')
}

function errorMarker(column: number): string {
  const arr = []
  for (let i = 0; i < column - 1; i++) arr.push(' ')
  arr.push('^')
  return arr.join('')
}
