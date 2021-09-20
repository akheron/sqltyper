import { Parser, match, oneOf, seq } from '../typed-parser'
import { Expression } from '../ast'
import {
  expectIdentifier,
  sepExpectIdentifiers,
  stringConstant,
  symbol,
} from './token'
import { optional, parenthesized } from './utils'

const optionalPrecision: Parser<string> = seq(
  optional(parenthesized(match('[0-9]+')))
)((arg) => (arg === null ? '' : `(${arg})`))

const optionalDecimalPrecision: Parser<string> = seq(
  optional(
    parenthesized(
      seq(
        match('[0-9]+'),
        symbol(','),
        match('[0-9]+')
      )((p, _, s) => `${p}, ${s}`)
    )
  )
)((arg) => (arg === null ? '' : `(${arg})`))

const join = (...args: string[]): string => args.join(' ').trim()

const intervalFieldNames = [
  'YEAR',
  'MONTH',
  'DAY',
  'HOUR',
  'MINUTE',
  'SECOND',
  'YEAR TO MONTH',
  'DAY TO HOUR',
  'DAY TO MINUTE',
  'DAY TO SECOND',
  'HOUR TO MINUTE',
  'HOUR TO SECOND',
  'MINUTE TO SECOND',
]

const optionalIntervalFields: Parser<string> = seq(
  optional(
    oneOf(...intervalFieldNames.map((field) => sepExpectIdentifiers(field)))
  )
)((arg) => (arg === null ? '' : arg))

const optionalTimeZoneModifier: Parser<string> = oneOf(
  seq(sepExpectIdentifiers('with time zone'))(join),
  seq(optional(seq(sepExpectIdentifiers('without time zone'))(join)))(
    (arg) => arg || ''
  )
)

/**
 * Typecasts of the form `type 'string'`
 *
 * Example: TIMEZONE (4) WITH TIME ZONE '2020-02-02T12:34:56.789123'
 *
 */
export const specialTypeCast: Parser<Expression.TypeCast> = seq(
  oneOf(
    seq(sepExpectIdentifiers('bit varying'), optionalPrecision)(join),
    seq(sepExpectIdentifiers('bit'), optionalPrecision)(join),
    seq(sepExpectIdentifiers('character varying'), optionalPrecision)(join),
    sepExpectIdentifiers('double precision'),
    seq(
      oneOf(expectIdentifier('numeric'), expectIdentifier('decimal')),
      optionalDecimalPrecision
    )(join),
    seq(
      oneOf(expectIdentifier('time'), expectIdentifier('timestamp')),
      optionalPrecision,
      optionalTimeZoneModifier
    )(join)
  ),
  stringConstant
)((targetType: string, value: string) =>
  Expression.createTypeCast(Expression.createConstant(value), targetType)
)
