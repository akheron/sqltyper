import {
  $1,
  $2,
  $3,
  $null,
  attempt,
  constant,
  end,
  int,
  keyword,
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
  SelectField,
} from './ast'

export { ParseError, isParseError } from 'typed-parser'

// Helpers

function optional<A>(parser: Parser<A>): Parser<A | null> {
  return oneOf(parser, seq($null, constant('')))
}

function kw<A extends string>(op: A): Parser<A> {
  return keyword(op, op)
}

const reservedWords: string[] = [
  'AS',
  'FROM',
  'LEFT',
  'INNER',
  'JOIN',
  'ON',
  'ORDER',
]

// TODO: support quoted names like "foo"
const identifier = attempt(
  map(
    (identifier, toError) =>
      reservedWords.indexOf(identifier) != -1
        ? toError('not an identifier')
        : identifier,
    match('[a-zA-Z_][a-zA-Z0-9_]*')
  )
)

const reserved = (word: string): Parser<string> =>
  attempt(
    map(
      (identifier, toError) =>
        identifier !== word ? toError(`${word} expected`) : word,
      match('[a-zA-Z_][a-zA-Z0-9_]*')
    )
  )

const operator = match('[-+*/<>=~!@#%^&|`?]{1,63}')

const fieldSep = seq($null, symbol('.'), _)
const itemSep = seq($null, symbol(','), _)

const literalExpression: Parser<Expression> = seq(
  Expression.createLiteral,
  match('[0-9]+')
)

const userInputExpression: Parser<Expression> = seq(
  (_$, index) => Expression.createUserInput(index),
  symbol('$'),
  int('[0-9]+')
)

const fieldExpression: Parser<Expression.Field> = seq(
  Expression.createField,
  sepBy1(fieldSep, seq($1, identifier, _))
)

const parenthesizedExpression: Parser<Expression> = seq(
  $3,
  symbol('('),
  _,
  lazy(() => expression),
  _,
  symbol(')'),
  _
)

const primaryExpression = oneOf(
  literalExpression,
  userInputExpression,
  fieldExpression,
  parenthesizedExpression
)

// Hard-coded to only allow the ! operator
const unaryOpExpression: Parser<Expression> = seq(
  (op, expr, _ws1) => (op ? Expression.createUnaryOp('!', expr) : expr),
  optional(seq((_excl, _ws) => true, symbol('!'), _)),
  primaryExpression,
  _
)

const binaryOpExpression: Parser<Expression> = seq(
  (lhs, rest) =>
    rest != null ? Expression.createBinaryOp(lhs, rest.op, rest.rhs) : lhs,
  unaryOpExpression,
  optional(
    seq((op, _ws1, rhs) => ({ op, rhs }), operator, _, unaryOpExpression, _)
  )
)

const expression: Parser<Expression> = binaryOpExpression

const as: Parser<string | null> = seq(
  (_as, id, _ws1) => id,
  optional(seq($null, reserved('AS'), _)),
  identifier,
  _
)

const selectField: Parser<SelectField> = seq(
  (expr, as, _ws1) => SelectField.create(expr, as),
  expression,
  optional(as),
  _
)

const selectList: Parser<SelectField[]> = sepBy1(itemSep, selectField)

const joinType: Parser<Join.JoinType> = oneOf(
  seq((..._args) => 'INNER', reserved('JOIN')),
  seq((..._args) => 'INNER', reserved('INNER'), _, reserved('JOIN')),
  seq(
    (..._args) => 'LEFT',
    reserved('LEFT'),
    _,
    optional(reserved('OUTER')),
    _,
    reserved('JOIN')
  ),
  seq(
    (..._args) => 'RIGHT',
    reserved('RIGHT'),
    _,
    optional(reserved('OUTER')),
    _,
    reserved('JOIN')
  ),
  seq(
    (..._args) => 'FULL',
    reserved('FULL'),
    _,
    optional(reserved('OUTER')),
    _,
    reserved('JOIN')
  )
)

const join: Parser<Join> = seq(
  (type, _ws1, table, _ws2, as, _on, _ws3, condition) =>
    Join.create(type, table, as, condition),
  joinType,
  _,
  identifier,
  _,
  optional(as),
  reserved('ON'),
  _,
  expression
)

const from = seq(
  (_from, _ws1, table, _ws2, as, joins, _ws3) => From.create(table, as, joins),
  reserved('FROM'),
  _,
  identifier,
  _,
  optional(as),
  many(join),
  _
)

const orderByOrder: Parser<OrderBy.Order> = seq(
  $1,
  oneOf<OrderBy.Order>(
    kw('ASC'),
    kw('DESC'),
    seq(
      (_using, _ws1, op, _ws2) => ['USING', op],
      reserved('USING'),
      _,
      operator,
      _
    )
  ),
  _
)

const orderByNulls: Parser<OrderBy.Nulls> = seq(
  $3,
  reserved('NULLS'),
  _,
  oneOf(kw('FIRST'), kw('LAST')),
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
  reserved('ORDER'),
  _,
  reserved('BY'),
  _,
  sepBy1(itemSep, orderByItem)
)

const select: Parser<Select> = seq(
  (_select, _ws1, list, from, orderBy) =>
    Select.create(list, from, orderBy || []),
  reserved('SELECT'),
  _,
  selectList,
  optional(from),
  optional(orderBy)
)

const statementParser: Parser<Select> = seq($2, _, select, end)

export function parse(source: string): AST | ParseError {
  try {
    return run(statementParser, source)
  } catch (e) {
    return e as ParseError
  }
}
