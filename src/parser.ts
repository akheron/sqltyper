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
  expectString,
} from 'typed-parser'
import {
  AST,
  Delete,
  Expression,
  Insert,
  Limit,
  OrderBy,
  Select,
  SelectBody,
  SelectOp,
  SelectListItem,
  Statement,
  TableExpression,
  TableRef,
  UpdateAssignment,
  Values,
  Update,
  WithQuery,
} from './ast'
import { sqlReservedWords } from './constants'

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
        sqlReservedWords.includes(identifier.toUpperCase())
          ? toError(`Expected an identifier, got reserved word ${identifier}`)
          : identifier,
      matchIdentifier
    ),
    quotedIdentifier
  )
)

const reservedWord = <A extends string>(word: A): Parser<A> => {
  if (!sqlReservedWords.includes(word))
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

function parenthesized<T>(parser: Parser<T>): Parser<T> {
  return seq($3, symbol('('), _, parser, symbol(')'), _)
}

// [ AS ] identifier
const as: Parser<string> = seq(
  (_as, id, _ws1) => id,
  optional(seq($null, reservedWord('AS'), _)),
  identifier,
  _
)

// AS identifier
const reqAs: Parser<string> = seq($3, reservedWord('AS'), _, identifier, _)

// [ schema . ] table
const tableRef: Parser<TableRef> = seq(
  (id1, _ws1, id2) =>
    id2 ? TableRef.create(id1, id2) : TableRef.create(null, id1),
  identifier,
  _,
  optional(seq($3, symbol('.'), _, identifier, _))
)

// Expressions

const arraySubQueryExpr: Parser<Expression> = seq(
  (_arr, _ws, subquery) => Expression.createArraySubQuery(subquery),
  reservedWord('ARRAY'),
  _,
  parenthesized(lazy(() => select))
)

const functionArguments: Parser<Expression[]> = parenthesized(
  oneOf(
    // func(*} means no arguments
    seq((_a, _ws) => [], symbol('*'), _),
    sepBy(itemSep, lazy(() => expression))
  )
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

const parameterExpr: Parser<Expression> = seq(
  (_$, index) => Expression.createParameter(index),
  symbol('$'),
  int('[0-9]+')
)

const parenthesizedExpr: Parser<Expression> = parenthesized(
  lazy(() => expression)
)

const typeName: Parser<string> = seq(
  (id, _ws1, arraySuffix, _ws2) => id + arraySuffix,
  identifier,
  _,
  oneOf<'[]' | ''>(seq(_ => '[]', symbol('['), _, symbol(']')), constant('')),
  _
)

const primaryExpr: Parser<Expression> = seq(
  (expr, typeCast) =>
    typeCast != null ? Expression.createTypeCast(expr, typeCast) : expr,
  oneOf(
    arraySubQueryExpr,
    columnRefOrFunctionCallExpr,
    constantExpr,
    parameterExpr,
    parenthesizedExpr
  ),
  optional(seq($3, symbol('::'), _, typeName))
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

const subscriptExpr = seq(
  (next, _ws, subs) =>
    subs.reduce((acc, val) => Expression.createBinaryOp(acc, '[]', val), next),
  primaryExpr,
  _,
  many(seq($3, symbol('['), _, lazy(() => expression), symbol(']'), _))
)
const unaryPlusMinus = makeUnaryOp(oneOfOperators('+', '-'), subscriptExpr)
const expExpr = makeBinaryOp(operator('^'), unaryPlusMinus)
const mulDivModExpr = makeBinaryOp(oneOfOperators('*', '/', '%'), expExpr)
const addSubExpr = makeBinaryOp(oneOfOperators('+', '-'), mulDivModExpr)

const existsExpr = seq(
  (_exists, _ws, subquery) => Expression.createExistsOp(subquery),
  reservedWord('EXISTS'),
  _,
  parenthesized(lazy(() => select))
)

type InExprRhs = { op: 'IN' | 'NOT IN'; rhs: Select }
function isInExprRhs(a: any): a is InExprRhs {
  return a.op === 'IN' || a.op === 'NOT IN'
}
const inExpr: Parser<InExprRhs> = seq(
  (op, rhs) => ({ op, rhs }),
  attempt(
    oneOf<'IN' | 'NOT IN'>(
      seq(_ => 'IN', reservedWord('IN'), _),
      seq(_ => 'NOT IN', reservedWord('NOT'), _, reservedWord('IN'), _)
    )
  ),
  parenthesized(lazy(() => select))
)

type OtherExprRhs = { op: string; rhs: Expression }
const otherOpExpr: Parser<OtherExprRhs> = seq(
  (op, _ws, rhs) => ({ op, rhs }),
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
  _,
  addSubExpr
)
const otherOrInExpr = seq(
  (first, _ws1, rest, _ws2) =>
    rest.reduce(
      (acc, val) =>
        isInExprRhs(val)
          ? Expression.createInOp(acc, val.op, val.rhs)
          : Expression.createBinaryOp(acc, val.op, val.rhs),
      first
    ),
  addSubExpr,
  _,
  many(
    oneOf<
      { op: 'IN' | 'NOT IN'; rhs: Select } | { op: string; rhs: Expression }
    >(otherOpExpr, inExpr)
  ),
  _
)
const otherExpr = oneOf(existsExpr, otherOrInExpr)

makeBinaryOp(
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
  otherExpr
)

const isExpr = seq(
  (next, op) => (op ? Expression.createUnaryOp(op, next) : next),
  comparisonExpr,
  optional(
    oneOf(
      sepReserveds('IS NULL'),
      sepReserveds('IS NOT NULL'),
      seq($1, reservedWord('ISNULL'), _),
      seq($1, reservedWord('NOTNULL'), _),
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

// (name1, name2, ...)

const identifierList: Parser<string[]> = parenthesized(
  sepBy1(itemSep, seq($1, identifier, _))
)

// WITH

const withQueries: Parser<WithQuery[]> = seq(
  $3,
  reservedWord('WITH'),
  _,
  sepBy1(
    itemSep,
    seq(
      (as, _ws1, columns, _as, _ws2, stmt) =>
        WithQuery.create(as, columns, stmt),
      identifier,
      _,
      optional(identifierList),
      reservedWord('AS'),
      _,
      parenthesized(lazy(() => statementParser))
    )
  )
)

// FROM & JOIN

type JoinSpec = {
  join:
    | { kind: 'Cross' }
    | {
        kind: 'Qualified'
        type: TableExpression.JoinType
        condition: Expression
      }
    | { kind: 'Natural'; type: TableExpression.JoinType }
  tableExpr: TableExpression
}

const crossJoin: Parser<JoinSpec> = seq(
  (_cj, tableExpr) => ({ join: { kind: 'Cross' }, tableExpr }),
  sepReserveds('CROSS JOIN'),
  lazy(() => tableExpression)
)

const qualifiedJoinType: Parser<TableExpression.JoinType> = seq(
  (joinType, _join, _ws) => joinType || 'INNER',
  optional(
    oneOf(
      seq($1, reservedWord('INNER'), _),
      seq(
        $1,
        oneOf(
          reservedWord('LEFT'),
          reservedWord('RIGHT'),
          reservedWord('FULL')
        ),
        _,
        optional(seq($null, reservedWord('OUTER'), _))
      )
    )
  ),
  reservedWord('JOIN'),
  _
)

const qualifiedJoin: Parser<JoinSpec> = seq(
  (type, tableExpr, _on, _ws, condition) => ({
    join: { kind: 'Qualified', type, condition },
    tableExpr,
  }),
  qualifiedJoinType,
  lazy(() => tableExpression),
  reservedWord('ON'),
  _,
  expression
)

const naturalJoinType: Parser<TableExpression.JoinType> = seq(
  $3,
  reservedWord('NATURAL'),
  _,
  qualifiedJoinType
)

const naturalJoin: Parser<JoinSpec> = seq(
  (type, tableExpr) => ({ join: { kind: 'Natural', type }, tableExpr }),
  naturalJoinType,
  lazy(() => tableExpression)
)

const table: Parser<TableExpression> = seq(
  TableExpression.createTable,
  tableRef,
  optional(as)
)

function tableExprReducer(
  acc: TableExpression,
  joinSpec: JoinSpec
): TableExpression {
  switch (joinSpec.join.kind) {
    case 'Cross':
      return TableExpression.createCrossJoin(acc, joinSpec.tableExpr)
    case 'Qualified':
      return TableExpression.createQualifiedJoin(
        acc,
        joinSpec.join.type,
        joinSpec.tableExpr,
        joinSpec.join.condition
      )
    case 'Natural':
      return TableExpression.createQualifiedJoin(
        acc,
        joinSpec.join.type,
        joinSpec.tableExpr,
        null // null conditiong means NATURAL JOIN
      )
  }
}

const tableExpression: Parser<TableExpression> = seq(
  (lhs, rest) => (rest.length === 0 ? lhs : rest.reduce(tableExprReducer, lhs)),
  oneOf(
    attempt(seq($3, symbol('('), _, lazy(() => tableExpression), symbol(')'))),
    attempt(
      seq(
        (_lp, _ws1, stmt, _rp, _ws2, as) =>
          TableExpression.createSubQuery(stmt, as),
        symbol('('),
        _,
        lazy(() => statementParser),
        symbol(')'),
        _,
        as
      )
    ),
    seq($1, table, _)
  ),
  many(oneOf(crossJoin, qualifiedJoin, naturalJoin)),
  _
)

const from: Parser<TableExpression> = seq(
  (_from, _ws, tableExpr, rest) =>
    rest.length === 0
      ? tableExpr
      : // Implicit join equals to CROSS JOIN
        rest.reduce(
          (acc, next) => TableExpression.createCrossJoin(acc, next),
          tableExpr
        ),
  reservedWord('FROM'),
  _,
  tableExpression,
  many(seq($3, symbol(','), _, tableExpression))
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

const selectBody: Parser<SelectBody> = seq(
  (_sel, _ws, list, from, where, groupBy) =>
    SelectBody.create(list, from, where, groupBy || []),
  reservedWord('SELECT'),
  _,
  selectList,
  optional(from),
  optional(where),
  optional(groupBy)
)

const selectSetOps: Parser<SelectOp[]> = many(
  seq(
    (op, _ws1, duplicates, _ws2, body) =>
      SelectOp.create(op, duplicates || 'DISTINCT', body),
    oneOf(
      reservedWord('UNION'),
      reservedWord('INTERSECT'),
      reservedWord('EXCEPT')
    ),
    _,
    optional(oneOf(reservedWord('ALL'), reservedWord('DISTINCT'))),
    _,
    selectBody
  )
)

const select: Parser<Select> = seq(
  (withQueries, body, setOps, orderBy, limit) =>
    Select.create(withQueries || [], body, setOps, orderBy || [], limit),
  optional(withQueries),
  selectBody,
  selectSetOps,
  optional(orderBy),
  optional(limit)
)

// INSERT

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
    parenthesized(
      sepBy1(itemSep, oneOf(seq($null, reservedWord('DEFAULT'), _), expression))
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

const insertInto: Parser<TableRef> = seq(
  $5,
  reservedWord('INSERT'),
  _,
  reservedWord('INTO'),
  _,
  tableRef,
  _
)

const insert: Parser<Insert> = seq(
  (withQueries, table, as, columns, values, returning) =>
    Insert.create(
      withQueries || [],
      table,
      as,
      columns || [],
      values,
      returning || []
    ),
  optional(withQueries),
  insertInto,
  optional(reqAs),
  optional(identifierList),
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

const updateTable: Parser<TableRef> = seq(
  $3,
  reservedWord('UPDATE'),
  _,
  tableRef,
  _
)

const update: Parser<Update> = seq(
  (withQueries, table, as, updates, from, where, returning) =>
    Update.create(
      withQueries || [],
      table,
      as,
      updates,
      from,
      where,
      returning || []
    ),
  optional(withQueries),
  updateTable,
  optional(reqAs),
  updateAssignments,
  optional(from),
  optional(where),
  optional(returning)
)

// DELETE

const deleteFrom: Parser<TableRef> = seq(
  $5,
  reservedWord('DELETE'),
  _,
  reservedWord('FROM'),
  _,
  tableRef,
  _
)

const delete_: Parser<Delete> = seq(
  (table, as, where, returning) =>
    Delete.create(table, as, where, returning || []),
  deleteFrom,
  optional(reqAs),
  optional(where),
  optional(returning)
)

// parse

const statementParser: Parser<AST> = oneOf<Statement>(
  select,
  insert,
  update,
  delete_
)

const topLevelParser: Parser<AST> = seq($2, _, statementParser, end)

export function parse(source: string): Either<string, AST> {
  return tryCatch(
    () => run(topLevelParser, source),
    e => (e as ParseError).explain()
  )
}
