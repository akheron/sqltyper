import * as Option from 'fp-ts/lib/Option'
import { pipe } from 'fp-ts/lib/pipeable'

import {
  Operator,
  Function,
  NullSafety,
  operators,
  functions,
} from './constants'

export function findOperator(name: string): Option.Option<Operator> {
  const upCaseName = name.toUpperCase()
  return Option.fromNullable(operators.find(op => op.op === upCaseName))
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

export function findFunction(name: string): Option.Option<Function> {
  const downCaseName = name.toLowerCase()
  return Option.fromNullable(functions.find(f => f.name === downCaseName))
}

export function functionNullSafety(name: string): NullSafety {
  return pipe(
    findFunction(name),
    Option.map(func => func.nullSafety),
    Option.getOrElse<NullSafety>(() => 'unsafe')
  )
}
