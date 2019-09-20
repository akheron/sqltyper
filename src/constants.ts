/// SQL reserved words

export const sqlReservedWords: string[] = [
  'ALL',
  'AND',
  'AS',
  'ASC',
  'BETWEEN',
  'BY',
  'CROSS',
  'DEFAULT',
  'DELETE',
  'DESC',
  'DISTINCT',
  'EXCEPT',
  'EXISTS',
  'FALSE',
  'FIRST',
  'FROM',
  'FULL',
  'GROUP',
  'ILIKE',
  'IN',
  'INNER',
  'INSERT',
  'INTERSECT',
  'INTO',
  'IS',
  'ISNULL',
  'JOIN',
  'LAST',
  'LEFT',
  'LIKE',
  'LIMIT',
  'NATURAL',
  'NOT',
  'NOTNULL',
  'NULL',
  'NULLS',
  'OFFSET',
  'ON',
  'OR',
  'ORDER',
  'OUTER',
  'RETURNING',
  'RIGHT',
  'SELECT',
  'SET',
  'SIMILAR',
  'TRUE',
  'UNION',
  'UNKNOWN',
  'UPDATE',
  'USING',
  'VALUES',
  'WHERE',
  'WITH',
]

// SQL operators

export type NullSafety = 'unsafe' | 'safe' | 'neverNull' | 'alwaysNull'

export type Operator = {
  op: string

  // does `a op b` equal `b op a`. null means unary operator.
  commutative: boolean | null

  // is `a op b` or `op a`:
  // - safe: always non-NULL if the operand(s) are non-NULL
  // - unsafe: may be NUL even the operand(s) are non-NULL
  // - neverNull: is never NULL regardless of the operand(s)
  // - alwaysNull: is always NULL regardless of the operand (s)
  nullSafety: NullSafety
}

export const operators: Operator[] = [
  // name (upper case!), commutative, nullSafety
  op('OR', true, 'safe'),
  op('AND', true, 'safe'),
  op('IS NULL', null, 'neverNull'),
  op('IS NOT NULL', null, 'neverNull'),
  op('<', false, 'safe'),
  op('>', false, 'safe'),
  op('=', true, 'safe'),
  op('<=', false, 'safe'),
  op('>=', false, 'safe'),
  op('+', true, 'safe'),
  op('-', false, 'safe'),
  op('*', true, 'safe'),
  op('/', false, 'safe'),
  op('::', false, 'safe'),
]

// SQL functions

export type Function = {
  name: string

  // is `func(a, b, ...)`:
  // - safe: always non-NULL if all the parameters are non-null
  // - unsafe: may be NUL even if all the parameters are non-NULL
  // - neverNull: is never NULL regardless of the parameters
  // - alwaysNull: is always NULL regardless of the parameters
  nullSafety: NullSafety
}

export const functions: Function[] = [
  //   name (lower case!), nullSafety
  func('bool', 'safe'),
  func('now', 'neverNull'),
  func('count', 'neverNull'),
  func('sum', 'safe'),
]

/// Helpers

function op(
  op: string,
  commutative: boolean | null,
  nullSafety: NullSafety
): Operator {
  return { op: op.toUpperCase(), commutative, nullSafety }
}

function func(name: string, nullSafety: NullSafety): Function {
  return { name: name.toLowerCase(), nullSafety }
}
