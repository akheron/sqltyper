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

export type NullSafety = 'unsafe' | 'safe' | 'neverNull' | 'alwaysNull'

export type Operator = {
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
  // name (upper case!), commutative, nullSafety
  op('OR', true, 'safe'),
  op('AND', true, 'safe'),
  op('NOT', null, 'safe'),
  op('IS NULL', null, 'neverNull'),
  op('IS NOT NULL', null, 'neverNull'),
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

  // is `func(a, b, ...)`:
  // - safe: always non-NULL if all the parameters are non-null
  // - unsafe: may be NUL even if all the parameters are non-NULL
  // - neverNull: is never NULL regardless of the parameters
  // - alwaysNull: is always NULL regardless of the parameters
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
