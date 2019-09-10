import * as path from 'path'
import { Either, left, right } from 'fp-ts/lib/Either'
import camelCase = require('camelcase')

import { Statement } from './types'
import { columnType, tsType } from './tstype'

export function validateStatement(stmt: Statement): Either<string, Statement> {
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

export function generateTypeScript(fileName: string, stmt: Statement): string {
  const positionalOnly = hasOnlyPositionalParams(stmt)
  return `\
import { ClientBase } from 'pg'

export async function ${funcName(fileName)}(
  client: ClientBase${funcParams(stmt, positionalOnly)}
): Promise<${outputType(stmt)}> {
    const result = await client.query(\`\\
${stmt.sql}\`${queryValues(stmt, positionalOnly)})
    return result.rows
}
`
}

function hasOnlyPositionalParams(stmt: Statement) {
  return stmt.params.every(param => !!param.name.match(/\$\d+/))
}

function funcName(fileName: string) {
  const parsed = path.parse(fileName)
  return camelCase(parsed.name)
}

function outputType(stmt: Statement) {
  return (
    '{ ' +
    stmt.columns
      .map(column => {
        const { name, type } = columnType(column)
        return `${stringLiteral(name)}: ${type}`
      })
      .join('; ') +
    ' }[]'
  )
}

function stringLiteral(str: string): string {
  return "'" + str.replace('\\', '\\\\').replace("'", "\\'") + "'"
}

function funcParams(stmt: Statement, positionalOnly: boolean) {
  if (!stmt.params.length) return ''

  return (
    ', ' + (positionalOnly ? positionalFuncParams(stmt) : namedFuncParams(stmt))
  )
}

function positionalFuncParams(stmt: Statement) {
  return stmt.params
    .map(param => `${param.name}: ${tsType(param.type, false)}`)
    .join(', ')
}

function namedFuncParams(stmt: Statement) {
  return 'params: { ' + positionalFuncParams(stmt) + ' }'
}

function queryValues(stmt: Statement, positionalOnly: boolean) {
  if (!stmt.params.length) return ''

  const prefix = positionalOnly ? '' : 'params.'
  return (
    ', [ ' + stmt.params.map(param => prefix + param.name).join(', ') + ' ]'
  )
}
