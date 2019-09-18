import * as path from 'path'

import camelCase = require('camelcase')
import { Either, left, right } from 'fp-ts/lib/Either'

import { TypeClient } from './tstype'
import { StatementDescription, StatementColumn } from './types'

export function validateStatement(
  stmt: StatementDescription
): Either<string, StatementDescription> {
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
  stmt: StatementDescription
): string {
  const positionalOnly = hasOnlyPositionalParams(stmt)
  return `\
import { ClientBase } from 'pg'

export async function ${funcName(fileName)}(
  client: ClientBase${funcParams(types, stmt, positionalOnly)}
): Promise<${funcReturnType(types, stmt)}> {
    const result = await client.query(\`\\
${stmt.sql}\`${queryValues(stmt, positionalOnly)})
    return ${outputValue(stmt)}
}
`
}

function hasOnlyPositionalParams(stmt: StatementDescription) {
  return stmt.params.every(param => !!param.name.match(/\$\d+/))
}

function funcName(fileName: string) {
  const parsed = path.parse(fileName)
  return camelCase(parsed.name)
}

function funcReturnType(types: TypeClient, stmt: StatementDescription) {
  const rowType = '{ ' + stmt.columns.map(columnType(types)).join('; ') + ' }'
  switch (stmt.rowCount) {
    case 'zero':
      return 'number' // return the affected row count
    case 'one':
      return rowType
    case 'zeroOrOne':
      return `${rowType} | null`
    case 'many':
      return `Array<${rowType}>`
  }
}

const columnType = (types: TypeClient) => (column: StatementColumn): string => {
  const { name, type } = types.columnType(column)
  return `${stringLiteral(name)}: ${type}`
}

function outputValue(stmt: StatementDescription): string {
  switch (stmt.rowCount) {
    case 'zero':
      return 'result.rowCount' // return the affected row count
    case 'one':
      return 'result.rows[0]'
    case 'zeroOrOne':
      return 'result.rows.length ? result.rows[0] : null'
    case 'many':
      return 'result.rows'
  }
}

function stringLiteral(str: string): string {
  return "'" + str.replace('\\', '\\\\').replace("'", "\\'") + "'"
}

function funcParams(
  types: TypeClient,
  stmt: StatementDescription,
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

function positionalFuncParams(types: TypeClient, stmt: StatementDescription) {
  return stmt.params
    .map(param => `${param.name}: ${types.tsType(param.type, false)}`)
    .join(', ')
}

function namedFuncParams(types: TypeClient, stmt: StatementDescription) {
  return 'params: { ' + positionalFuncParams(types, stmt) + ' }'
}

function queryValues(stmt: StatementDescription, positionalOnly: boolean) {
  if (!stmt.params.length) {
    return ''
  }

  const prefix = positionalOnly ? '' : 'params.'
  return (
    ', [ ' + stmt.params.map(param => prefix + param.name).join(', ') + ' ]'
  )
}
