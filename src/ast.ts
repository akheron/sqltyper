import * as R from 'ramda'
import { isOperatorCommutative } from './const-utils'

// $1 -> index 1, $2 -> index 2, ...
export type Expression =
  | Expression.ColumnRef
  | Expression.TableColumnRef
  | Expression.Constant
  | Expression.Parameter
  | Expression.UnaryOp
  | Expression.BinaryOp
  | Expression.TernaryOp
  | Expression.ExistsOp
  | Expression.InOp
  | Expression.FunctionCall
  | Expression.ArraySubQuery
  | Expression.Case
  | Expression.TypeCast

export namespace Expression {
  export type ColumnRef = {
    kind: 'ColumnRef'
    column: string
  }

  export function createColumnRef(column: string): ColumnRef {
    return { kind: 'ColumnRef', column }
  }

  export type TableColumnRef = {
    kind: 'TableColumnRef'
    table: string
    column: string
  }

  export function createTableColumnRef(
    table: string,
    column: string
  ): TableColumnRef {
    return { kind: 'TableColumnRef', table, column }
  }

  export type Constant = {
    kind: 'Constant'
    valueText: string
  }

  export function createConstant(valueText: string): Constant {
    return { kind: 'Constant', valueText }
  }

  export type Parameter = {
    kind: 'Parameter'
    index: number
  }

  export function createParameter(index: number): Parameter {
    return { kind: 'Parameter', index }
  }

  export type UnaryOp = {
    kind: 'UnaryOp'
    op: string
    operand: Expression
  }

  export function createUnaryOp(op: string, operand: Expression): UnaryOp {
    return { kind: 'UnaryOp', op, operand }
  }

  export type BinaryOp = {
    kind: 'BinaryOp'
    lhs: Expression
    op: string
    rhs: Expression
  }

  export function createBinaryOp(
    lhs: Expression,
    op: string,
    rhs: Expression
  ): BinaryOp {
    return { kind: 'BinaryOp', lhs, op, rhs }
  }

  export type TernaryOp = {
    kind: 'TernaryOp'
    lhs: Expression
    op: string
    rhs1: Expression
    rhs2: Expression
  }

  export function createTernaryOp(
    lhs: Expression,
    op: string,
    rhs1: Expression,
    rhs2: Expression
  ): TernaryOp {
    return { kind: 'TernaryOp', lhs, op, rhs1, rhs2 }
  }

  export type ExistsOp = {
    kind: 'ExistsOp'
    subquery: Select
  }

  export function createExistsOp(subquery: Select): ExistsOp {
    return { kind: 'ExistsOp', subquery }
  }

  export type InOp = {
    kind: 'InOp'
    lhs: Expression
    op: 'IN' | 'NOT IN'
    subquery: Select
  }

  export function createInOp(
    lhs: Expression,
    op: 'IN' | 'NOT IN',
    subquery: Select
  ): InOp {
    return { kind: 'InOp', lhs, op, subquery }
  }

  export type FunctionCall = {
    kind: 'FunctionCall'
    funcName: string
    argList: Expression[]
  }

  export function createFunctionCall(
    funcName: string,
    argList: Expression[]
  ): FunctionCall {
    return { kind: 'FunctionCall', funcName, argList }
  }

  export type ArraySubQuery = {
    kind: 'ArraySubQuery'
    subquery: Select
  }

  export function createArraySubQuery(subquery: Select): ArraySubQuery {
    return { kind: 'ArraySubQuery', subquery }
  }

  export type CaseBranch = {
    condition: Expression
    result: Expression
  }

  export type Case = {
    kind: 'Case'
    branches: CaseBranch[]
    else_: Expression | null
  }

  export function createCase(
    branches: CaseBranch[],
    else_: Expression | null
  ): Case {
    return { kind: 'Case', branches, else_ }
  }

  export type TypeCast = {
    kind: 'TypeCast'
    lhs: Expression
    targetType: string
  }

  export function createTypeCast(
    lhs: Expression,
    targetType: string
  ): TypeCast {
    return { kind: 'TypeCast', lhs, targetType }
  }

  export function walkSome<T>(
    expr: Expression,
    elseVal: T,
    handlers: {
      columnRef?: (value: ColumnRef) => T
      tableColumnRef?: (value: TableColumnRef) => T
      constant?: (value: Constant) => T
      parameter?: (value: Parameter) => T
      unaryOp?: (value: UnaryOp) => T
      binaryOp?: (value: BinaryOp) => T
      ternaryOp?: (value: TernaryOp) => T
      existsOp?: (value: ExistsOp) => T
      inOp?: (value: InOp) => T
      functionCall?: (value: FunctionCall) => T
      arraySubQuery?: (value: ArraySubQuery) => T
      case?: (value: Case) => T
      typeCast?: (value: TypeCast) => T
    }
  ): T {
    switch (expr.kind) {
      case 'ColumnRef':
        return handlers.columnRef == null ? elseVal : handlers.columnRef(expr)
      case 'TableColumnRef':
        return handlers.tableColumnRef == null
          ? elseVal
          : handlers.tableColumnRef(expr)
      case 'Constant':
        return handlers.constant == null ? elseVal : handlers.constant(expr)
      case 'Parameter':
        return handlers.parameter == null ? elseVal : handlers.parameter(expr)
      case 'UnaryOp':
        return handlers.unaryOp == null ? elseVal : handlers.unaryOp(expr)
      case 'BinaryOp':
        return handlers.binaryOp == null ? elseVal : handlers.binaryOp(expr)
      case 'TernaryOp':
        return handlers.ternaryOp == null ? elseVal : handlers.ternaryOp(expr)
      case 'ExistsOp':
        return handlers.existsOp == null ? elseVal : handlers.existsOp(expr)
      case 'InOp':
        return handlers.inOp == null ? elseVal : handlers.inOp(expr)
      case 'FunctionCall':
        return handlers.functionCall == null
          ? elseVal
          : handlers.functionCall(expr)
      case 'ArraySubQuery':
        return handlers.arraySubQuery == null
          ? elseVal
          : handlers.arraySubQuery(expr)
      case 'Case':
        return handlers.case == null ? elseVal : handlers.case(expr)
      case 'TypeCast':
        return handlers.typeCast == null ? elseVal : handlers.typeCast(expr)
    }
  }

  export function walk<T>(
    expr: Expression,
    handlers: {
      columnRef: (value: ColumnRef) => T
      tableColumnRef: (value: TableColumnRef) => T
      constant: (value: Constant) => T
      parameter: (value: Parameter) => T
      unaryOp: (value: UnaryOp) => T
      binaryOp: (value: BinaryOp) => T
      ternaryOp: (value: TernaryOp) => T
      existsOp: (value: ExistsOp) => T
      inOp: (value: InOp) => T
      functionCall: (value: FunctionCall) => T
      arraySubQuery: (value: ArraySubQuery) => T
      case: (value: Case) => T
      typeCast: (value: TypeCast) => T
    }
  ): T {
    switch (expr.kind) {
      case 'ColumnRef':
        return handlers.columnRef(expr)
      case 'TableColumnRef':
        return handlers.tableColumnRef(expr)
      case 'Constant':
        return handlers.constant(expr)
      case 'Parameter':
        return handlers.parameter(expr)
      case 'UnaryOp':
        return handlers.unaryOp(expr)
      case 'BinaryOp':
        return handlers.binaryOp(expr)
      case 'TernaryOp':
        return handlers.ternaryOp(expr)
      case 'ExistsOp':
        return handlers.existsOp(expr)
      case 'InOp':
        return handlers.inOp(expr)
      case 'FunctionCall':
        return handlers.functionCall(expr)
      case 'ArraySubQuery':
        return handlers.arraySubQuery(expr)
      case 'Case':
        return handlers.case(expr)
      case 'TypeCast':
        return handlers.typeCast(expr)
    }
  }

  export function equals(a: Expression, b: Expression): boolean {
    switch (a.kind) {
      case 'ColumnRef':
        // `tbl.col` and `col` in an expression context must point to
        // the same column. Otherwise the expression would be invalid
        // because of an unambiguous column reference.
        if (b.kind === 'TableColumnRef') return a.column === b.column
        if (a.kind !== b.kind) return false
        return a.column === b.column
      case 'TableColumnRef':
        // `tbl.col` and `col` in an expression context must point to
        // the same column. Otherwise the expression would be invalid
        // because of an unambiguous column reference.
        if (b.kind === 'ColumnRef') return a.column === b.column
        if (a.kind !== b.kind) return false
        return a.table === b.table && a.column === b.column
      case 'Constant':
        if (a.kind !== b.kind) return false
        return a.valueText === b.valueText // TODO: This doesn't work in some cases, e.g. with '1.0' and '1.00'
      case 'Parameter':
        if (a.kind !== b.kind) return false
        return a.index === b.index
      case 'UnaryOp':
        if (a.kind !== b.kind || a.op !== b.op) return false
        return equals(a.operand, b.operand)
      case 'BinaryOp':
        if (a.kind !== b.kind || a.op != b.op) return false
        return (
          (equals(a.lhs, b.lhs) && equals(a.rhs, b.rhs)) ||
          (isOperatorCommutative(a.op) &&
            equals(a.lhs, b.rhs) &&
            equals(a.rhs, b.lhs))
        )
      case 'TernaryOp':
        if (a.kind !== b.kind || a.op != b.op) return false
        return (
          equals(a.lhs, b.lhs) &&
          equals(a.rhs1, b.rhs1) &&
          equals(a.rhs2, b.rhs2)
        )
      case 'ExistsOp':
        if (a.kind !== b.kind) return false
        return false // TODO
      case 'InOp':
        if (a.kind !== b.kind) return false
        return false // TODO
      case 'FunctionCall':
        if (a.kind !== b.kind) return false
        return (
          a.funcName === b.funcName &&
          R.zip(a.argList, b.argList).every(([ap, bp]) => equals(ap, bp))
        )
      case 'ArraySubQuery':
        if (a.kind !== b.kind) return false
        return false // TODO
      case 'Case':
        if (a.kind !== b.kind) return false
        return (
          R.zip(a.branches, b.branches).every(
            ([ab, bb]) =>
              equals(ab.condition, bb.condition) && equals(ab.result, bb.result)
          ) &&
          ((a.else_ !== null && b.else_ !== null && equals(a.else_, b.else_)) ||
            (a.else_ === null && b.else_ === null))
        )
      case 'TypeCast':
        if (a.kind !== b.kind) return false
        return equals(a.lhs, b.lhs) && a.targetType == b.targetType
    }
  }
}

export type SelectListItem =
  | SelectListItem.SelectListExpression // SELECT expr [ AS name ]
  | SelectListItem.AllTableFields // SELECT tbl.*
  | SelectListItem.AllFields // SELECT *

export namespace SelectListItem {
  export type SelectListExpression = {
    kind: 'SelectListExpression'
    expression: Expression
    as: string | null
  }

  export function createSelectListExpression(
    expression: Expression,
    as: string | null
  ): SelectListExpression {
    return { kind: 'SelectListExpression', expression, as }
  }

  export type AllTableFields = {
    kind: 'AllTableFields'
    tableName: string
  }

  export function createAllTableFields(tableName: string): AllTableFields {
    return { kind: 'AllTableFields', tableName }
  }

  export type AllFields = {
    kind: 'AllFields'
  }

  export function createAllFields(): AllFields {
    return { kind: 'AllFields' }
  }

  export function walk<T>(
    item: SelectListItem,
    handlers: {
      selectListExpression: (value: SelectListExpression) => T
      allTableFields: (value: AllTableFields) => T
      allFields: (value: AllFields) => T
    }
  ): T {
    switch (item.kind) {
      case 'SelectListExpression':
        return handlers.selectListExpression(item)
      case 'AllTableFields':
        return handlers.allTableFields(item)
      case 'AllFields':
        return handlers.allFields(item)
    }
  }
}

export type TableRef = {
  kind: 'TableRef'
  schema: string | null
  table: string
}

export namespace TableRef {
  export function create(schema: string | null, table: string): TableRef {
    return { kind: 'TableRef', schema, table }
  }
}

export type TableExpression =
  | TableExpression.Table
  | TableExpression.SubQuery
  | TableExpression.CrossJoin
  | TableExpression.QualifiedJoin

export namespace TableExpression {
  export type Table = {
    kind: 'Table'
    table: TableRef
    as: string | null
  }

  export function createTable(table: TableRef, as: string | null): Table {
    return { kind: 'Table', table, as }
  }

  export type SubQuery = {
    kind: 'SubQuery'
    query: AST
    as: string
  }

  export function createSubQuery(query: AST, as: string): SubQuery {
    return { kind: 'SubQuery', query, as }
  }

  export type CrossJoin = {
    kind: 'CrossJoin'
    left: TableExpression
    right: TableExpression
  }

  export function createCrossJoin(
    left: TableExpression,
    right: TableExpression
  ): CrossJoin {
    return { kind: 'CrossJoin', left, right }
  }

  export type QualifiedJoin = {
    kind: 'QualifiedJoin'
    left: TableExpression
    joinType: JoinType
    right: TableExpression
    condition: Expression | null // null means NATURAL JOIN
  }

  export function createQualifiedJoin(
    left: TableExpression,
    joinType: JoinType,
    right: TableExpression,
    condition: Expression | null
  ): QualifiedJoin {
    return { kind: 'QualifiedJoin', left, joinType, right, condition }
  }

  export type NaturalJoin = {
    kind: 'NaturalJoin'
    left: TableExpression
    joinType: JoinType
    right: TableExpression
  }

  export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'

  export function walk<T>(
    tableExpr: TableExpression,
    handlers: {
      table: (node: Table) => T
      subQuery: (node: SubQuery) => T
      crossJoin: (node: CrossJoin) => T
      qualifiedJoin: (node: QualifiedJoin) => T
    }
  ): T {
    switch (tableExpr.kind) {
      case 'Table':
        return handlers.table(tableExpr)
      case 'SubQuery':
        return handlers.subQuery(tableExpr)
      case 'CrossJoin':
        return handlers.crossJoin(tableExpr)
      case 'QualifiedJoin':
        return handlers.qualifiedJoin(tableExpr)
    }
  }
}

export type OrderBy = {
  expression: Expression
  order: OrderBy.Order | null
  nulls: OrderBy.Nulls | null
}

export namespace OrderBy {
  export type Order = 'ASC' | 'DESC' | ['USING', string]
  export type Nulls = 'FIRST' | 'LAST'

  export function create(
    expression: Expression,
    order: Order | null,
    nulls: Nulls | null
  ): OrderBy {
    return { expression, order, nulls }
  }
}

export type Limit = {
  count: Expression | null // null mean LIMIT ALL
  offset: Expression | null
}

export namespace Limit {
  export function create(
    count: Expression | null,
    offset: Expression | null
  ): Limit {
    return { count, offset }
  }
}

export type SelectBody = {
  selectList: SelectListItem[]
  from: TableExpression | null
  where: Expression | null
  groupBy: Expression[]
  having: Expression | null
}

export namespace SelectBody {
  export function create(
    selectList: SelectListItem[],
    from: TableExpression | null,
    where: Expression | null,
    groupBy: Expression[],
    having: Expression | null
  ): SelectBody {
    return { selectList, from, where, groupBy, having }
  }
}

export type SelectOp = {
  op: 'UNION' | 'INTERSECT' | 'EXCEPT'
  duplicates: 'DISTINCT' | 'ALL'
  select: SelectBody
}

export namespace SelectOp {
  export function create(
    op: 'UNION' | 'INTERSECT' | 'EXCEPT',
    duplicates: 'DISTINCT' | 'ALL',
    select: SelectBody
  ): SelectOp {
    return { op, duplicates, select }
  }
}

export type Select = {
  kind: 'Select'
  ctes: WithQuery[]
  body: SelectBody
  setOps: SelectOp[]
  orderBy: OrderBy[]
  limit: Limit | null
}

export namespace Select {
  export function create(
    ctes: WithQuery[],
    body: SelectBody,
    setOps: SelectOp[],
    orderBy: OrderBy[],
    limit: Limit | null
  ): Select {
    return {
      kind: 'Select',
      ctes,
      body,
      setOps,
      orderBy,
      limit,
    }
  }
}

// ---------------------------------------------------------------------

export type Values = Values.DefaultValues | Values.ExpressionValues

export namespace Values {
  export type DefaultValues = { kind: 'DefaultValues' }

  export const defaultValues: DefaultValues = { kind: 'DefaultValues' }

  export type ExpressionValues = {
    kind: 'ExpressionValues'
    valuesList: Array<Array<null | Expression>> // null means DEFAULT
  }

  export function createExpressionValues(
    valuesList: Array<Array<null | Expression>>
  ): ExpressionValues {
    return { kind: 'ExpressionValues', valuesList }
  }

  export function walk<T>(
    values: Values,
    handlers: {
      defaultValues: (node: DefaultValues) => T
      exprValues: (node: ExpressionValues) => T
    }
  ): T {
    switch (values.kind) {
      case 'DefaultValues':
        return handlers.defaultValues(values)
      case 'ExpressionValues':
        return handlers.exprValues(values)
    }
  }
}

export type Insert = {
  kind: 'Insert'
  ctes: WithQuery[]
  table: TableRef
  as: string | null
  columns: string[]
  values: Values
  returning: SelectListItem[]
}

export namespace Insert {
  export function create(
    ctes: WithQuery[],
    table: TableRef,
    as: string | null,
    columns: string[],
    values: Values,
    returning: SelectListItem[]
  ): Insert {
    return {
      kind: 'Insert',
      ctes,
      table,
      as,
      columns,
      values,
      returning,
    }
  }
}

// ---------------------------------------------------------------------

export type UpdateAssignment = {
  columnName: string
  value: Expression | null // null means DEFAULT
}

export type Update = {
  kind: 'Update'
  ctes: WithQuery[]
  table: TableRef
  as: string | null
  updates: UpdateAssignment[]
  from: TableExpression | null
  where: Expression | null
  returning: SelectListItem[]
}

export namespace Update {
  export function create(
    ctes: WithQuery[],
    table: TableRef,
    as: string | null,
    updates: UpdateAssignment[],
    from: TableExpression | null,
    where: Expression | null,
    returning: SelectListItem[]
  ): Update {
    return {
      kind: 'Update',
      ctes,
      table,
      as,
      updates,
      from,
      where,
      returning,
    }
  }
}

export type Delete = {
  kind: 'Delete'
  table: TableRef
  as: string | null
  where: Expression | null
  returning: SelectListItem[]
}

export namespace Delete {
  export function create(
    table: TableRef,
    as: string | null,
    where: Expression | null,
    returning: SelectListItem[]
  ): Delete {
    return { kind: 'Delete', table, as, where, returning }
  }
}

// ---------------------------------------------------------------------

export type WithQuery = {
  as: string
  columnNames: string[] | null
  query: AST
}

export namespace WithQuery {
  export function create(
    as: string,
    columnNames: string[] | null,
    query: AST
  ): WithQuery {
    return { as, columnNames, query }
  }
}

// ---------------------------------------------------------------------

export type Statement = Select | Insert | Update | Delete

export type AST = Statement

export function walk<T>(
  ast: AST,
  handlers: {
    select: (node: Select) => T
    insert: (node: Insert) => T
    update: (node: Update) => T
    delete: (node: Delete) => T
  }
): T {
  switch (ast.kind) {
    case 'Select':
      return handlers.select(ast)
    case 'Insert':
      return handlers.insert(ast)
    case 'Update':
      return handlers.update(ast)
    case 'Delete':
      return handlers.delete(ast)
  }
}
