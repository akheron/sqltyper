import * as Option from 'fp-ts/lib/Option'
import { pipe } from 'fp-ts/lib/pipeable'

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

type Operator = {
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
  // name, commutative, nullSafety
  op('OR', true, 'safe'),
  op('AND', true, 'safe'),
  op('IS NULL', null, 'neverNull'),
  op('IS NOT NULL', null, 'neverNull'),
  op('=', true, 'safe'),
  op('+', true, 'safe'),
  op('-', false, 'safe'),
  op('*', true, 'safe'),
  op('/', false, 'safe'),
]

export function findOperator(name: string): Option.Option<Operator> {
  return Option.fromNullable(operators.find(op => op.op === name))
}

export function isOperatorCommutative(name: string): boolean {
  return pipe(
    findOperator(name),
    Option.map(op => op.commutative || false),
    Option.getOrElse<boolean>(() => false)
  )
}

export function operatorNullSafety(name: string): NullSafety {
  return pipe(
    findOperator(name),
    Option.map(op => op.nullSafety),
    Option.getOrElse<NullSafety>(() => 'unsafe')
  )
}

// SQL functions

type NullSafety = 'unsafe' | 'safe' | 'neverNull' | 'alwaysNull'

type Function = {
  name: string

  // is `func(a, b, ...)`:
  // - safe: always non-NULL if all the parameters are non-null
  // - unsafe: may be NUL even if all the parameters are non-NULL
  // - neverNull: is never NULL regardless of the parameters
  // - alwaysNull: is always NULL regardless of the parameters
  nullSafety: NullSafety
}

export const functions: Function[] = [
  //   name, nullSafety
  func('now', 'neverNull'),
  func('count', 'neverNull'),
  func('sum', 'safe'),
]

export function findFunction(name: string): Option.Option<Function> {
  return Option.fromNullable(functions.find(f => f.name === name))
}

export function functionNullSafety(name: string): NullSafety {
  return pipe(
    findFunction(name),
    Option.map(func => func.nullSafety),
    Option.getOrElse<Function['nullSafety']>(() => 'unsafe')
  )
}

/// Helpers

function op(
  op: string,
  commutative: boolean | null,
  nullSafety: NullSafety
): Operator {
  return { op, commutative, nullSafety }
}

function func(name: string, nullSafety: NullSafety): Function {
  return { name, nullSafety }
}
