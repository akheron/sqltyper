import { Either, tryCatch } from 'fp-ts/lib/Either'
import {
  ParseError,
  Parser,
  attempt,
  end,
  int,
  lazy,
  many,
  map,
  match,
  oneOf,
  run,
  sepBy,
  sepBy1,
  seq,
  seq1,
  seq2,
  seq3,
  seqConst,
  seqNull,
} from '../typed-parser'
import {
  AST,
  Delete,
  Distinct,
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
  WindowDefinition,
  NamedWindowDefinition,
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
  stringConstant,
  symbol,
  symbolKeepWS,
} from './token'
import { specialFunctionCall } from './special-functions'
import { prefixTypeCast, psqlTypeCast } from './typecasts'

// ( ... )
export function parenthesized<T>(parser: Parser<T>): Parser<T> {
  return seq2(symbol('('), parser, symbol(')'))
}

// [ AS ] identifier
const as: Parser<string> = seq2(optional(reservedWord('AS')), identifier)

// AS identifier
const reqAs: Parser<string> = seq2(reservedWord('AS'), identifier)

// [ schema . ] table
const tableRef: Parser<TableRef> = seq(
  identifier,
  optional(seq2(symbol('.'), identifier))
)((id1, id2) => (id2 ? TableRef.create(id1, id2) : TableRef.create(null, id1)))

// Expressions

const arraySubQueryExpr: Parser<Expression> = seq(
  reservedWord('ARRAY'),
  parenthesized(lazy(() => select))
)((_arr, subquery) => Expression.createArraySubQuery(subquery))

const caseBranch: Parser<Expression.CaseBranch> = seq(
  reservedWord('WHEN'),
  lazy(() => expression),
  reservedWord('THEN'),
  lazy(() => expression)
)((_when, condition, _then, result) => ({ condition, result }))

const caseElse: Parser<Expression> = seq2(
  reservedWord('ELSE'),
  lazy(() => expression)
)

const caseExpr: Parser<Expression> = seq(
  reservedWord('CASE'),
  caseBranch,
  many(caseBranch),
  optional(caseElse),
  reservedWord('END')
)((_case, branch1, branches, else_, _end) =>
  Expression.createCase([branch1, ...branches], else_)
)

const functionArguments: Parser<Expression[]> = parenthesized(
  oneOf(
    // func(*) means no arguments
    seqConst([], symbol('*')),
    sepBy(
      symbol(','),
      lazy(() => expression)
    )
  )
)

const windowDefinition: Parser<WindowDefinition> = oneOf<WindowDefinition>(
  identifier,
  seq(
    optional(
      seq3(
        reservedWord('PARTITION'),
        reservedWord('BY'),
        lazy(() => expression)
      )
    ),
    optional(lazy(() => orderBy))
  )((partition, order) => ({
    partitionBy: partition,
    orderBy: order,
  }))
)

const windowFilter: Parser<Expression> = seq2(
  reservedWord('FILTER'),
  parenthesized(
    seq2(
      reservedWord('WHERE'),
      lazy(() => expression)
    )
  )
)

const windowOver: Parser<WindowDefinition> = seq2(
  reservedWord('OVER'),
  oneOf(identifier, parenthesized(windowDefinition))
)

const columnRefOrFunctionCallExpr: Parser<Expression> = seq(
  identifier,
  optional(seq2(symbol('.'), identifier)),
  optional(
    seq(
      functionArguments,
      optional(windowFilter),
      optional(windowOver)
    )((argList, filter, window) => [argList, filter, window] as const)
  )
)((ident, ident2, fnCall) => {
  if (fnCall) {
    const [argList, filter, window] = fnCall
    if (ident2)
      return Expression.createFunctionCall(
        ident,
        ident2,
        argList,
        filter,
        window
      )
    return Expression.createFunctionCall(null, ident, argList, filter, window)
  }
  if (ident2) {
    return Expression.createTableColumnRef(ident, ident2)
  }
  return Expression.createColumnRef(ident)
})

const constantExpr: Parser<Expression> = seq(
  oneOf(
    expectIdentifier('TRUE'),
    expectIdentifier('FALSE'),
    expectIdentifier('NULL'),
    match('[0-9]+(\\.[0-9]+)?([eE]-?[0-9]+)?'),
    match('\\.[0-9]+'),
    stringConstant
  ),
  _
)((val, _ws) => Expression.createConstant(val))

const parameterExpr: Parser<Expression> = seq(
  symbolKeepWS('$'),
  int('[0-9]+'),
  _
)((_$, index, _ws) => Expression.createParameter(index))

const parenthesizedSubqueryOrExpr: Parser<Expression> = parenthesized(
  oneOf(
    seq(lazy(() => select))(Expression.createScalarSubQuery),
    lazy(() => expression)
  )
)

const primaryExpr: Parser<Expression> = seq(
  oneOf(
    arraySubQueryExpr,
    caseExpr,
    attempt(specialFunctionCall(lazy(() => primaryExpr))),
    attempt(prefixTypeCast),
    columnRefOrFunctionCallExpr,
    constantExpr,
    parameterExpr,
    parenthesizedSubqueryOrExpr
  ),
  optional(psqlTypeCast)
)((expr, typeCast) =>
  typeCast != null ? Expression.createTypeCast(expr, typeCast) : expr
)

function makeUnaryOp(
  oper: Parser<string>,
  nextExpr: Parser<Expression>
): Parser<Expression> {
  return seq(
    many(oper),
    nextExpr
  )((ops, next) =>
    ops.length > 0
      ? ops.reduceRight((acc, op) => Expression.createUnaryOp(op, acc), next)
      : next
  )
}

function makeBinaryOp(
  oper: Parser<string>,
  nextExpr: Parser<Expression>
): Parser<Expression> {
  return seq(
    nextExpr,
    many(seq(oper, nextExpr)((op, next) => ({ op, next })))
  )((first, rest) =>
    rest.reduce(
      (acc, val) => Expression.createBinaryOp(acc, val.op, val.next),
      first
    )
  )
}

const oneOfOperators = (...ops: string[]): Parser<string> =>
  oneOf(...ops.map(operator))

const subscriptExpr = seq(
  primaryExpr,
  many(
    seq2(
      symbol('['),
      lazy(() => expression),
      symbol(']')
    )
  )
)((next, subs) =>
  subs.reduce((acc, val) => Expression.createBinaryOp(acc, '[]', val), next)
)
const unaryPlusMinus = makeUnaryOp(oneOfOperators('+', '-'), subscriptExpr)
const expExpr = makeBinaryOp(operator('^'), unaryPlusMinus)
const mulDivModExpr = makeBinaryOp(oneOfOperators('*', '/', '%'), expExpr)
const addSubExpr = makeBinaryOp(oneOfOperators('+', '-'), mulDivModExpr)

const existsExpr = seq(
  reservedWord('EXISTS'),
  parenthesized(lazy(() => select))
)((_exists, subquery) => Expression.createExistsOp(subquery))

const otherExpr = seq(
  addSubExpr,
  many(OtherExprRhs.parser)
)((first, rest) =>
  rest.reduce((acc, val) => OtherExprRhs.createExpression(acc, val), first)
)
const existsOrOtherExpr = oneOf(existsExpr, otherExpr)

const comparisonExpr = makeBinaryOp(
  oneOfOperators('<', '>', '=', '<=', '>=', '<>'),
  existsOrOtherExpr
)

const isExpr = seq(
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
)((next, op) => (op ? Expression.createUnaryOp(op, next) : next))
const notExpr = makeUnaryOp(reservedWord('NOT'), isExpr)
const andExpr = makeBinaryOp(reservedWord('AND'), notExpr)
const orExpr: Parser<Expression> = makeBinaryOp(reservedWord('OR'), andExpr)

const expression: Parser<Expression> = orExpr

type OtherExprRhs =
  | OtherExprRhs.In
  | OtherExprRhs.Ternary
  | OtherExprRhs.UnarySuffix
  | OtherExprRhs.OtherOp

namespace OtherExprRhs {
  export type In = {
    kind: 'InExprRhs'
    op: 'IN' | 'NOT IN'
    rhs: Expression.InRhs
  }
  const in_: Parser<In> = seq(
    attempt(
      oneOf<'IN' | 'NOT IN'>(
        reservedWord('IN'),
        seqConst('NOT IN', reservedWord('NOT'), reservedWord('IN'))
      )
    ),
    parenthesized(
      oneOf<Expression.InRhs>(
        map(
          Expression.createInSubquery,
          lazy(() => select)
        ),
        map(Expression.createInExprList, sepBy1(symbol(','), expression))
      )
    )
  )((op, rhs) => ({ kind: 'InExprRhs', op, rhs }))

  export type Ternary = {
    kind: 'TernaryExprRhs'
    op: string
    rhs1: Expression
    rhs2: Expression
  }
  const ternary: Parser<Ternary> = seq(
    oneOf(
      attempt(sepReserveds('NOT BETWEEN SYMMETRIC')),
      attempt(sepReserveds('BETWEEN SYMMETRIC')),
      attempt(sepReserveds('NOT BETWEEN')),
      attempt(reservedWord('BETWEEN'))
    ),
    addSubExpr,
    reservedWord('AND'),
    addSubExpr
  )((op, rhs1, _and, rhs2) => ({ kind: 'TernaryExprRhs', op, rhs1, rhs2 }))

  export type UnarySuffix = {
    kind: 'UnarySuffix'
    op: '!'
  }
  const unarySuffix: Parser<UnarySuffix> = seqConst(
    { kind: 'UnarySuffix', op: '!' },
    operator('!')
  )

  export type OtherOp = {
    kind: 'OtherOpExprRhs'
    op: string
    rhs: Expression
  }
  const otherOp: Parser<OtherOp> = seq(
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
  )((op, rhs) => ({ kind: 'OtherOpExprRhs', op, rhs }))

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

// (name1, name2, ...)

const identifierList: Parser<string[]> = parenthesized(
  sepBy1(symbol(','), identifier)
)

// WITH

const withQueries: Parser<WithQuery[]> = seq2(
  reservedWord('WITH'),
  sepBy1(
    symbol(','),
    seq(
      identifier,
      optional(identifierList),
      reservedWord('AS'),
      parenthesized(lazy(() => statementParser))
    )((as, columns, _as, stmt) => WithQuery.create(as, columns, stmt))
  )
)

// FROM & JOIN

type JoinSpec = {
  join:
    | { kind: 'Cross' }
    | {
        kind: 'Qualified'
        type: TableExpression.JoinType
        condition: TableExpression.JoinCondition
      }
    | { kind: 'Natural'; type: TableExpression.JoinType }
  tableExpr: TableExpression
}

const crossJoin: Parser<JoinSpec> = seq(
  sepReserveds('CROSS JOIN'),
  lazy(() => tableExpression)
)((_cj, tableExpr) => ({ join: { kind: 'Cross' }, tableExpr }))

const qualifiedJoinType: Parser<TableExpression.JoinType> = seq(
  optional(
    oneOf(
      reservedWord('INNER'),
      seq1(
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
)((joinType, _join) => joinType || 'INNER')

const qualifiedJoin: Parser<JoinSpec> = seq(
  qualifiedJoinType,
  lazy(() => tableExpression),
  oneOf(
    seq(
      reservedWord('ON'),
      expression
    )((_on, expr) => TableExpression.createJoinOn(expr)),
    seq(
      reservedWord('USING'),
      identifierList
    )((_using, columns) => TableExpression.createJoinUsing(columns))
  )
)((type, tableExpr, condition) => ({
  join: { kind: 'Qualified', type, condition },
  tableExpr,
}))

const naturalJoinType: Parser<TableExpression.JoinType> = seq2(
  reservedWord('NATURAL'),
  qualifiedJoinType
)

const naturalJoin: Parser<JoinSpec> = seq(
  naturalJoinType,
  lazy(() => tableExpression)
)((type, tableExpr) => ({ join: { kind: 'Natural', type }, tableExpr }))

const table: Parser<TableExpression> = seq(
  tableRef,
  optional(as)
)(TableExpression.createTable)

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
        TableExpression.joinNatural
      )
  }
}

const tableExpression: Parser<TableExpression> = seq(
  oneOf(
    attempt(
      seq2(
        symbol('('),
        lazy(() => tableExpression),
        symbol(')')
      )
    ),
    attempt(
      seq(
        parenthesized(lazy(() => statementParser)),
        as
      )((stmt, as) => TableExpression.createSubQuery(stmt, as))
    ),
    table
  ),
  many(oneOf(crossJoin, qualifiedJoin, naturalJoin))
)((lhs, rest) => (rest.length === 0 ? lhs : rest.reduce(tableExprReducer, lhs)))

const from: Parser<TableExpression> = seq(
  reservedWord('FROM'),
  tableExpression,
  many(seq2(symbol(','), tableExpression))
)((_from, tableExpr, rest) =>
  rest.length === 0
    ? tableExpr
    : // Implicit join equals to CROSS JOIN
      rest.reduce(
        (acc, next) => TableExpression.createCrossJoin(acc, next),
        tableExpr
      )
)

// WHERE

const where: Parser<Expression> = seq2(reservedWord('WHERE'), expression)

// GROUP BY & HAVING

const groupBy: Parser<Expression[]> = seq3(
  reservedWord('GROUP'),
  reservedWord('BY'),
  sepBy1(symbol(','), expression)
)

const having: Parser<Expression> = seq2(reservedWord('HAVING'), expression)

// WINDOW

const window: Parser<NamedWindowDefinition[]> = seq2(
  reservedWord('WINDOW'),
  sepBy1(
    symbol(','),
    seq(
      identifier,
      reservedWord('AS'),
      parenthesized(windowDefinition)
    )((name, _as, window) => NamedWindowDefinition.create(name, window))
  )
)

// ORDER BY

const orderByOrder: Parser<OrderBy.Order> = oneOf<OrderBy.Order>(
  reservedWord('ASC'),
  reservedWord('DESC'),
  seq(reservedWord('USING'), anyOperator)((_using, op) => ['USING', op])
)

const orderByNulls: Parser<OrderBy.Nulls> = seq2(
  reservedWord('NULLS'),
  oneOf(reservedWord('FIRST'), reservedWord('LAST'))
)

const orderByItem: Parser<OrderBy> = seq(
  expression,
  optional(orderByOrder),
  optional(orderByNulls)
)((expr, order, nulls) => OrderBy.create(expr, order, nulls))

const orderBy: Parser<OrderBy[]> = seq(
  reservedWord('ORDER'),
  reservedWord('BY'),
  sepBy1(symbol(','), orderByItem)
)((_order, _by, list) => list)

// LIMIT

const limit: Parser<Limit> = seq(
  reservedWord('LIMIT'),
  oneOf(seqNull(reservedWord('ALL')), expression),
  optional(seq2(reservedWord('OFFSET'), expression))
)((_l, count, offset) => Limit.create(count, offset))

// SELECT

const distinct: Parser<Distinct> = oneOf<Distinct>(
  reservedWord('ALL'),
  seq(
    reservedWord('DISTINCT'),
    optional(
      seq2(reservedWord('ON'), parenthesized(sepBy1(symbol(','), expression)))
    )
  )((_distinct, on) => (on ? on : 'DISTINCT'))
)

const allFields: Parser<SelectListItem> = seqConst(
  SelectListItem.createAllFields(),
  symbol('*')
)

const allTableFields: Parser<SelectListItem> = seq(
  identifier,
  symbol('.'),
  symbol('*')
)((table, _p, _a) => SelectListItem.createAllTableFields(table))

const selectListExpression: Parser<SelectListItem> = seq(
  expression,
  optional(as)
)((expr, as) => SelectListItem.createSelectListExpression(expr, as))

const selectListItem = oneOf(
  allFields,
  attempt(allTableFields),
  selectListExpression
)

const selectList: Parser<SelectListItem[]> = sepBy1(symbol(','), selectListItem)

const selectBody: Parser<SelectBody> = seq(
  reservedWord('SELECT'),
  optional(distinct),
  selectList,
  optional(from),
  optional(where),
  optional(groupBy),
  optional(having),
  optional(window)
)((_sel, distinct, list, from, where, groupBy, having, window) =>
  SelectBody.create(
    distinct || 'ALL',
    list,
    from,
    where,
    groupBy || [],
    having,
    window || []
  )
)

const selectSetOps: Parser<SelectOp[]> = many(
  seq(
    oneOf(
      reservedWord('UNION'),
      reservedWord('INTERSECT'),
      reservedWord('EXCEPT')
    ),
    optional(oneOf(reservedWord('ALL'), reservedWord('DISTINCT'))),
    selectBody
  )((op, duplicates, body) =>
    SelectOp.create(op, duplicates || 'DISTINCT', body)
  )
)

const select: Parser<Select> = seq(
  optional(withQueries),
  selectBody,
  selectSetOps,
  optional(orderBy),
  optional(limit)
)((withQueries, body, setOps, orderBy, limit) =>
  Select.create(withQueries || [], body, setOps, orderBy || [], limit)
)

// INSERT

const defaultValues: Parser<Values> = seq(
  reservedWord('DEFAULT'),
  reservedWord('VALUES')
)((_def, _val) => Values.defaultValues)

const expressionValues: Parser<Values> = seq(
  reservedWord('VALUES'),
  sepBy(
    symbol(','),
    parenthesized(
      sepBy1(symbol(','), oneOf(seqNull(reservedWord('DEFAULT')), expression))
    )
  )
)((_val, values) => Values.createExpressionValues(values))

const values: Parser<Values> = oneOf(defaultValues, expressionValues)

const onConstraint = seqNull(
  reservedWord('ON'),
  reservedWord('CONSTRAINT'),
  identifier
)

const conflictTarget: Parser<null> = oneOf(
  seqNull(identifierList),
  onConstraint
)

const conflictAction: Parser<UpdateAssignment[] | null> = seq2(
  reservedWord('DO'),
  oneOf(
    seqNull(reservedWord('NOTHING')),
    seq2(
      reservedWord('UPDATE'),
      lazy(() => updateAssignments)
    )
  )
)

const onConflict: Parser<UpdateAssignment[] | null> = seq(
  reservedWord('ON'),
  reservedWord('CONFLICT'),
  optional(conflictTarget),
  conflictAction
)((_on, _conflict, _target, action) => action)

const returning: Parser<SelectListItem[]> = seq2(
  reservedWord('RETURNING'),
  selectList
)

const insertInto: Parser<TableRef> = seq3(
  reservedWord('INSERT'),
  reservedWord('INTO'),
  tableRef
)

const insert: Parser<Insert> = seq(
  optional(withQueries),
  insertInto,
  optional(reqAs),
  optional(identifierList),
  oneOf<Values | Select>(
    values,
    lazy(() => select)
  ),
  optional(onConflict),
  optional(returning)
)((withQueries, table, as, columns, values, onConflict, returning) =>
  Insert.create(
    withQueries || [],
    table,
    as,
    columns || [],
    values,
    onConflict || [],
    returning || []
  )
)

// UPDATE

const updateAssignments: Parser<UpdateAssignment[]> = seq2(
  reservedWord('SET'),
  sepBy1(
    symbol(','),
    seq(
      identifier,
      symbol('='),
      expression
    )((columnName, _eq, value) => ({ columnName, value }))
  )
)

const updateTable: Parser<TableRef> = seq2(reservedWord('UPDATE'), tableRef)

const update: Parser<Update> = seq(
  optional(withQueries),
  updateTable,
  optional(as),
  updateAssignments,
  optional(from),
  optional(where),
  optional(returning)
)((withQueries, table, as, updates, from, where, returning) =>
  Update.create(
    withQueries || [],
    table,
    as,
    updates,
    from,
    where,
    returning || []
  )
)

// DELETE

const deleteFrom: Parser<TableRef> = seq3(
  reservedWord('DELETE'),
  reservedWord('FROM'),
  tableRef
)

const delete_: Parser<Delete> = seq(
  deleteFrom,
  optional(reqAs),
  optional(where),
  optional(returning)
)((table, as, where, returning) =>
  Delete.create(table, as, where, returning || [])
)

// parse

const statementParser: Parser<AST> = seq1(
  oneOf<Statement>(attempt(select), attempt(insert), attempt(update), delete_),
  optional(symbol(';'))
)

const topLevelParser: Parser<AST> = seq2(_, statementParser, end)

export function parse(source: string): Either<string, AST> {
  return tryCatch(
    () => run(topLevelParser, source),
    (e) => (e as ParseError).explain()
  )
}
