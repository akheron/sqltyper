import { Either, tryCatch } from 'fp-ts/lib/Either'
import {
  $1,
  $2,
  $3,
  $null,
  ParseError,
  Parser,
  attempt,
  constant,
  end,
  expectString,
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
  skip,
  stringBefore,
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

function optional<A>(parser: Parser<A>): Parser<A | null> {
  return oneOf(parser, seq($null, constant('')))
}

// Token parsers etc.

// whitespace and comments
const _: Parser<null> = seq(
  $null,
  skip('\\s*'),
  many(seq($null, expectString('--'), stringBefore('\n'), skip('\\s*')))
)

function symbol(s: string) {
  return seq($null, expectString(s, 'symbol'), _)
}

// Like symbol but doesn't skip whitespace
function symbolOnly(s: string) {
  return expectString(s, 'symbol')
}

const matchIdentifier = match('[a-zA-Z_][a-zA-Z0-9_]*')

const quotedEscape = seq(
  $2,
  symbolOnly('\\'),
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
const quotedIdentifier = seq($2, symbolOnly('"'), quotedInner, symbol('"'))

const identifier = seq(
  $1,
  attempt(
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
  ),
  _
)

const reservedWord = <A extends string>(word: A): Parser<A> => {
  if (!sqlReservedWords.includes(word))
    throw new Error(`INTERNAL ERROR: ${word} is not included in reservedWords`)
  return seq(
    $1,
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

const sepReserveds = (words: string): Parser<string> =>
  attempt(
    seq(_ => words, ...words.split(/\s+/).map(word => reservedWord(word)))
  )

const anyOperator = seq($1, match('[-+*/<>=~!@#%^&|`?]{1,63}'), _)

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

function parenthesized<T>(parser: Parser<T>): Parser<T> {
  return seq($2, symbol('('), parser, symbol(')'))
}

// [ AS ] identifier
const as: Parser<string> = seq(
  (_as, id) => id,
  optional(reservedWord('AS')),
  identifier
)

// AS identifier
const reqAs: Parser<string> = seq($2, reservedWord('AS'), identifier)

// [ schema . ] table
const tableRef: Parser<TableRef> = seq(
  (id1, id2) => (id2 ? TableRef.create(id1, id2) : TableRef.create(null, id1)),
  identifier,
  optional(seq($2, symbol('.'), identifier))
)

// Expressions

const arraySubQueryExpr: Parser<Expression> = seq(
  (_arr, subquery) => Expression.createArraySubQuery(subquery),
  reservedWord('ARRAY'),
  parenthesized(lazy(() => select))
)

const functionArguments: Parser<Expression[]> = parenthesized(
  oneOf(
    // func(*} means no arguments
    seq(_ => [], symbol('*')),
    sepBy(symbol(','), lazy(() => expression))
  )
)

const columnRefOrFunctionCallExpr: Parser<Expression> = seq(
  (ident, rest) =>
    rest == null
      ? Expression.createColumnRef(ident)
      : typeof rest === 'string'
      ? Expression.createTableColumnRef(ident, rest)
      : Expression.createFunctionCall(ident, rest),
  identifier,
  oneOf<string | Expression[] | null>(
    seq($2, symbol('.'), identifier),
    functionArguments,
    _
  )
)

const strEscape = seq(
  $2,
  symbolOnly('\\'),
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

const stringConstant = seq($2, symbolOnly("'"), strInner, symbol("'"))

const constantExpr: Parser<Expression> = seq(
  (val, _ws) => Expression.createConstant(val),
  oneOf(match('[0-9]+'), stringConstant),
  _
)

const parameterExpr: Parser<Expression> = seq(
  (_$, index, _ws) => Expression.createParameter(index),
  symbolOnly('$'),
  int('[0-9]+'),
  _
)

const parenthesizedExpr: Parser<Expression> = parenthesized(
  lazy(() => expression)
)

const typeName: Parser<string> = seq(
  (id, arraySuffix) => id + arraySuffix,
  identifier,
  oneOf<'[]' | ''>(seq(_ => '[]', symbol('['), symbol(']')), seq(_ => '', _))
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
  optional(seq($2, symbol('::'), typeName))
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
    many(oper),
    nextExpr
  )
}

function makeBinaryOp(
  oper: Parser<string>,
  nextExpr: Parser<Expression>
): Parser<Expression> {
  return seq(
    (first, rest) =>
      rest.reduce(
        (acc, val) => Expression.createBinaryOp(acc, val.op, val.next),
        first
      ),
    nextExpr,
    many(seq((op, next) => ({ op, next }), oper, nextExpr))
  )
}

const oneOfOperators = (...ops: string[]): Parser<string> =>
  oneOf(...ops.map(operator))

const subscriptExpr = seq(
  (next, subs) =>
    subs.reduce((acc, val) => Expression.createBinaryOp(acc, '[]', val), next),
  primaryExpr,
  many(seq($2, symbol('['), lazy(() => expression), symbol(']')))
)
const unaryPlusMinus = makeUnaryOp(oneOfOperators('+', '-'), subscriptExpr)
const expExpr = makeBinaryOp(operator('^'), unaryPlusMinus)
const mulDivModExpr = makeBinaryOp(oneOfOperators('*', '/', '%'), expExpr)
const addSubExpr = makeBinaryOp(oneOfOperators('+', '-'), mulDivModExpr)

const existsExpr = seq(
  (_exists, subquery) => Expression.createExistsOp(subquery),
  reservedWord('EXISTS'),
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
      reservedWord('IN'),
      seq(_ => 'NOT IN', reservedWord('NOT'), reservedWord('IN'))
    )
  ),
  parenthesized(lazy(() => select))
)

type OtherExprRhs = { op: string; rhs: Expression }
const otherOpExpr: Parser<OtherExprRhs> = seq(
  (op, rhs) => ({ op, rhs }),
  oneOf(
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
    reservedWord('LIKE')
  ),
  addSubExpr
)
const otherOrInExpr = seq(
  (first, rest) =>
    rest.reduce(
      (acc, val) =>
        isInExprRhs(val)
          ? Expression.createInOp(acc, val.op, val.rhs)
          : Expression.createBinaryOp(acc, val.op, val.rhs),
      first
    ),
  addSubExpr,
  many(
    oneOf<
      { op: 'IN' | 'NOT IN'; rhs: Select } | { op: string; rhs: Expression }
    >(otherOpExpr, inExpr)
  )
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

// (name1, name2, ...)

const identifierList: Parser<string[]> = parenthesized(
  sepBy1(symbol(','), identifier)
)

// WITH

const withQueries: Parser<WithQuery[]> = seq(
  $2,
  reservedWord('WITH'),
  sepBy1(
    symbol(','),
    seq(
      (as, columns, _as, stmt) => WithQuery.create(as, columns, stmt),
      identifier,
      optional(identifierList),
      reservedWord('AS'),
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
  (joinType, _join) => joinType || 'INNER',
  optional(
    oneOf(
      reservedWord('INNER'),
      seq(
        $1,
        oneOf(
          reservedWord('LEFT'),
          reservedWord('RIGHT'),
          reservedWord('FULL')
        ),
        optional(reservedWord('OUTER'))
      )
    )
  ),
  reservedWord('JOIN')
)

const qualifiedJoin: Parser<JoinSpec> = seq(
  (type, tableExpr, _on, condition) => ({
    join: { kind: 'Qualified', type, condition },
    tableExpr,
  }),
  qualifiedJoinType,
  lazy(() => tableExpression),
  reservedWord('ON'),
  expression
)

const naturalJoinType: Parser<TableExpression.JoinType> = seq(
  $2,
  reservedWord('NATURAL'),
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
    attempt(seq($2, symbol('('), lazy(() => tableExpression), symbol(')'))),
    attempt(
      seq(
        (stmt, as) => TableExpression.createSubQuery(stmt, as),
        parenthesized(lazy(() => statementParser)),
        as
      )
    ),
    table
  ),
  many(oneOf(crossJoin, qualifiedJoin, naturalJoin))
)

const from: Parser<TableExpression> = seq(
  (_from, tableExpr, rest) =>
    rest.length === 0
      ? tableExpr
      : // Implicit join equals to CROSS JOIN
        rest.reduce(
          (acc, next) => TableExpression.createCrossJoin(acc, next),
          tableExpr
        ),
  reservedWord('FROM'),
  tableExpression,
  many(seq($2, symbol(','), tableExpression))
)

// WHERE

const where: Parser<Expression> = seq($2, reservedWord('WHERE'), expression)

// GROUP BY

const groupBy: Parser<Expression[]> = seq(
  $3,
  reservedWord('GROUP'),
  reservedWord('BY'),
  sepBy1(symbol(','), expression)
)

// ORDER BY

const orderByOrder: Parser<OrderBy.Order> = oneOf<OrderBy.Order>(
  reservedWord('ASC'),
  reservedWord('DESC'),
  seq((_using, op) => ['USING', op], reservedWord('USING'), anyOperator)
)

const orderByNulls: Parser<OrderBy.Nulls> = seq(
  $2,
  reservedWord('NULLS'),
  oneOf(reservedWord('FIRST'), reservedWord('LAST'))
)

const orderByItem: Parser<OrderBy> = seq(
  (expr, order, nulls) => OrderBy.create(expr, order, nulls),
  expression,
  optional(orderByOrder),
  optional(orderByNulls)
)

const orderBy: Parser<OrderBy[]> = seq(
  (_order, _by, list) => list,
  reservedWord('ORDER'),
  reservedWord('BY'),
  sepBy1(symbol(','), orderByItem)
)

// LIMIT

const limit: Parser<Limit> = seq(
  (_l, count, offset) => Limit.create(count, offset),
  reservedWord('LIMIT'),
  oneOf(seq($null, reservedWord('ALL')), expression),
  optional(seq($2, reservedWord('OFFSET'), expression))
)

// SELECT

const allFields: Parser<SelectListItem> = seq(
  _ => SelectListItem.createAllFields(),
  symbol('*')
)

const allTableFields: Parser<SelectListItem> = seq(
  (table, _p, _a) => SelectListItem.createAllTableFields(table),
  identifier,
  symbol('.'),
  symbol('*')
)

const selectListExpression: Parser<SelectListItem> = seq(
  (expr, as) => SelectListItem.createSelectListExpression(expr, as),
  expression,
  optional(as)
)

const selectListItem = oneOf(
  allFields,
  attempt(allTableFields),
  selectListExpression
)

const selectList: Parser<SelectListItem[]> = sepBy1(symbol(','), selectListItem)

const selectBody: Parser<SelectBody> = seq(
  (_sel, list, from, where, groupBy) =>
    SelectBody.create(list, from, where, groupBy || []),
  reservedWord('SELECT'),
  selectList,
  optional(from),
  optional(where),
  optional(groupBy)
)

const selectSetOps: Parser<SelectOp[]> = many(
  seq(
    (op, duplicates, body) =>
      SelectOp.create(op, duplicates || 'DISTINCT', body),
    oneOf(
      reservedWord('UNION'),
      reservedWord('INTERSECT'),
      reservedWord('EXCEPT')
    ),
    optional(oneOf(reservedWord('ALL'), reservedWord('DISTINCT'))),
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
  (_def, _val) => Values.defaultValues,
  reservedWord('DEFAULT'),
  reservedWord('VALUES')
)

const expressionValues: Parser<Values> = seq(
  (_val, values) => Values.createExpressionValues(values),
  reservedWord('VALUES'),
  sepBy(
    symbol(','),
    parenthesized(
      sepBy1(
        symbol(','),
        oneOf(seq($null, reservedWord('DEFAULT')), expression)
      )
    )
  )
)

const values: Parser<Values> = oneOf(defaultValues, expressionValues)

const returning: Parser<SelectListItem[]> = seq(
  $2,
  reservedWord('RETURNING'),
  selectList
)

const insertInto: Parser<TableRef> = seq(
  $3,
  reservedWord('INSERT'),
  reservedWord('INTO'),
  tableRef
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
  $2,
  reservedWord('SET'),
  sepBy1(
    symbol(','),
    seq(
      (columnName, _eq, value) => ({ columnName, value }),
      identifier,
      symbol('='),
      expression
    )
  )
)

const updateTable: Parser<TableRef> = seq($2, reservedWord('UPDATE'), tableRef)

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
  $3,
  reservedWord('DELETE'),
  reservedWord('FROM'),
  tableRef
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
