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

function kwValue<A extends string>(str: string, value: A): Parser<A> {
  return keyword(str, value)
}

function kw<A extends string>(op: A): Parser<A> {
  return keyword(op, op)
}

const reservedWords: string[] = ['AS', 'FROM', 'ON', 'ORDER']

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

const oper = oneOf(kw('='), kw('<'), kw('>'))

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

const primaryExpression = oneOf(
  literalExpression,
  userInputExpression,
  fieldExpression
)

const opExpression: Parser<Expression> = seq(
  (lhs, _ws, rest) =>
    rest != null ? Expression.createOp(lhs, rest.op, rest.rhs) : lhs,
  primaryExpression,
  _,
  optional(seq((op, _ws1, rhs) => ({ op, rhs }), oper, _, primaryExpression, _))
)

const expression: Parser<Expression> = opExpression

const as: Parser<string | null> = seq(
  (_as, id, _ws1) => id,
  optional(seq($null, keyword('AS'), _)),
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
  kwValue('JOIN', 'INNER'),
  seq((..._args) => 'INNER', keyword('INNER'), _, keyword('JOIN')),
  seq(
    (..._args) => 'LEFT',
    keyword('LEFT'),
    _,
    optional(keyword('OUTER')),
    _,
    keyword('JOIN')
  ),
  seq(
    (..._args) => 'RIGHT',
    keyword('RIGHT'),
    _,
    optional(keyword('OUTER', 'OUTER')),
    _,
    keyword('JOIN')
  ),
  seq(
    (..._args) => 'FULL',
    keyword('FULL'),
    _,
    optional(keyword('OUTER', 'OUTER')),
    _,
    keyword('JOIN')
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
  keyword('ON'),
  _,
  expression
)

const from = seq(
  (_from, _ws1, table, _ws2, as, joins, _ws3) => From.create(table, as, joins),
  keyword('FROM'),
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
    seq($3, keyword('USING'), _, oper, _)
  ),
  _
)

const orderByNulls: Parser<OrderBy.Nulls> = seq(
  $3,
  keyword('NULLS'),
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
  keyword('ORDER'),
  _,
  keyword('BY'),
  _,
  sepBy1(itemSep, orderByItem)
)

const select: Parser<Select> = seq(
  (_select, _ws1, list, _ws2, from, orderBy) =>
    Select.create(list, from, orderBy || []),
  keyword('SELECT'),
  _,
  selectList,
  _,
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
