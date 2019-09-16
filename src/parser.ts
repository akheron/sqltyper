import { Either, tryCatch } from 'fp-ts/lib/Either'
import {
  $1,
  $2,
  $3,
  $null,
  ParseError,
  Parser,
  _,
  attempt,
  constant,
  end,
  int,
  keyword,
  lazy,
  many,
  map,
  match,
  oneOf,
  run,
  sepBy,
  sepBy1,
  seq,
  stringBefore,
  symbol,
} from 'typed-parser'
import {
  AST,
  Delete,
  Expression,
  From,
  Insert,
  Join,
  Limit,
  OrderBy,
  Select,
  SelectListItem,
  UpdateAssignment,
  Values,
  Update,
} from './ast'

export { ParseError, isParseError } from 'typed-parser'

// Helpers

function $5<T>(_1: any, _2: any, _3: any, _4: any, _5: T): T {
  return _5
}

function optional<A>(parser: Parser<A>): Parser<A | null> {
  return oneOf(parser, seq($null, constant('')))
}

// Token parsers etc.

const matchIdentifier = match('[a-zA-Z_][a-zA-Z0-9_]*')

const reservedWords: string[] = [
  'ALL',
  'AND',
  'AS',
  'ASC',
  'BETWEEN',
  'BY',
  'DEFAULT',
  'DELETE',
  'DESC',
  'FALSE',
  'FIRST',
  'FROM',
  'FULL',
  'GROUP',
  'ILIKE',
  'IN',
  'INNER',
  'INSERT',
  'INTO',
  'IS',
  'ISNULL',
  'JOIN',
  'LAST',
  'LEFT',
  'LIKE',
  'LIMIT',
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
  'UNKNOWN',
  'UPDATE',
  'USING',
  'VALUES',
  'WHERE',
]

const quotedEscape = seq(
  $2,
  symbol('\\'),
  oneOf(keyword('"', '"'), keyword('\\', '\\'))
)
const quotedInner: Parser<string> = seq(
  (s, tail) => s + tail,
  stringBefore('[\\"]'),
  oneOf(
    seq((e, t) => e + t, quotedEscape, lazy(() => quotedInner)),
    constant('')
  )
)
const quotedIdentifier = seq($2, symbol('"'), quotedInner, symbol('"'), _)

const identifier = attempt(
  oneOf(
    map(
      (identifier, toError) =>
        reservedWords.includes(identifier.toUpperCase())
          ? toError(`Expected an identifier, got reserved word ${identifier}`)
          : identifier,
      matchIdentifier
    ),
    quotedIdentifier
  )
)

const reservedWord = <A extends string>(word: A): Parser<A> => {
  if (!reservedWords.includes(word))
    throw new Error(`INTERNAL ERROR: ${word} is not included in reservedWords`)
  return attempt(
    map(
      (match, toError) =>
        match.toUpperCase() !== word
          ? toError(`Expected ${word}, got ${match}`)
          : word,
      matchIdentifier
    )
  )
}

const sepReserveds = (words: string): Parser<string> =>
  attempt(
    seq(
      _ => words,
      ...words.split(/\s+/).map(word => seq($1, reservedWord(word), _))
    )
  )

const anyOperator = match('[-+*/<>=~!@#%^&|`?]{1,63}')

const operator = (op: string) =>
  attempt(
    map(
      (match, toError) =>
        match != op ? toError(`Operator ${op} expected`) : match,
      anyOperator
    )
  )

const anyOperatorExcept = (exclude: string[]) =>
  attempt(
    map(
      (match, toError) =>
        exclude.includes(match)
          ? toError(`Operator other than ${exclude.join(' ')} expected`)
          : match,
      anyOperator
    )
  )

const itemSep = seq($null, symbol(','), _)

// [ AS ] identifier
const as: Parser<string | null> = seq(
  (_as, id, _ws1) => id,
  optional(seq($null, reservedWord('AS'), _)),
  identifier,
  _
)

// AS identifier
const reqAs: Parser<string> = seq($3, reservedWord('AS'), _, identifier, _)

// Expressions

const functionArguments: Parser<Expression[]> = seq(
  $3,
  symbol('('),
  _,
  oneOf(
    // func(*} means no arguments
    seq((_a, _ws) => [], symbol('*'), _),
    sepBy(itemSep, lazy(() => expression))
  ),
  symbol(')')
)

const columnRefOrFunctionCallExpr: Parser<Expression> = seq(
  (ident, _ws1, rest, _ws2) =>
    rest == null
      ? Expression.createColumnRef(ident)
      : typeof rest === 'string'
      ? Expression.createTableColumnRef(ident, rest)
      : Expression.createFunctionCall(ident, rest),
  identifier,
  _,
  oneOf<string | Expression[] | null>(
    seq($3, symbol('.'), _, identifier),
    functionArguments,
    () => null
  ),
  _
)

const strEscape = seq(
  $2,
  symbol('\\'),
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
  (s, tail) => s + tail,
  stringBefore("[\\']"),
  oneOf(seq((e, t) => e + t, strEscape, lazy(() => strInner)), constant(''))
)

const stringConstant = seq($2, symbol("'"), strInner, symbol("'"), _)

const constantExpr: Parser<Expression> = seq(
  Expression.createConstant,
  oneOf(match("[0-9]+|' '"), stringConstant)
)

const userInputExpr: Parser<Expression> = seq(
  (_$, index) => Expression.createPositional(index),
  symbol('$'),
  int('[0-9]+')
)

const parenthesizedExpr: Parser<Expression> = seq(
  $3,
  symbol('('),
  _,
  lazy(() => expression),
  _,
  symbol(')'),
  _
)

const primaryExpr = oneOf(
  columnRefOrFunctionCallExpr,
  constantExpr,
  userInputExpr,
  parenthesizedExpr
)

function makeUnaryOp(
  oper: Parser<string>,
  nextExpr: Parser<Expression>
): Parser<Expression> {
  return seq(
    (ops, next) =>
      ops.length > 0
        ? ops.reduceRight((acc, op) => Expression.createUnaryOp(op, acc), next)
        : next,
    many(seq((op, _ws) => op, oper, _)),
    nextExpr
  )
}

function makeBinaryOp(
  oper: Parser<string>,
  nextExpr: Parser<Expression>
): Parser<Expression> {
  return seq(
    (first, _ws1, rest, _ws2) =>
      rest.reduce(
        (acc, val) => Expression.createBinaryOp(acc, val.op, val.next),
        first
      ),
    nextExpr,
    _,
    many(seq((op, _ws, next) => ({ op, next }), oper, _, nextExpr)),
    _
  )
}

const oneOfOperators = (...ops: string[]): Parser<string> =>
  oneOf(...ops.map(operator))

const typeCastExpr = makeBinaryOp(seq(_ => '::', symbol('::')), primaryExpr)
const subscriptExpr = seq(
  (next, _ws, subs) =>
    subs.reduce((acc, val) => Expression.createBinaryOp(acc, '[]', val), next),
  typeCastExpr,
  _,
  many(seq($3, symbol('['), _, lazy(() => expression), symbol(']'), _))
)
const unaryPlusMinus = makeUnaryOp(oneOfOperators('+', '-'), subscriptExpr)
const expExpr = makeBinaryOp(operator('^'), unaryPlusMinus)
const mulDivModExpr = makeBinaryOp(oneOfOperators('*', '/', '%'), expExpr)
const addSubExpr = makeBinaryOp(oneOfOperators('+', '-'), mulDivModExpr)
const otherOpExpr = makeBinaryOp(
  anyOperatorExcept([
    '<',
    '>',
    '=',
    '<=',
    '>=',
    '<>',
    '+',
    '-',
    '*',
    '/',
    '%',
    '^',
  ]),
  addSubExpr
)
const comparisonExpr = makeBinaryOp(
  oneOfOperators('<', '>', '=', '<=', '>=', '<>'),
  otherOpExpr
)

const isExpr = seq(
  (next, op) => (op ? Expression.createUnaryOp(op, next) : next),
  comparisonExpr,
  optional(
    oneOf(
      sepReserveds('IS NULL'),
      sepReserveds('IS NOT NULL'),
      reservedWord('ISNULL'),
      reservedWord('NOTNULL'),
      sepReserveds('IS TRUE'),
      sepReserveds('IS NOT TRUE'),
      sepReserveds('IS FALSE'),
      sepReserveds('IS NOT FALSE'),
      sepReserveds('IS UNKNOWN'),
      sepReserveds('IS NOT UNKNOWN')
    )
  )
)
const notExpr = makeUnaryOp(reservedWord('NOT'), isExpr)
const andExpr = makeBinaryOp(reservedWord('AND'), notExpr)
const orExpr: Parser<Expression> = makeBinaryOp(reservedWord('OR'), andExpr)

const expression: Parser<Expression> = orExpr

// FROM & JOIN

const joinType: Parser<Join.JoinType> = oneOf(
  seq((..._args) => 'INNER', reservedWord('JOIN')),
  seq((..._args) => 'INNER', reservedWord('INNER'), _, reservedWord('JOIN')),
  seq(
    (..._args) => 'LEFT',
    reservedWord('LEFT'),
    _,
    optional(reservedWord('OUTER')),
    _,
    reservedWord('JOIN')
  ),
  seq(
    (..._args) => 'RIGHT',
    reservedWord('RIGHT'),
    _,
    optional(reservedWord('OUTER')),
    _,
    reservedWord('JOIN')
  ),
  seq(
    (..._args) => 'FULL',
    reservedWord('FULL'),
    _,
    optional(reservedWord('OUTER')),
    _,
    reservedWord('JOIN')
  )
)

const tableRef = seq(
  (id1, _ws1, id2) =>
    id2 ? { schema: id1, table: id2 } : { schema: null, table: id1 },
  identifier,
  _,
  optional(seq($3, symbol('.'), _, identifier, _))
)

const join: Parser<Join> = seq(
  (type, _ws1, table, as, _on, _ws3, condition) =>
    Join.create(type, table, as, condition),
  joinType,
  _,
  tableRef,
  optional(as),
  reservedWord('ON'),
  _,
  expression
)

const from: Parser<From> = seq(
  (_from, _ws1, table, as, joins) => From.create(table, as, joins),
  reservedWord('FROM'),
  _,
  tableRef,
  optional(as),
  many(join)
)

// WHERE

const where: Parser<Expression> = seq($3, reservedWord('WHERE'), _, expression)

// GROUP BY

const groupBy: Parser<Expression[]> = seq(
  $5,
  reservedWord('GROUP'),
  _,
  reservedWord('BY'),
  _,
  sepBy1(itemSep, expression)
)

// ORDER BY

const orderByOrder: Parser<OrderBy.Order> = seq(
  $1,
  oneOf<OrderBy.Order>(
    reservedWord('ASC'),
    reservedWord('DESC'),
    seq(
      (_using, _ws1, op, _ws2) => ['USING', op],
      reservedWord('USING'),
      _,
      anyOperator,
      _
    )
  ),
  _
)

const orderByNulls: Parser<OrderBy.Nulls> = seq(
  $3,
  reservedWord('NULLS'),
  _,
  oneOf(reservedWord('FIRST'), reservedWord('LAST')),
  _
)

const orderByItem: Parser<OrderBy> = seq(
  (expr, _ws1, order, nulls) => OrderBy.create(expr, order, nulls),
  expression,
  _,
  optional(orderByOrder),
  optional(orderByNulls)
)

const orderBy: Parser<OrderBy[]> = seq(
  (_order, _ws1, _by, _ws2, list) => list,
  reservedWord('ORDER'),
  _,
  reservedWord('BY'),
  _,
  sepBy1(itemSep, orderByItem)
)

// LIMIT

const limit: Parser<Limit> = seq(
  (_l, _ws, count, offset) => Limit.create(count, offset),
  reservedWord('LIMIT'),
  _,
  oneOf(seq($null, reservedWord('ALL'), _), expression),
  optional(seq($null, reservedWord('OFFSET'), _, expression))
)

// SELECT

const allFields: Parser<SelectListItem> = seq(
  _a => SelectListItem.createAllFields(),
  symbol('*'),
  _
)

const allTableFields: Parser<SelectListItem> = seq(
  (table, _ws1, _p, _ws2, _a) => SelectListItem.createAllTableFields(table),
  identifier,
  _,
  symbol('.'),
  _,
  symbol('*'),
  _
)

const selectListExpression: Parser<SelectListItem> = seq(
  (expr, as, _ws1) => SelectListItem.createSelectListExpression(expr, as),
  expression,
  optional(as),
  _
)

const selectListItem = oneOf(
  allFields,
  attempt(allTableFields),
  selectListExpression
)

const selectList: Parser<SelectListItem[]> = sepBy1(itemSep, selectListItem)

const select: Parser<AST> = seq(
  (_select, _ws1, list, from, where, groupBy, orderBy, limit) =>
    Select.create(list, from, where, groupBy || [], orderBy || [], limit),
  reservedWord('SELECT'),
  _,
  selectList,
  optional(from),
  optional(where),
  optional(groupBy),
  optional(orderBy),
  optional(limit)
)

// INSERT

const columnList: Parser<string[]> = seq(
  $3,
  symbol('('),
  _,
  sepBy1(itemSep, seq($1, identifier, _)),
  symbol(')'),
  _
)

const defaultValues: Parser<Values> = seq(
  (_def, _ws1, _val, _ws2) => Values.defaultValues,
  reservedWord('DEFAULT'),
  _,
  reservedWord('VALUES'),
  _
)

const expressionValues: Parser<Values> = seq(
  (_val, _ws1, values, _ws2) => Values.createExpressionValues(values),
  reservedWord('VALUES'),
  _,
  sepBy(
    itemSep,
    seq(
      $3,
      symbol('('),
      _,
      sepBy1(
        itemSep,
        oneOf(seq($null, reservedWord('DEFAULT'), _), expression)
      ),
      symbol(')')
    )
  ),
  _
)

const values: Parser<Values> = oneOf(defaultValues, expressionValues)

const returning: Parser<SelectListItem[]> = seq(
  $3,
  reservedWord('RETURNING'),
  _,
  selectList
)

const insert: Parser<AST> = seq(
  (_ins, _ws1, _into, _ws2, table, _ws3, as, columns, values, returning) =>
    Insert.create(table, as, columns || [], values, returning || []),
  reservedWord('INSERT'),
  _,
  reservedWord('INTO'),
  _,
  identifier,
  _,
  optional(reqAs),
  optional(columnList),
  values,
  optional(returning)
)

// UPDATE

const updateAssignments: Parser<UpdateAssignment[]> = seq(
  $3,
  reservedWord('SET'),
  _,
  sepBy1(
    itemSep,
    seq(
      (columnName, _ws1, _eq, _ws2, value) => ({ columnName, value }),
      identifier,
      _,
      symbol('='),
      _,
      expression
    )
  )
)

const update: Parser<AST> = seq(
  (_upd, _ws1, table, _ws2, as, updates, from, where, returning) =>
    Update.create(table, as, updates, from, where, returning || []),
  reservedWord('UPDATE'),
  _,
  identifier,
  _,
  optional(reqAs),
  updateAssignments,
  optional(from),
  optional(where),
  optional(returning)
)

// DELETE

const delete_: Parser<AST> = seq(
  (_del, _ws1, _from, _ws2, table, _ws3, as, where, returning) =>
    Delete.create(table, as, where, returning || []),
  reservedWord('DELETE'),
  _,
  reservedWord('FROM'),
  _,
  identifier,
  _,
  optional(reqAs),
  optional(where),
  optional(returning)
)

// parse

const statementParser: Parser<AST> = seq(
  $2,
  _,
  oneOf(select, insert, update, delete_),
  end
)

export function parse(source: string): Either<string, AST> {
  return tryCatch(
    () => run(statementParser, source),
    e => (e as ParseError).explain()
  )
}
