// $1 -> index 1, $2 -> index 2, ...
export type Expression =
  | Expression.Literal
  | Expression.Field
  | Expression.Op
  | Expression.UserInput

export namespace Expression {
  export type Literal = {
    kind: 'Literal'
    value: string
  }

  export type UserInput = {
    kind: 'UserInput'
    index: number
  }

  export type Field = {
    kind: 'Field'
    chain: string[]
  }

  export type Operator = '=' | '<' | '>'

  export type Op = {
    kind: 'Op'
    lhs: Expression
    op: Operator
    rhs: Expression
  }

  export function createLiteral(value: string): Literal {
    return { kind: 'Literal', value }
  }

  export function isLiteral(expr: Expression): expr is UserInput {
    return expr.kind === 'Literal'
  }

  export function createUserInput(index: number): UserInput {
    return { kind: 'UserInput', index }
  }

  export function isUserInput(expr: Expression): expr is UserInput {
    return expr.kind === 'UserInput'
  }

  export function createField(chain: string[]): Field {
    return { kind: 'Field', chain }
  }

  export function isField(expr: Expression): expr is Field {
    return expr.kind === 'Field'
  }

  export function createOp(lhs: Expression, op: Operator, rhs: Expression): Op {
    return { kind: 'Op', lhs, op, rhs }
  }

  export function isOp(expr: Expression): expr is Op {
    return expr.kind === 'Op'
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
  export type Order = 'ASC' | 'DESC' | Expression.Operator
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
