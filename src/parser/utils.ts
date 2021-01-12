import { Parser, oneOf, seqNull, seq2, constant } from '../typed-parser'
import { symbol } from './token'

export function optional<A>(parser: Parser<A>): Parser<A | null> {
  return oneOf(parser, seqNull(constant('')))
}

// ( ... )
export function parenthesized<T>(parser: Parser<T>): Parser<T> {
  return seq2(symbol('('), parser, symbol(')'))
}
