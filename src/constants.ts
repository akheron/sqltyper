/// SQL reserved words

import { NullSafety, Operator, SqlFunction } from './types'

export const sqlReservedWords: string[] = [
  'ALL',
  'AND',
  'ANY',
  'ARRAY',
  'AS',
  'ASC',
  'BETWEEN',
  'BY',
  'CASE',
  'CONFLICT',
  'CONSTRAINT',
  'CROSS',
  'DEFAULT',
  'DELETE',
  'DESC',
  'DISTINCT',
  'DO',
  'ELSE',
  'END',
  'EXCEPT',
  'EXISTS',
  'FALSE',
  'FILTER',
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
  'NOTHING',
  'NOTNULL',
  'NULL',
  'NULLS',
  'OFFSET',
  'ON',
  'OR',
  'ORDER',
  'OUTER',
  'OVER',
  'PARTITION',
  'RETURNING',
  'RIGHT',
  'SELECT',
  'SET',
  'SIMILAR',
  'SYMMETRIC',
  'THEN',
  'TRUE',
  'UNION',
  'UNKNOWN',
  'UPDATE',
  'USING',
  'VALUES',
  'WINDOW',
  'WHEN',
  'WHERE',
  'WITH',
]

// SQL operators

export const operators: Operator[] = [
  // name (upper case!), commutative, nullSafety

  // 9.1. Logical operators

  // FALSE AND NULL evaluates to NULL => unsafe. Not commutitave due
  // to short-circuiting.
  op('AND', false, 'unsafe'),
  // TRUE OR NULL evaluates to TRUE => unsafe. Not commutitave due to
  // short-circuiting.
  op('OR', false, 'unsafe'),
  op('NOT', null, 'safe'),

  // 9.2. Comparison Functions and Operators
  op('<', false, 'safe'),
  op('>', false, 'safe'),
  op('<=', false, 'safe'),
  op('>=', false, 'safe'),
  op('=', true, 'safe'),
  op('<>', true, 'safe'),
  op('!=', true, 'safe'),
  op('BETWEEN', null, 'safe'),
  op('NOT BETWEEN', null, 'safe'),
  op('BETWEEN SYMMETRIC', null, 'safe'),
  op('NOT BETWEEN SYMMETRIC', null, 'safe'),
  op('IS DISTINCT FROM', false, 'neverNull'),
  op('IS NOT DISTINCT FROM', false, 'neverNull'),
  op('IS NULL', null, 'neverNull'),
  op('IS NOT NULL', null, 'neverNull'),
  op('ISNULL', null, 'neverNull'),
  op('NOTNULL', null, 'neverNull'),
  op('IS TRUE', null, 'neverNull'),
  op('IS NOT TRUE', null, 'neverNull'),
  op('IS FALSE', null, 'neverNull'),
  op('IS NOT FALSE', null, 'neverNull'),
  op('IS UNKNOWN', null, 'neverNull'),
  op('IS NOT UNKNOWN', null, 'neverNull'),

  // 9.3. Mathematical Functions and Operators
  op('+', true, 'safe'),
  op('-', false, 'safe'),
  op('*', true, 'safe'),
  op('/', false, 'safe'),
  op('%', false, 'safe'),
  op('^', false, 'safe'),
  op('|/', null, 'safe'),
  op('||/', null, 'safe'),
  op('!', null, 'safe'), // factorial suffix
  op('!!', null, 'safe'),
  op('@', null, 'safe'),
  op('&', true, 'safe'),
  op('|', true, 'safe'),
  op('#', true, 'safe'),
  op('~', null, 'safe'),
  op('<<', false, 'safe'),
  op('>>', false, 'safe'),

  // 9.4. String Functions and Operators
  op('||', false, 'safe'),

  // Not yet categorized
  op('LIKE', false, 'safe'),
  op('::', false, 'safe'),
]

// SQL functions

export const builtinFunctions: SqlFunction[] = [
  //   name (lower case!), nullSafety

  // 9.2. Comparison Functions and Operators
  func('num_nonnulls', 'neverNull'),
  func('num_nulls', 'neverNull'),

  // 9.3. Mathematical Functions and Operators
  func('abs', 'safe'),
  func('cbrt', 'safe'),
  func('ceil', 'safe'),
  func('ceiling', 'safe'),
  func('degrees', 'safe'),
  func('div', 'safe'),
  func('exp', 'safe'),
  func('floor', 'safe'),
  func('ln', 'safe'),
  func('log', 'safe'),
  func('mod', 'safe'),
  func('pi', 'neverNull'),
  func('power', 'safe'),
  func('radians', 'safe'),
  func('round', 'safe'),
  func('scale', 'safe'),
  func('sign', 'safe'),
  func('sqrt', 'safe'),
  func('trunc', 'safe'),
  func('width_bucket', 'safe'),
  func('random', 'safe'),
  func('setseed', 'neverNull'),
  func('acos', 'safe'),
  func('asin', 'safe'),
  func('atan', 'safe'),
  func('atan2', 'safe'),
  func('cos', 'safe'),
  func('cot', 'safe'),
  func('sin', 'safe'),
  func('tan', 'safe'),

  // 9.4. String Functions and Operators
  func('bit_length', 'safe'),
  func('char_length', 'safe'),
  func('character_length', 'safe'),
  func('lower', 'safe'),
  func('octet_length', 'safe'),
  func('overlay', 'safe'),
  func('position', 'safe'),
  func('substring', 'safe'),
  func('trim', 'safe'),
  func('upper', 'safe'),
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

  // Not yet categorized
  func('avg', 'safe'),
  func('bool', 'safe'),
  func('now', 'neverNull'),
  func('count', 'neverNull'),
  func('sum', 'safe'),
  func('to_char', 'safe'),
]

/// Helpers

function op(
  op: string,
  commutative: boolean | null,
  nullSafety: NullSafety
): Operator {
  return { op: op.toUpperCase(), commutative, nullSafety }
}

function func(name: string, nullSafety: NullSafety): SqlFunction {
  return { schema: null, name: name.toLowerCase(), nullSafety }
}
