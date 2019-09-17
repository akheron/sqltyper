// $1 -> index 1, $2 -> index 2, ...
export type Expression =
  | Expression.ColumnRef
  | Expression.TableColumnRef
  | Expression.Constant
  | Expression.Positional
  | Expression.UnaryOp
  | Expression.BinaryOp
  | Expression.FunctionCall

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

  export type Positional = {
    kind: 'Positional'
    index: number
  }

  export function createPositional(index: number): Positional {
    return { kind: 'Positional', index }
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

  export function walk<T>(
    expr: Expression,
    handlers: {
      columnRef: (value: ColumnRef) => T
      tableColumnRef: (value: TableColumnRef) => T
      constant: (value: Constant) => T
      positional: (value: Positional) => T
      unaryOp: (value: UnaryOp) => T
      binaryOp: (value: BinaryOp) => T
      functionCall: (value: FunctionCall) => T
    }
  ): T {
    switch (expr.kind) {
      case 'ColumnRef':
        return handlers.columnRef(expr)
      case 'TableColumnRef':
        return handlers.tableColumnRef(expr)
      case 'Constant':
        return handlers.constant(expr)
      case 'Positional':
        return handlers.positional(expr)
      case 'UnaryOp':
        return handlers.unaryOp(expr)
      case 'BinaryOp':
        return handlers.binaryOp(expr)
      case 'FunctionCall':
        return handlers.functionCall(expr)
    }
  }

  export function walkConstant<T>(
    expr: Expression,
    elseVal: T,
    handler: (node: Constant) => T
  ): T {
    switch (expr.kind) {
      case 'Constant':
        return handler(expr)
      default:
        return elseVal
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

export type TableRef = { schema: string | null; table: string }

export namespace TableRef {
  export function create(schema: string | null, table: string) {
    return { schema, table }
  }
}

export type Join = {
  kind: 'JOIN'
  joinType: Join.JoinType
  table: TableRef
  as: string | null
  condition: Expression
}

export namespace Join {
  export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'

  export function create(
    joinType: JoinType,
    table: TableRef,
    as: string | null,
    condition: Expression
  ): Join {
    return { kind: 'JOIN', joinType, table, as, condition }
  }
}

export type From = {
  table: TableRef
  as: string | null
  joins: Join[]
}

export namespace From {
  export function create(
    table: TableRef,
    as: string | null,
    joins: Join[]
  ): From {
    return { table, as, joins }
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
  from: From | null
  where: Expression | null
  groupBy: Expression[]
}

export namespace SelectBody {
  export function create(
    selectList: SelectListItem[],
    from: From | null,
    where: Expression | null,
    groupBy: Expression[]
  ): SelectBody {
    return { selectList, from, where, groupBy }
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
    values: Array<Array<null | Expression>> // null means DEFAULT
  }

  export function createExpressionValues(
    values: Array<Array<null | Expression>>
  ): ExpressionValues {
    return { kind: 'ExpressionValues', values }
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
  from: From | null
  where: Expression | null
  returning: SelectListItem[]
}

export namespace Update {
  export function create(
    ctes: WithQuery[],
    table: TableRef,
    as: string | null,
    updates: UpdateAssignment[],
    from: From | null,
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

export type AST = {
  statement: Statement
  startOffset: number
  endOffset: number
}

export namespace AST {
  export function create(
    statement: Statement,
    startOffset: number,
    endOffset: number
  ): AST {
    return { statement, startOffset, endOffset }
  }
}

export function walk<T>(
  ast: AST,
  handlers: {
    select: (node: Select) => T
    insert: (node: Insert) => T
    update: (node: Update) => T
    delete: (node: Delete) => T
  }
): T {
  switch (ast.statement.kind) {
    case 'Select':
      return handlers.select(ast.statement)
    case 'Insert':
      return handlers.insert(ast.statement)
    case 'Update':
      return handlers.update(ast.statement)
    case 'Delete':
      return handlers.delete(ast.statement)
  }
}
