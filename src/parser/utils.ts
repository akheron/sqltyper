import { $2, Parser, oneOf, seq, $null, constant } from '../typed-parser'
import { symbol } from './token'

export function optional<A>(parser: Parser<A>): Parser<A | null> {
  return oneOf(parser, seq($null, constant('')))
}

// ( ... )
export function parenthesized<T>(parser: Parser<T>): Parser<T> {
  return seq($2, symbol('('), parser, symbol(')'))
}
