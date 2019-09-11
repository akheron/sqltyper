import { Either, tryCatch } from 'fp-ts/lib/Either'
import {
  $1,
  $2,
  $3,
  $null,
  attempt,
  constant,
  end,
  int,
  many,
  map,
  match,
  oneOf,
  ParseError,
  Parser,
  run,
  sepBy1,
  seq,
  symbol,
  _,
  lazy,
} from 'typed-parser'
import {
  AST,
  Expression,
  From,
  Join,
  OrderBy,
  Select,
  SelectListItem,
} from './ast'

export { ParseError, isParseError } from 'typed-parser'

// Helpers

function optional<A>(parser: Parser<A>): Parser<A | null> {
  return oneOf(parser, seq($null, constant('')))
}

// Token parsers etc.

const matchIdentifier = match('[a-zA-Z_][a-zA-Z0-9_]*')

const reservedWords: string[] = [
  'AND',
  'AS',
  'ASC',
  'BETWEEN',
  'BY',
  'DESC',
  'FALSE',
  'FIRST',
  'FROM',
  'FULL',
  'ILIKE',
  'IN',
  'INNER',
  'IS',
  'ISNULL',
  'JOIN',
  'LEFT',
  'LAST',
  'LIKE',
  'NOT',
  'NOTNULL',
  'NULL',
  'NULLS',
  'ON',
  'OR',
  'ORDER',
  'OUTER',
  'RIGHT',
  'SELECT',
  'SIMILAR',
  'TRUE',
  'UNKNOWN',
  'USING',
]

const identifier = attempt(
  map(
    (identifier, toError) =>
      reservedWords.includes(identifier.toUpperCase())
        ? toError(`Expected an identifier, got reserved word ${identifier}`)
        : identifier,
    matchIdentifier
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

const as: Parser<string | null> = seq(
  (_as, id, _ws1) => id,
  optional(seq($null, reservedWord('AS'), _)),
  identifier,
  _
)

// Expressions

const schemaTableColumnExpr: Parser<Expression> = seq(
  (schema, _ws1, _p1, _ws2, table, _ws3, _p2, _ws4, column) =>
    Expression.createSchemaTableColumnRef(schema, table, column),
  identifier,
  _,
  symbol('.'),
  _,
  identifier,
  _,
  symbol('.'),
  _,
  identifier,
  _
)

const tableColumnExpr: Parser<Expression> = seq(
  (table, _ws1, _p1, _ws2, column) =>
    Expression.createTableColumnRef(table, column),
  identifier,
  _,
  symbol('.'),
  _,
  identifier,
  _
)

const columnExpr: Parser<Expression> = seq(
  column => Expression.createColumnRef(column),
  identifier,
  _
)

const columnRefExpr: Parser<Expression> = oneOf(
  attempt(schemaTableColumnExpr),
  attempt(tableColumnExpr),
  attempt(columnExpr)
  // TODO: Composite column reference, see
  // https://www.postgresql.org/docs/11/sql-expressions.html#FIELD-SELECTION
)

const constantExpr: Parser<Expression> = seq(
  Expression.createConstant,
  match('[0-9]+')
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
  columnRefExpr,
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

const fieldExpr = makeBinaryOp(seq(_ => '.', symbol('.')), primaryExpr)
const typeCastExpr = makeBinaryOp(seq(_ => '::', symbol('::')), fieldExpr)
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

const select: Parser<Select> = seq(
  (_select, _ws1, list, from, orderBy) =>
    Select.create(list, from, orderBy || []),
  reservedWord('SELECT'),
  _,
  selectList,
  optional(from),
  optional(orderBy)
)

// parse

const statementParser: Parser<Select> = seq($2, _, select, end)

export function parse(source: string): Either<ParseError, AST> {
  return tryCatch(() => run(statementParser, source), e => e as ParseError)
}
