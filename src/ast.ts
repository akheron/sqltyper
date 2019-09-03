// $1 -> index 1, $2 -> index 2, ...
export type Expression = Expression.Field | Expression.Op | Expression.UserInput

export namespace Expression {
  export type UserInput = {
    kind: 'UserInputExpression'
    index: number
  }

  export type Field = {
    kind: 'FieldExpression'
    table: string | null
    field: string
  }

  export type Op = {
    kind: 'OpExpression'
    lhs: Expression
    op: '='
    rhs: Expression
  }

  export function createUserInput(index: number): UserInput {
    return { kind: 'UserInputExpression', index }
  }

  export function createField(table: string | null, field: string): Field {
    return { kind: 'FieldExpression', table, field }
  }

  export function createOp(lhs: Expression, op: '=', rhs: Expression): Op {
    return { kind: 'OpExpression', lhs, op, rhs }
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
  kind: 'FROM'
  table: string
  joins: Join[]
}

export namespace From {
  export function create(table: string, joins: Join[]): From {
    return { kind: 'FROM', table, joins }
  }
}

export type OrderBy = {
  expression: Expression
  order: 'ASC' | 'DESC' | null
}

export namespace OrderBy {
  export function create(
    expression: Expression,
    order: 'ASC' | 'DESC' | null
  ): OrderBy {
    return { expression, order }
  }
}

export type Select = {
  kind: 'SELECT'
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
    return { kind: 'SELECT', selectList, from, orderBy }
  }
}
