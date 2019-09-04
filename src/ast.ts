// $1 -> index 1, $2 -> index 2, ...
export type Expression =
  | Expression.Identifier
  | Expression.Constant
  | Expression.Positional
  | Expression.UnaryOp
  | Expression.BinaryOp

export namespace Expression {
  export type Identifier = {
    kind: 'Identifier'
    identifier: string
  }

  export type Constant = {
    kind: 'Constant'
    value: string
  }

  export type Positional = {
    kind: 'Positional'
    index: number
  }

  export type UnaryOp = {
    kind: 'UnaryOp'
    op: string
    expression: Expression
  }

  export type BinaryOp = {
    kind: 'BinaryOp'
    lhs: Expression
    op: string
    rhs: Expression
  }

  export function createIdentifier(identifier: string): Identifier {
    return { kind: 'Identifier', identifier }
  }

  export function isIdentifier(expr: Expression): expr is Identifier {
    return expr.kind === 'Identifier'
  }

  export function createConstant(value: string): Constant {
    return { kind: 'Constant', value }
  }

  export function isConstant(expr: Expression): expr is Constant {
    return expr.kind === 'Constant'
  }

  export function createPositional(index: number): Positional {
    return { kind: 'Positional', index }
  }

  export function isPositional(expr: Expression): expr is Positional {
    return expr.kind === 'Positional'
  }

  export function createUnaryOp(op: string, expression: Expression): UnaryOp {
    return { kind: 'UnaryOp', op, expression }
  }

  export function isUnaryOp(expr: Expression): expr is UnaryOp {
    return expr.kind === 'UnaryOp'
  }

  export function createBinaryOp(
    lhs: Expression,
    op: string,
    rhs: Expression
  ): BinaryOp {
    return { kind: 'BinaryOp', lhs, op, rhs }
  }

  export function isBinaryOp(expr: Expression): expr is BinaryOp {
    return expr.kind === 'BinaryOp'
  }
}

export type SelectField = {
  expression: Expression
  as: string | null
}

export namespace SelectField {
  export function create(
    expression: Expression,
    as: string | null
  ): SelectField {
    return { expression, as }
  }
}

export type Join = {
  kind: 'JOIN'
  joinType: Join.JoinType
  table: string
  as: string | null
  condition: Expression
}

export namespace Join {
  export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'

  export function create(
    joinType: JoinType,
    table: string,
    as: string | null,
    condition: Expression
  ): Join {
    return { kind: 'JOIN', joinType, table, as, condition }
  }
}

export type From = {
  table: string
  as: string | null
  joins: Join[]
}

export namespace From {
  export function create(
    table: string,
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

export type Select = {
  selectList: SelectField[]
  from: From | null
  orderBy: OrderBy[]
}

export namespace Select {
  export function create(
    selectList: SelectField[],
    from: From | null,
    orderBy: OrderBy[]
  ): Select {
    return { selectList, from, orderBy }
  }
}

export type AST = Select
