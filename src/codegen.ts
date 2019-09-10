import * as path from 'path'
import { Either, left, right } from 'fp-ts/lib/Either'
import camelCase = require('camelcase')

import { StatementType } from './types'
import { columnType, tsType } from './tstype'

export function validateStatement(
  stmt: StatementType
): Either<string, StatementType> {
  const columnNames: Set<string> = new Set()
  const conflicts: Set<string> = new Set()

  stmt.columns.forEach(({ name }) => {
    if (columnNames.has(name)) conflicts.add(name)
    else columnNames.add(name)
  })

  if (conflicts.size) {
    const dup = [...conflicts.values()].sort().join(', ')
    return left(`Duplicate output columns: ${dup}`)
  }

  return right(stmt)
}

export function generateTypeScript(
  fileName: string,
  sql: string,
  stmt: StatementType
): string {
  return `\
import { ClientBase } from 'pg'

export async function ${funcName(fileName)}(
  client: ClientBase${namedParams(stmt)}
): Promise<${outputType(stmt)}> {
    const result = await client.query(\`${sql}\`${queryValues(stmt)})
    return result.rows
}
`
}

function funcName(fileName: string) {
  const parsed = path.parse(fileName)
  return camelCase(parsed.name)
}

function outputType(stmt: StatementType) {
  return (
    '{ ' +
    stmt.columns
      .map(column => {
        const { name, type } = columnType(column)
        return `${stringLiteral(name)}: ${type}`
      })
      .join('; ') +
    '}[]'
  )
}

function stringLiteral(str: string): string {
  return "'" + str.replace('\\', '\\\\').replace("'", "\\'")
}

function namedParams(stmt: StatementType) {
  return stmt.params.length
    ? ', ' +
        stmt.params
          .map(
            (paramType, index) => `_${index + 1}: ${tsType(paramType, false)}`
          )
          .join(', ')
    : ''
}

function queryValues(stmt: StatementType) {
  return stmt.params.length
    ? ', [ ' + stmt.params.map((_, index) => `_${index + 1}`).join(', ') + ' ]'
    : ''
}
