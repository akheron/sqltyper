import { Parser, match, noop, oneOf, seq, seqConst, _ } from '../typed-parser'
import { Expression } from '../ast'
import {
  expectIdentifier,
  identifier,
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
  'YEAR TO MONTH',
  'DAY TO HOUR',
  'DAY TO MINUTE',
  'DAY TO SECOND',
  'HOUR TO MINUTE',
  'HOUR TO SECOND',
  'MINUTE TO SECOND',
  'YEAR',
  'MONTH',
  'DAY',
  'HOUR',
  'MINUTE',
  'SECOND',
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

const specialTypeCastTargetType = (syntax: 'prefix' | 'psql'): Parser<string> =>
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
    )(join),
    seq(
      expectIdentifier('interval'),
      // prefix typecast syntax doesn't support interval field names
      syntax === 'prefix' ? seqConst('', noop) : optionalIntervalFields,
      optionalPrecision
    )(join)
  )

export const psqlTypeCast: Parser<string> = seq(
  symbol('::'),
  oneOf(specialTypeCastTargetType('psql'), identifier),
  oneOf<'[]' | ''>(seqConst('[]', symbol('['), symbol(']')), seqConst('', _))
)((_, id, arraySuffix) => id + arraySuffix)

/**
 * Typecasts of the form `type 'string'`
 *
 * Example: TIMEZONE (4) WITH TIME ZONE '2020-02-02T12:34:56.789123'
 *
 */
export const prefixTypeCast: Parser<Expression.TypeCast> = seq(
  oneOf(specialTypeCastTargetType('prefix'), identifier),
  stringConstant
)((targetType: string, value: string) =>
  Expression.createTypeCast(Expression.createConstant(value), targetType)
)
