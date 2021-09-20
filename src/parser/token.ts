import {
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
  seq1,
  seq2,
  seqConst,
  seqNull,
  skip,
  stringBefore,
  stringBeforeEndOr,
  stringUntil,
} from '../typed-parser'
import { sqlReservedWords } from '../constants'

// Token parsers

// whitespace and comments
export const _: Parser<null> = seqNull(
  skip('\\s*'),
  many(
    oneOf(
      seqNull(expectString('--'), stringBeforeEndOr('\n'), skip('\\s*')),
      seqNull(expectString('/*'), stringUntil('\\*/'), skip('\\s*'))
    )
  )
)

export function symbol(s: string): Parser<null> {
  return seqNull(expectString(s, 'symbol'), _)
}

// Like symbol but doesn't skip whitespace
export function symbolKeepWS(s: string): Parser<null> {
  return expectString(s, 'symbol')
}

export const matchIdentifier = match('[a-zA-Z_][a-zA-Z0-9_]*')

export const unquotedIdentifier: Parser<string> = map(
  (identifier, toError) =>
    sqlReservedWords.includes(identifier.toUpperCase())
      ? toError(`Expected an identifier, got reserved word ${identifier}`)
      : identifier,
  matchIdentifier
)

export const quotedEscape = seq2(
  symbolKeepWS('\\'),
  oneOf(keyword('"', '"'), keyword('\\', '\\'))
)
export const quotedInner: Parser<string> = seq(
  stringBefore('[\\"]'),
  oneOf(
    seq(
      quotedEscape,
      lazy(() => quotedInner)
    )((e, t) => e + t),
    constant('')
  )
)((s, tail) => s + tail)
export const quotedIdentifier = seq2(
  symbolKeepWS('"'),
  quotedInner,
  symbol('"')
)

export const identifier = seq1(
  attempt(oneOf(unquotedIdentifier, quotedIdentifier)),
  _
)

export function expectIdentifier<T extends string>(ident: T): Parser<T> {
  return seqConst(
    ident,
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
  return seq1(
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

const sep = (
  makeParser: (word: string) => Parser<unknown>,
  words: string
): Parser<string> =>
  attempt(
    seq(...words.split(/\s+/).map((word) => makeParser(word)))((_) => words)
  )

export const sepReserveds = (words: string): Parser<string> =>
  sep(reservedWord, words)

export const sepExpectIdentifiers = (words: string): Parser<string> =>
  sep(expectIdentifier, words)

export const anyOperator = seq1(match('[-+*/<>=~!@#%^&|`?]{1,63}'), _)

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

const strEscape = seq2(
  symbolKeepWS('\\'),
  oneOf(
    keyword("'", "'"),
    keyword('\\', '\\'),
    keyword('/', '/'),
    keyword('b', '\b'),
    keyword('f', '\f'),
    keyword('n', '\n'),
    keyword('r', '\r'),
    keyword('t', '\t')
  )
)

const strInner: Parser<string> = seq(
  stringBefore("[\\']"),
  oneOf(
    seq(
      strEscape,
      lazy(() => strInner)
    )((e, t) => e + t),
    constant('')
  )
)((s, tail) => s + tail)

export const stringConstant = seq2(symbolKeepWS("'"), strInner, symbol("'"))
