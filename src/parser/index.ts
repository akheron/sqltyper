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
  int,
  keyword,
  lazy,
  many,
  match,
  oneOf,
  run,
  sepBy,
  sepBy1,
  seq,
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
} from '../ast'

import { optional } from './utils'
import {
  _,
  anyOperator,
  anyOperatorExcept,
  expectIdentifier,
  identifier,
  operator,
  reservedWord,
  sepReserveds,
  symbol,
  symbolKeepWS,
} from './token'
import { specialFunctionCall } from './special-functions'

// ( ... )
export function parenthesized<T>(parser: Parser<T>): Parser<T> {
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

const caseBranch: Parser<Expression.CaseBranch> = seq(
  (_when, condition, _then, result) => ({ condition, result }),
  reservedWord('WHEN'),
  lazy(() => expression),
  reservedWord('THEN'),
  lazy(() => expression)
)

const caseElse: Parser<Expression> = seq(
  $2,
  reservedWord('ELSE'),
  lazy(() => expression)
)

const caseExpr: Parser<Expression> = seq(
  (_case, branch1, branches, else_, _end) =>
    Expression.createCase([branch1, ...branches], else_),
  reservedWord('CASE'),
  caseBranch,
  many(caseBranch),
  optional(caseElse),
  reservedWord('END')
)

const functionArguments: Parser<Expression[]> = parenthesized(
  oneOf(
    // func(*} means no arguments
    seq(_ => [], symbol('*')),
    sepBy(
      symbol(','),
      lazy(() => expression)
    )
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
  symbolKeepWS('\\'),
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
  oneOf(
    seq(
      (e, t) => e + t,
      strEscape,
      lazy(() => strInner)
    ),
    constant('')
  )
)

const stringConstant = seq($2, symbolKeepWS("'"), strInner, symbol("'"))

const constantExpr: Parser<Expression> = seq(
  (val, _ws) => Expression.createConstant(val),
  oneOf(
    expectIdentifier('TRUE'),
    expectIdentifier('FALSE'),
    expectIdentifier('NULL'),
    match('[0-9]+(\\.[0-9]+)?([eE]-?[0-9]+)?'),
    match('\\.[0-9]+'),
    stringConstant
  ),
  _
)

const parameterExpr: Parser<Expression> = seq(
  (_$, index, _ws) => Expression.createParameter(index),
  symbolKeepWS('$'),
  int('[0-9]+'),
  _
)

const parenthesizedExpr: Parser<Expression> = parenthesized(
  lazy(() => expression)
)

const typeName: Parser<string> = seq(
  (id, arraySuffix) => id + arraySuffix,
  identifier,
  oneOf<'[]' | ''>(
    seq(_ => '[]', symbol('['), symbol(']')),
    seq(_ => '', _)
  )
)

const primaryExpr: Parser<Expression> = seq(
  (expr, typeCast) =>
    typeCast != null ? Expression.createTypeCast(expr, typeCast) : expr,
  oneOf(
    arraySubQueryExpr,
    caseExpr,
    attempt(specialFunctionCall(lazy(() => primaryExpr))),
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
  many(
    seq(
      $2,
      symbol('['),
      lazy(() => expression),
      symbol(']')
    )
  )
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

type OtherExprRhs =
  | OtherExprRhs.In
  | OtherExprRhs.Ternary
  | OtherExprRhs.UnarySuffix
  | OtherExprRhs.OtherOp

namespace OtherExprRhs {
  export type In = {
    kind: 'InExprRhs'
    op: 'IN' | 'NOT IN'
    rhs: Select
  }
  const in_: Parser<In> = seq(
    (op, rhs) => ({ kind: 'InExprRhs', op, rhs }),
    attempt(
      oneOf<'IN' | 'NOT IN'>(
        reservedWord('IN'),
        seq(_ => 'NOT IN', reservedWord('NOT'), reservedWord('IN'))
      )
    ),
    parenthesized(lazy(() => select))
  )

  export type Ternary = {
    kind: 'TernaryExprRhs'
    op: string
    rhs1: Expression
    rhs2: Expression
  }
  const ternary: Parser<Ternary> = seq(
    (op, rhs1, _and, rhs2) => ({ kind: 'TernaryExprRhs', op, rhs1, rhs2 }),
    oneOf(
      attempt(sepReserveds('NOT BETWEEN SYMMETRIC')),
      attempt(sepReserveds('BETWEEN SYMMETRIC')),
      attempt(sepReserveds('NOT BETWEEN')),
      attempt(reservedWord('BETWEEN'))
    ),
    addSubExpr,
    reservedWord('AND'),
    addSubExpr
  )

  export type UnarySuffix = {
    kind: 'UnarySuffix'
    op: '!'
  }
  const unarySuffix: Parser<UnarySuffix> = seq(
    _ => ({ kind: 'UnarySuffix', op: '!' }),
    operator('!')
  )

  export type OtherOp = {
    kind: 'OtherOpExprRhs'
    op: string
    rhs: Expression
  }
  const otherOp: Parser<OtherOp> = seq(
    (op, rhs) => ({ kind: 'OtherOpExprRhs', op, rhs }),
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
      sepReserveds('IS DISTINCT FROM'),
      sepReserveds('IS NOT DISTINCT FROM'),
      reservedWord('LIKE')
    ),
    addSubExpr
  )

  export const parser = oneOf<OtherExprRhs>(in_, ternary, unarySuffix, otherOp)

  export function createExpression(
    lhs: Expression,
    rhs: OtherExprRhs
  ): Expression {
    switch (rhs.kind) {
      case 'InExprRhs':
        return Expression.createInOp(lhs, rhs.op, rhs.rhs)

      case 'TernaryExprRhs':
        return Expression.createTernaryOp(lhs, rhs.op, rhs.rhs1, rhs.rhs2)

      case 'UnarySuffix':
        return Expression.createUnaryOp(rhs.op, lhs)

      case 'OtherOpExprRhs':
        return Expression.createBinaryOp(lhs, rhs.op, rhs.rhs)
    }
  }
}

const otherExpr = seq(
  (first, rest) =>
    rest.reduce((acc, val) => OtherExprRhs.createExpression(acc, val), first),
  addSubExpr,
  many(OtherExprRhs.parser)
)
const existsOrOtherExpr = oneOf(existsExpr, otherExpr)

const comparisonExpr = makeBinaryOp(
  oneOfOperators('<', '>', '=', '<=', '>=', '<>'),
  existsOrOtherExpr
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
    attempt(
      seq(
        $2,
        symbol('('),
        lazy(() => tableExpression),
        symbol(')')
      )
    ),
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

// GROUP BY & HAVING

const groupBy: Parser<Expression[]> = seq(
  $3,
  reservedWord('GROUP'),
  reservedWord('BY'),
  sepBy1(symbol(','), expression)
)

const having: Parser<Expression> = seq($2, reservedWord('HAVING'), expression)

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
  (_sel, list, from, where, groupBy, having) =>
    SelectBody.create(list, from, where, groupBy || [], having),
  reservedWord('SELECT'),
  selectList,
  optional(from),
  optional(where),
  optional(groupBy),
  optional(having)
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
