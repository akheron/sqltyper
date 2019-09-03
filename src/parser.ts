import {
  $1,
  $2,
  $null,
  attempt,
  constant,
  end,
  int,
  keyword,
  many,
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
import { Expression, From, Join, OrderBy, Select, SelectField } from './ast'

export { isParseError } from 'typed-parser'

// Helpers

function optional<A>(parser: Parser<A>): Parser<A | null> {
  return oneOf(attempt(parser), seq($null, constant('')))
}

function typedKeyword<A extends string>(str: string, value: A): Parser<A> {
  return keyword(str, value)
}

function op<A extends string>(op: A): Parser<A> {
  return keyword(op, op)
}

// TODO: support quoted names like "foo"
const identifier = match('[a-zA-Z_][a-zA-Z0-9_]*')
const itemSep = seq($null, symbol(','), _)

const userInputExpression: Parser<Expression> = seq(
  (_$, index) => Expression.createUserInput(index),
  symbol('$'),
  int('[0-9]+')
)

const tablePrefix: Parser<string | null> = seq(
  $1,
  identifier,
  _,
  symbol('.'),
  _
)

const fieldExpression: Parser<Expression> = seq(
  (table, _2, field) => Expression.createField(table, field),
  optional(tablePrefix),
  _,
  identifier
)

const opExpression: Parser<Expression> = seq(
  (lhs, _ws, rest) =>
    rest != null ? Expression.createOp(lhs, rest.op, rest.rhs) : lhs,
  oneOf(fieldExpression, userInputExpression),
  _,
  optional(
    seq(
      (op, _ws1, rhs) => ({ op, rhs }),
      op('='),
      _,
      oneOf(fieldExpression, userInputExpression),
      _
    )
  )
)

const expression: Parser<Expression> = opExpression

const as: Parser<string | null> = seq(
  (_as, _ws1, id, _ws2) => id,
  keyword('AS'),
  _,
  identifier,
  _
)

const selectField: Parser<SelectField> = seq(
  (expr, as, _ws1) => SelectField.create(expr, as),
  expression,
  optional(as),
  _
)

const selectList: Parser<SelectField[]> = sepBy1(
  seq($null, itemSep),
  selectField
)

const joinType: Parser<Join.JoinType> = oneOf(
  typedKeyword('JOIN', 'INNER'),
  seq((..._args) => 'INNER', keyword('INNER'), _, keyword('JOIN')),
  seq(
    (..._args) => 'LEFT',
    keyword('LEFT'),
    _,
    optional(keyword('OUTER', 'OUTER')),
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
  (type, _ws1, table, as, _ws2, _on, _ws3, condition, _ws4) =>
    Join.create(type, table, as, condition),
  joinType,
  _,
  identifier,
  _,
  optional(
    seq((_as, _ws1, table, _ws2) => table, keyword('AS'), _, identifier, _)
  ),
  keyword('ON'),
  _,
  expression,
  _
)

const from = seq(
  (_from, _ws1, table, _ws2, joins, _ws3) => From.create(table, joins),
  keyword('FROM'),
  _,
  identifier,
  _,
  many(join),
  _
)

const orderBy = seq(
  (_order, _ws1, _by, _ws2, list) => list,
  keyword('ORDER'),
  _,
  keyword('BY'),
  _,
  sepBy1(
    itemSep,
    seq(
      (expr, _ws1, order, _ws2) => OrderBy.create(expr, order),
      expression,
      _,
      optional(oneOf(op('ASC'), op('DESC'))),
      _
    )
  )
)

const select: Parser<Select> = seq(
  (_select, list, _ws1, from, _ws2, orderBy) =>
    Select.create(list, from, orderBy || []),
  keyword('SELECT'),
  selectList,
  _,
  from,
  _,
  optional(orderBy)
)

const statementParser = seq($2, _, select, end)

export function parse(source: string): Select | ParseError {
  try {
    return run(statementParser, source)
  } catch (e) {
    return e as ParseError
  }
}
