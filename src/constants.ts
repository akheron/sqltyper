/// SQL reserved words

export const sqlReservedWords: string[] = [
  'ALL',
  'AND',
  'ARRAY',
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
  'HAVING',
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

// An operator or function is:
//
// - `safe` if the result is NULL if and only if at least one the
//   arguments/operands is NULL
//
// - `neverNull` if the result is is never NULL regardless of the
//   arguments/operands
//
// - `unsafe` otherwise
//
export type NullSafety = 'safe' | 'neverNull' | 'unsafe'

// SQL operators

export type Operator = {
  op: string

  // does `a op b` equal `b op a`. null means unary operator.
  commutative: boolean | null

  nullSafety: NullSafety
}

export const operators: Operator[] = [
  // name (upper case!), commutative, nullSafety

  // 9.1. Logical operators
  op('AND', true, 'unsafe'), // FALSE AND NULL evaluates to NULL => unsafe
  op('OR', true, 'unsafe'), // TRUE OR NULL evaluates to TRUE => unsafe
  op('NOT', null, 'safe'),
  op('IS NULL', null, 'neverNull'),
  op('IS NOT NULL', null, 'neverNull'),
  op('ISNULL', null, 'neverNull'),
  op('NOTNULL', null, 'neverNull'),
  op('LIKE', false, 'safe'),
  op('<', false, 'safe'),
  op('>', false, 'safe'),
  op('=', true, 'safe'),
  op('<>', true, 'safe'),
  op('<=', false, 'safe'),
  op('>=', false, 'safe'),
  op('+', true, 'safe'),
  op('-', false, 'safe'),
  op('*', true, 'safe'),
  op('/', false, 'safe'),
  op('::', false, 'safe'),
  op('||', false, 'safe'),
]

// SQL functions

export type Function = {
  name: string
  nullSafety: NullSafety
}

export const functions: Function[] = [
  //   name (lower case!), nullSafety
  func('bool', 'safe'),
  func('now', 'neverNull'),
  func('count', 'neverNull'),
  func('sum', 'safe'),
  func('to_char', 'safe'),

  // 9.4 String Functions and Operators
  func('bit_length', 'safe'),
  func('char_length', 'safe'),
  func('character_length', 'safe'),
  func('lower', 'safe'),
  func('octet_length', 'safe'),
  func('overlay', 'safe'), // TODO: special arg syntax
  func('position', 'safe'), // TODO: special arg syntax
  func('substring', 'safe'), // TODO: special arg syntax
  func('trim', 'safe'), // TODO: special arg syntax
  func('upper', 'safe'),
  // ---
  func('ascii', 'safe'),
  func('btrim', 'safe'),
  func('chr', 'safe'),
  func('concat', 'neverNull'),
  func('concat_ws', 'neverNull'),
  func('convert', 'safe'),
  func('convert_from', 'safe'),
  func('convert_to', 'safe'),
  func('decode', 'safe'),
  func('encode', 'safe'),
  func('format', 'safe'), // TODO: NULL as 2nd parameter does not produce NULL
  func('initcap', 'safe'),
  func('left', 'safe'),
  func('length', 'safe'),
  func('lpad', 'safe'),
  func('ltrim', 'safe'),
  func('md5', 'safe'),
  func('parse_ident', 'safe'),
  func('pg_client_encoding', 'neverNull'),
  func('quote_ident', 'safe'),
  func('quote_literal', 'safe'),
  func('quote_nullable', 'neverNull'),
  func('regexp_match', 'safe'),
  func('regexp_matches', 'safe'),
  func('regexp_replace', 'safe'),
  func('regexp_split_to_array', 'safe'),
  func('regexp_split_to_table', 'safe'),
  func('repeat', 'safe'),
  func('replace', 'safe'),
  func('reverse', 'safe'),
  func('right', 'safe'),
  func('rpad', 'safe'),
  func('rtrim', 'safe'),
  func('split_part', 'safe'),
  func('strpos', 'safe'),
  func('substr', 'safe'),
  func('starts_with', 'safe'),
  func('to_ascii', 'safe'),
  func('to_hex', 'safe'),
  func('translate', 'safe'),
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
