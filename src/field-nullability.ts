export type FieldNullability = FieldNullability.Any | FieldNullability.Array

export namespace FieldNullability {
  export type Any = { kind: 'Any'; nullable: boolean }
  export type Array = {
    kind: 'Array'
    nullable: boolean
    elemNullable: boolean
  }

  export function any(nullable: boolean): FieldNullability {
    return { kind: 'Any', nullable }
  }

  export function array(
    nullable: boolean,
    elemNullable: boolean
  ): FieldNullability {
    return { kind: 'Array', nullable, elemNullable }
  }

  export function walk<T>(
    nullability: FieldNullability,
    handlers: {
      any: (value: Any) => T
      array: (value: Array) => T
    }
  ): T {
    switch (nullability.kind) {
      case 'Any':
        return handlers.any(nullability)
      case 'Array':
        return handlers.array(nullability)
    }
  }

  export const disjunction = (a: FieldNullability) => (
    b: FieldNullability
  ): FieldNullability =>
    walk(a, {
      any: (aAny) =>
        walk(b, {
          any: (bAny) => any(aAny.nullable || bAny.nullable),
          array: (bArray) => any(aAny.nullable || bArray.nullable),
        }),
      array: (aArray) =>
        walk(b, {
          any: (bAny) => any(aArray.nullable || bAny.nullable),
          array: (bArray) =>
            array(
              aArray.nullable || bArray.nullable,
              aArray.elemNullable || bArray.elemNullable
            ),
        }),
    })
}
