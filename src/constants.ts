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

  // does `a op b` equal `b op a`
  commutative: boolean

  // is `a op b` always non-null if `a` and `b` are non-null
  nullSafe: boolean
}

export const operators: Operator[] = [
  // name, commutative, nullSafe
  op('+', true, true),
  op('-', false, true),
  op('*', true, true),
  op('/', false, true),
]

export function findOperator(name: string): Option.Option<Operator> {
  return Option.fromNullable(operators.find(op => op.op === name))
}

export function isOperatorCommutative(name: string): boolean {
  return pipe(
    findOperator(name),
    Option.map(op => op.commutative),
    Option.getOrElse<boolean>(() => false)
  )
}

export function isOperatorNullSafe(name: string): boolean {
  return pipe(
    findOperator(name),
    Option.map(op => op.nullSafe),
    Option.getOrElse<boolean>(() => false)
  )
}

// SQL functions

type Function = {
  name: string

  // is `func(a, b, ...)` always non-null if the
  // parameters are non-null
  nullSafe: boolean
}

export const functions: Function[] = [
  //   name, nullSafe
  func('now', true),
]

export function findFunction(name: string): Option.Option<Function> {
  return Option.fromNullable(functions.find(f => f.name === name))
}

export function isFunctionNullSafe(name: string): boolean {
  return pipe(
    findFunction(name),
    Option.map(func => func.nullSafe),
    Option.getOrElse<boolean>(() => false)
  )
}

/// Helpers

function op(op: string, commutative: boolean, nullSafe: boolean): Operator {
  return { op, commutative, nullSafe }
}

function func(name: string, nullSafe: boolean) {
  return { name, nullSafe }
}
