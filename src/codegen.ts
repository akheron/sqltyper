import * as path from 'path'

import camelCase = require('camelcase')
import { Either, left, right } from 'fp-ts/lib/Either'

import { TypeClient } from './tstype'
import { Statement } from './types'

export function validateStatement(stmt: Statement): Either<string, Statement> {
  const columnNames: Set<string> = new Set()
  const conflicts: Set<string> = new Set()

  stmt.columns.forEach(({ name }) => {
    if (columnNames.has(name)) {
      conflicts.add(name)
    } else {
      columnNames.add(name)
    }
  })

  if (conflicts.size) {
    const dup = [...conflicts.values()].sort().join(', ')
    return left(`Duplicate output columns: ${dup}`)
  }

  return right(stmt)
}

export function generateTypeScript(
  types: TypeClient,
  fileName: string,
  stmt: Statement
): string {
  const positionalOnly = hasOnlyPositionalParams(stmt)
  return `\
import { ClientBase } from 'pg'

export async function ${funcName(fileName)}(
  client: ClientBase${funcParams(types, stmt, positionalOnly)}
): Promise<${outputType(types, stmt)}> {
    const result = await client.query(\`\\
${stmt.sql}\`${queryValues(stmt, positionalOnly)})
    return ${funcResultExpr(stmt)}
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

function outputType(types: TypeClient, stmt: Statement) {
  if (stmt.statementType === 'SELECT' || stmt.columns.length) {
    return (
      'Array<{ ' +
      stmt.columns
        .map(column => {
          const { name, type } = types.columnType(column)
          return `${stringLiteral(name)}: ${type}`
        })
        .join('; ') +
      ' }>'
    )
  }
  return 'number'
}

function funcResultExpr(stmt: Statement): string {
  if (stmt.statementType === 'SELECT' || stmt.columns.length)
    return 'result.rows'
  return 'result.rowCount'
}

function stringLiteral(str: string): string {
  return "'" + str.replace('\\', '\\\\').replace("'", "\\'") + "'"
}

function funcParams(
  types: TypeClient,
  stmt: Statement,
  positionalOnly: boolean
) {
  if (!stmt.params.length) {
    return ''
  }

  return (
    ', ' +
    (positionalOnly
      ? positionalFuncParams(types, stmt)
      : namedFuncParams(types, stmt))
  )
}

function positionalFuncParams(types: TypeClient, stmt: Statement) {
  return stmt.params
    .map(param => `${param.name}: ${types.tsType(param.type, false)}`)
    .join(', ')
}

function namedFuncParams(types: TypeClient, stmt: Statement) {
  return 'params: { ' + positionalFuncParams(types, stmt) + ' }'
}

function queryValues(stmt: Statement, positionalOnly: boolean) {
  if (!stmt.params.length) {
    return ''
  }

  const prefix = positionalOnly ? '' : 'params.'
  return (
    ', [ ' + stmt.params.map(param => prefix + param.name).join(', ') + ' ]'
  )
}
