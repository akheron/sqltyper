import { array } from 'fp-ts/lib/Array'
import { either, flatten, map } from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/pipeable'
import * as ast from '../ast'
import { fail, Failable, ok } from './error'
import { findColumns, SourceTable } from './source'

export type TsType = 'number' | 'string' | 'boolean'
export type OutputColumn = { name: string; tsType: TsType }

export function inferSelectList(
  selectList: ast.SelectListItem[],
  sourceTables: SourceTable[]
): OutputColumn[] {
  const c = getOutputColumns(selectList, sourceTables)

  const t = array.traverse(either)
  const r = selectList.map((item, index) =>
    pipe(
      inferExpressionTypes(item.expression, sourceTables),
      map(tsTypes => ({
        name: outputColumnName(item, index),
        tsType: tsTypes,
      }))
    )
  )
}

function getOutputColumns(
  selectList: ast.SelectListItem[]
): { name: string; expression: ast.Expression }[] {}

function outputColumnName(
  { expression, as }: ast.SelectListItem,
  index: number
): string {
  if (as) return as
  if (ast.Expression.isAnyColumnRef(expression) && expression.column !== '*')
    return expression.column
  return `_${index}`
}

function inferExpressionTypes(
  expression: ast.Expression,
  sourceTables: SourceTable[]
): Failable<TsType[]> {
  if (ast.Expression.isConstant(expression)) {
    // TODO: We only support number literals now
    return ok(['number'])
  } else if (ast.Expression.isPositional(expression)) {
    return fail('Positional parameter not allowed here')
  } else if (ast.Expression.isSchemaTableColumnRef(expression)) {
    return fail('TODO: schema tables')
  } else if (ast.Expression.isAnyColumnRef(expression)) {
    return pipe(
      findColumns(expression),
      map(x => x.map(pgTypeToTsType)),
      map(array.sequence(either)),
      flatten
    )
  } else {
    return fail('TODO: operators')
  }
}

function pgTypeToTsType(pgType: string): Failable<TsType> {
  switch (pgType) {
    case 'int4':
      return ok('number')
    case 'varchar':
      return ok('string')
    default:
      return fail(`Unknown PostgreSQL type ${pgType}`)
  }
}
