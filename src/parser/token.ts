import {
  $1,
  $2,
  $null,
  Parser,
  attempt,
  constant,
  expectString,
  keyword,
  lazy,
  many,
  map,
  match,
  oneOf,
  seq,
  skip,
  stringBefore,
  stringBeforeEndOr,
  stringUntil,
} from 'typed-parser'
import { sqlReservedWords } from '../constants'

// Token parsers

// whitespace and comments
export const _: Parser<null> = seq(
  $null,
  skip('\\s*'),
  many(
    oneOf(
      seq($null, expectString('--'), stringBeforeEndOr('\n'), skip('\\s*')),
      seq($null, expectString('/*'), stringUntil('\\*/'), skip('\\s*'))
    )
  )
)

export function symbol(s: string): Parser<null> {
  return seq($null, expectString(s, 'symbol'), _)
}

// Like symbol but doesn't skip whitespace
export function symbolKeepWS(s: string): Parser<null> {
  return expectString(s, 'symbol')
}

export const matchIdentifier = match('[a-zA-Z_][a-zA-Z0-9_]*')

export const quotedEscape = seq(
  $2,
  symbolKeepWS('\\'),
  oneOf(keyword('"', '"'), keyword('\\', '\\'))
)
export const quotedInner: Parser<string> = seq(
  (s, tail) => s + tail,
  stringBefore('[\\"]'),
  oneOf(
    seq(
      (e, t) => e + t,
      quotedEscape,
      lazy(() => quotedInner)
    ),
    constant('')
  )
)
export const quotedIdentifier = seq(
  $2,
  symbolKeepWS('"'),
  quotedInner,
  symbol('"')
)

export const identifier = seq(
  $1,
  attempt(
    oneOf(
      map(
        (identifier, toError) =>
          sqlReservedWords.includes(identifier.toUpperCase())
            ? toError(`Expected an identifier, got reserved word ${identifier}`)
            : identifier,
        matchIdentifier
      ),
      quotedIdentifier
    )
  ),
  _
)

export function expectIdentifier<T extends string>(ident: T): Parser<T> {
  return seq(
    (_) => ident,
    attempt(
      map(
        (match, toError) =>
          match.toLowerCase() !== ident.toLowerCase()
            ? toError(`Expected ${ident}, got ${match}`)
            : ident,
        matchIdentifier
      )
    ),
    _
  )
}

export const reservedWord = <A extends string>(word: A): Parser<A> => {
  if (!sqlReservedWords.includes(word))
    throw new Error(`INTERNAL ERROR: ${word} is not included in reservedWords`)
  return seq(
    $1,
    attempt(
      map(
        (match, toError) =>
          match.toUpperCase() !== word
            ? toError(`Expected ${word}, got ${match}`)
            : word,
        matchIdentifier
      )
    ),
    _
  )
}

export const sepReserveds = (words: string): Parser<string> =>
  attempt(
    seq(
      (_) => words,
      ...words.split(/\s+/).map((word) => seq($null, reservedWord(word), _)),
      _
    )
  )

export const anyOperator = seq($1, match('[-+*/<>=~!@#%^&|`?]{1,63}'), _)

export const operator = (op: string): Parser<string> =>
  attempt(
    map(
      (match, toError) =>
        match != op ? toError(`Operator ${op} expected`) : match,
      anyOperator
    )
  )

export const anyOperatorExcept = (exclude: string[]): Parser<string> =>
  attempt(
    map(
      (match, toError) =>
        exclude.includes(match)
          ? toError(`Operator other than ${exclude.join(' ')} expected`)
          : match,
      anyOperator
    )
  )
