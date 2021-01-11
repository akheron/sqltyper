import * as R from 'ramda'
import { Either, left, right } from 'fp-ts/lib/Either'

export function preprocessSQL(
  sql: string
): Either<string, { sql: string; paramNames: string[] }> {
  const namedParamMatch = sql.match(/\$\{\w+\}|(?<!:):\w+/g)
  const numberedParamMatch = sql.match(/\$\d+/g)
  if (namedParamMatch != null && numberedParamMatch != null) {
    const firstNamedParam = namedParamMatch[0]
    const firstNumberedParam = numberedParamMatch[0]
    return left(
      `Cannot mix named parameters (${firstNamedParam}) and numbered \
parameters (${firstNumberedParam}) in the same statement`
    )
  } else if (namedParamMatch == null && numberedParamMatch == null) {
    return right({ sql, paramNames: [] })
  } else if (namedParamMatch != null) {
    // Only named params
    return right(handleNamedParams(sql, namedParamMatch))
  } else if (numberedParamMatch != null) {
    // Only numbered params
    return right(handleNumberedParams(sql, numberedParamMatch))
  } else {
    throw new Error('not reached')
  }
}

function handleNamedParams(
  sql: string,
  params: string[]
): { sql: string; paramNames: string[] } {
  const paramIndices: Map<string, number> = new Map()
  let current = 1

  params.forEach((param) => {
    //                              ${paramName}         :paramName
    const name = param[0] === '$' ? param.slice(2, -1) : param.slice(1)
    if (!paramIndices.has(name)) {
      paramIndices.set(name, current)
      current++
    }
  })

  let mangledSQL = sql
  for (const [name, index] of paramIndices) {
    mangledSQL = mangledSQL
      .replace(new RegExp('\\$\\{' + name + '\\}', 'g'), '$' + index)
      .replace(new RegExp('(?<!:):' + name, 'g'), '$' + index)
  }

  // Iterating a Map is guaranteed to yield in the insertion order
  return { sql: mangledSQL, paramNames: [...paramIndices.keys()] }
}

function handleNumberedParams(
  sql: string,
  numberedParams: string[]
): { sql: string; paramNames: string[] } {
  return {
    sql,
    paramNames: R.sort((a, b) => a.localeCompare(b), numberedParams),
  }
}
