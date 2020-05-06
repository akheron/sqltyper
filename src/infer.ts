import * as R from 'ramda'

import * as Array from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as Option from 'fp-ts/lib/Option'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { flow, identity } from 'fp-ts/lib/function'
import { pipe } from 'fp-ts/lib/pipeable'

import * as ast from './ast'
import {
  concat2,
  sequenceAIM,
  sequenceAW,
  traverseAE,
  traverseAIM,
  traverseATE,
} from './fp-utils'
import { functionNullSafety, operatorNullSafety } from './const-utils'
import { FieldNullability } from './field-nullability'
import { parse } from './parser'
import { SchemaClient, Table, Column } from './schema'
import { StatementDescription, StatementRowCount, ValueType } from './types'
import * as Warn from './Warn'
import * as InferM from './InferM'

export type SourceColumn = {
  tableAlias: string
  columnName: string
  nullability: FieldNullability
  hidden: boolean
}

export type VirtualField = {
  name: string
  nullability: FieldNullability
}

function virtualField(
  name: string,
  nullability: FieldNullability
): VirtualField {
  return { name, nullability }
}

export type VirtualTable = {
  name: string
  columns: VirtualField[]
}

export function inferStatementNullability(
  client: SchemaClient,
  statement: StatementDescription
): Task.Task<Warn.Warn<StatementDescription>> {
  return pipe(
    TaskEither.fromEither(parse(statement.sql)),
    TaskEither.chain(astNode =>
      pipe(
        getParamNullability(client, astNode),
        InferM.fromTaskEither,
        InferM.chain(paramNullability =>
          pipe(
            inferColumnNullability(
              client,
              statement,
              paramNullability,
              astNode
            ),
            InferM.map(stmt => applyParamNullability(stmt, paramNullability))
          )
        ),
        InferM.map(stmt => inferRowCount(stmt, astNode))
      )
    ),
    TaskEither.getOrElse(parseErrorStr =>
      Task.of(
        Warn.warning(
          statement,
          'The internal SQL parser failed to parse the SQL statement.',
          `Parse error: ${parseErrorStr}`
        )
      )
    )
  )
}

export function inferColumnNullability(
  client: SchemaClient,
  statement: StatementDescription,
  paramNullability: ParamNullability[],
  tree: ast.AST
): InferM.InferM<StatementDescription> {
  return pipe(
    getOutputColumns(client, [], paramNullability, tree),
    InferM.chain(outputColumns =>
      InferM.fromEither(applyColumnNullability(statement, outputColumns))
    )
  )
}

function getOutputColumns(
  client: SchemaClient,
  outsideCTEs: VirtualTable[],
  paramNullability: ParamNullability[],
  tree: ast.AST
): InferM.InferM<VirtualField[]> {
  return ast.walk(tree, {
    select: ({ ctes, body, setOps }) =>
      pipe(
        combineVirtualTables(
          outsideCTEs,
          getVirtualTablesForWithQueries(client, paramNullability, ctes)
        ),
        InferM.chain(combinedCTEs =>
          inferSetOpsOutput(
            client,
            combinedCTEs,
            paramNullability,
            body,
            setOps
          )
        )
      ),
    insert: ({ table, as, returning }) =>
      pipe(
        getSourceColumnsForTable(client, outsideCTEs, table, as),
        InferM.chain(sourceColumns =>
          inferSelectListOutput(
            client,
            outsideCTEs,
            sourceColumns,
            paramNullability,
            [],
            returning
          )
        )
      ),
    update: ({ ctes, table, as, from, where, returning }) =>
      pipe(
        combineVirtualTables(
          outsideCTEs,
          getVirtualTablesForWithQueries(client, paramNullability, ctes)
        ),
        InferM.chain(combinedCTEs =>
          combineSourceColumns(
            getSourceColumnsForTableExpr(
              client,
              combinedCTEs,
              paramNullability,
              from
            ),
            getSourceColumnsForTable(client, combinedCTEs, table, as)
          )
        ),
        InferM.chain(sourceColumns =>
          inferSelectListOutput(
            client,
            outsideCTEs,
            sourceColumns,
            paramNullability,
            [where],
            returning
          )
        )
      ),
    delete: ({ table, as, where, returning }) =>
      pipe(
        getSourceColumnsForTable(client, outsideCTEs, table, as),
        InferM.chain(sourceColumns =>
          inferSelectListOutput(
            client,
            outsideCTEs,
            sourceColumns,
            paramNullability,
            [where],
            returning
          )
        )
      ),
  })
}

function applyColumnNullability(
  stmt: StatementDescription,
  outputColumns: VirtualField[]
): Either.Either<string, StatementDescription> {
  if (outputColumns.length != stmt.columns.length) {
    return Either.left(`BUG: Non-equal number of columns: \
inferred ${outputColumns.length}, actual ${stmt.columns.length}`)
  }

  const inferredColumnNames = outputColumns.map(({ name }) => name).join(', ')
  const actualColumnNames = stmt.columns.map(({ name }) => name).join(', ')

  if (inferredColumnNames != actualColumnNames) {
    return Either.left(`BUG: Inferred output column names do not equal \
actual output column names: inferred "${inferredColumnNames}", \
actual: "${actualColumnNames}"`)
  }

  return Either.right({
    ...stmt,
    columns: R.zipWith(
      (column, inferred) => {
        switch (inferred.nullability.kind) {
          case 'Any':
            return {
              ...column,
              nullable: inferred.nullability.nullable,
            }

          case 'Array':
            return {
              ...column,
              type: ValueType.array(
                column.type.oid,
                inferred.nullability.elemNullable
              ),
              nullable: inferred.nullability.nullable,
            }
        }
      },
      stmt.columns,
      outputColumns
    ),
  })
}

function inferSetOpsOutput(
  client: SchemaClient,
  outsideCTEs: VirtualTable[],
  paramNullability: ParamNullability[],
  first: ast.SelectBody,
  setOps: ast.SelectOp[]
): InferM.InferM<VirtualField[]> {
  // fp-ts's foldM is not stack safe so a manual loop is needed
  return async () => {
    let curr = await inferSelectBodyOutput(
      client,
      outsideCTEs,
      paramNullability,
      first
    )()
    if (Either.isLeft(curr)) {
      return curr
    }

    let result = curr.right

    for (const setOp of setOps) {
      const next = await inferSelectBodyOutput(
        client,
        outsideCTEs,
        paramNullability,
        setOp.select
      )()
      if (Either.isLeft(next)) {
        return next
      }
      const columns = next.right

      if (result.payload.length != columns.payload.length) {
        return Either.left(`Inequal number of columns in ${setOp.op}`)
      }

      // EXCEPT has no effect on nullability of the output, because
      // its output is not indluded
      if (setOp.op !== 'EXCEPT') {
        result = pipe(
          Warn.of((aa: VirtualField[]) => (bb: VirtualField[]) =>
            pipe(
              Array.zip(aa, bb),
              Array.map(([a, b]) => ({
                // Column names are determined by the first SELECT
                name: a.name,
                nullability: FieldNullability.disjunction(a.nullability)(
                  b.nullability
                ),
              }))
            )
          ),
          Warn.ap(result),
          Warn.ap(columns)
        )
      }
    }
    return Either.right(result)
  }
}

function inferSelectBodyOutput(
  client: SchemaClient,
  outsideCTEs: VirtualTable[],
  paramNullability: ParamNullability[],
  body: ast.SelectBody
): InferM.InferM<VirtualField[]> {
  return pipe(
    getSourceColumnsForTableExpr(
      client,
      outsideCTEs,
      paramNullability,
      body.from
    ),
    InferM.chain(sourceColumns =>
      inferSelectListOutput(
        client,
        outsideCTEs,
        sourceColumns,
        paramNullability,
        [body.where, body.having],
        body.selectList
      )
    )
  )
}

function inferSelectListOutput(
  client: SchemaClient,
  outsideCTEs: VirtualTable[],
  sourceColumns: SourceColumn[],
  paramNullability: ParamNullability[],
  conditions: Array<ast.Expression | null>,
  selectList: ast.SelectListItem[]
): InferM.InferM<VirtualField[]> {
  return pipe(
    InferM.right(
      pipe(
        conditions.map(cond => getNonNullSubExpressionsFromRowCond(cond)),
        Array.flatten
      )
    ),
    InferM.chain(nonNullExpressions =>
      pipe(
        traverseAIM(selectList, item =>
          inferSelectListItemOutput(
            client,
            outsideCTEs,
            sourceColumns,
            paramNullability,
            nonNullExpressions,
            item
          )
        ),
        InferM.map<VirtualField[][], VirtualField[]>(R.flatten)
      )
    )
  )
}

function inferSelectListItemOutput(
  client: SchemaClient,
  outsideCTEs: VirtualTable[],
  sourceColumns: SourceColumn[],
  paramNullability: ParamNullability[],
  nonNullExpressions: ast.Expression[],
  selectListItem: ast.SelectListItem
): InferM.InferM<VirtualField[]> {
  return ast.SelectListItem.walk<InferM.InferM<VirtualField[]>>(
    selectListItem,
    {
      allFields: () =>
        InferM.fromEither(
          pipe(
            // hidden columns aren't selected by SELECT *
            findNonHiddenSourceColumns(sourceColumns),
            Either.map(columns =>
              applyExpressionNonNullability(nonNullExpressions, columns)
            ),
            Either.map(columns =>
              columns.map(column => ({
                name: column.columnName,
                nullability: column.nullability,
              }))
            )
          )
        ),

      allTableFields: ({ tableName }) =>
        InferM.fromEither(
          pipe(
            findNonHiddenSourceTableColumns(tableName, sourceColumns),
            Either.map(columns =>
              applyExpressionNonNullability(nonNullExpressions, columns)
            ),
            Either.map(columns =>
              columns.map(column => ({
                name: column.columnName,
                nullability: column.nullability,
              }))
            )
          )
        ),

      selectListExpression: ({ expression, as }) =>
        pipe(
          inferExpressionNullability(
            client,
            outsideCTEs,
            sourceColumns,
            paramNullability,
            nonNullExpressions,
            expression
          ),
          InferM.map(exprNullability => [
            virtualField(
              as || inferExpressionName(expression),
              exprNullability
            ),
          ])
        ),
    }
  )
}

type NonNullableColumn = { tableName: string | null; columnName: string }

function isColumnNonNullable(
  nonNullableColumns: NonNullableColumn[],
  sourceColumn: SourceColumn
): boolean {
  return nonNullableColumns.some(nonNull =>
    nonNull.tableName
      ? sourceColumn.tableAlias === nonNull.tableName
      : true && sourceColumn.columnName === nonNull.columnName
  )
}

function applyExpressionNonNullability(
  nonNullableExpressions: ast.Expression[],
  sourceColumns: SourceColumn[]
): SourceColumn[] {
  const nonNullableColumns = pipe(
    nonNullableExpressions,
    R.map(expr =>
      ast.Expression.walkSome<Option.Option<NonNullableColumn>>(
        expr,
        Option.none,
        {
          columnRef: ({ column }) =>
            Option.some({ tableName: null, columnName: column }),
          tableColumnRef: ({ table, column }) =>
            Option.some({ tableName: table, columnName: column }),
        }
      )
    ),
    Array.filterMap(identity)
  )
  return sourceColumns.map(sourceColumn => ({
    ...sourceColumn,
    nullability: isColumnNonNullable(nonNullableColumns, sourceColumn)
      ? FieldNullability.any(false)
      : sourceColumn.nullability,
  }))
}

function inferExpressionName(expression: ast.Expression): string {
  return ast.Expression.walkSome(expression, '?column?', {
    columnRef: ({ column }) => column,
    tableColumnRef: ({ column }) => column,
  })
}

function inferExpressionNullability(
  client: SchemaClient,
  outsideCTEs: VirtualTable[],
  sourceColumns: SourceColumn[],
  paramNullability: ParamNullability[],
  nonNullExprs: ast.Expression[],
  expression: ast.Expression
): InferM.InferM<FieldNullability> {
  const anyTE = flow(FieldNullability.any, Warn.of, TaskEither.right)

  const arrayTE = flow(FieldNullability.array, Warn.of, TaskEither.right)

  if (
    nonNullExprs.some(nonNull => ast.Expression.equals(expression, nonNull))
  ) {
    // This expression is guaranteed to be not NULL by a
    // `WHERE EXPR IS NOT NULL` clause
    return anyTE(false)
  }
  return ast.Expression.walk(expression, {
    // A column reference may evaluate to NULL if the column doesn't
    // have a NOT NULL constraint
    tableColumnRef: ({ table, column }) =>
      pipe(
        InferM.fromEither(findSourceTableColumn(table, column, sourceColumns)),
        InferM.map(column => column.nullability)
      ),

    // A column reference may evaluate to NULL if the column doesn't
    // have a NOT NULL constraint
    columnRef: ({ column }) =>
      pipe(
        InferM.fromEither(findSourceColumn(column, sourceColumns)),
        InferM.map(column => column.nullability)
      ),

    // A unary operator has two options:
    //
    // - The operator is known to be NULL safe: it returns NULL only
    //   if its operand is NULL
    //
    // - The operator is not NULL safe: it can return NULL even if its
    // - operand is not NULL
    unaryOp: ({ op, operand }) => {
      switch (operatorNullSafety(op)) {
        case 'safe':
          return inferExpressionNullability(
            client,
            outsideCTEs,
            sourceColumns,
            paramNullability,
            nonNullExprs,
            operand
          )
        case 'unsafe':
          return anyTE(true)
        case 'neverNull':
          return anyTE(false)
        case null:
          return TaskEither.right(
            Warn.warning(FieldNullability.any(true), `Unknown operator '${op}'`)
          )
      }
    },

    // A binary operator has two options:
    //
    // - The operator is known to be NULL safe: it returns NULL only
    //   if any of its operands is NULL
    //
    // - The function is not NULL safe: it can return NULL even if all
    //   of its operands are non-NULL
    binaryOp: ({ lhs, op, rhs }) => {
      // AND and OR are unsafe from the result side (e.g. FALSE AND
      // NULL => NULL), but if both args are non-null, then the
      // result is also guaranteed to be non-null.
      const nullSafety =
        op == 'AND' || op == 'OR' ? 'safe' : operatorNullSafety(op)
      switch (nullSafety) {
        case 'safe':
          return pipe(
            InferM.right(FieldNullability.disjunction),
            InferM.ap(
              pipe(
                inferExpressionNullability(
                  client,
                  outsideCTEs,
                  sourceColumns,
                  paramNullability,
                  nonNullExprs,
                  lhs
                )
              )
            ),
            InferM.ap(
              pipe(
                inferExpressionNullability(
                  client,
                  outsideCTEs,
                  sourceColumns,
                  paramNullability,
                  nonNullExprs,
                  rhs
                )
              )
            )
          )
        case 'unsafe':
          return anyTE(true)
        case 'neverNull':
          return anyTE(false)
        case null:
          return TaskEither.right(
            Warn.warning(FieldNullability.any(true), `Unknown operator '${op}'`)
          )
      }
    },

    ternaryOp: ({ lhs, op, rhs1, rhs2 }) => {
      switch (operatorNullSafety(op)) {
        case 'safe':
          return pipe(
            InferM.right(
              (a: FieldNullability) => (b: FieldNullability) => (
                c: FieldNullability
              ) =>
                FieldNullability.disjunction(
                  FieldNullability.disjunction(a)(b)
                )(c)
            ),
            InferM.ap(
              inferExpressionNullability(
                client,
                outsideCTEs,
                sourceColumns,
                paramNullability,
                nonNullExprs,
                lhs
              )
            ),
            InferM.ap(
              inferExpressionNullability(
                client,
                outsideCTEs,
                sourceColumns,
                paramNullability,
                nonNullExprs,
                rhs1
              )
            ),
            InferM.ap(
              inferExpressionNullability(
                client,
                outsideCTEs,
                sourceColumns,
                paramNullability,
                nonNullExprs,
                rhs2
              )
            )
          )
        case 'unsafe':
          return anyTE(true)
        case 'neverNull':
          return anyTE(false)
        case null:
          return TaskEither.right(
            Warn.warning(FieldNullability.any(true), `Unknown operator '${op}'`)
          )
      }
    },

    // EXISTS (subquery) never returns NULL
    existsOp: () => anyTE(false),

    // A function call has two options:
    //
    // - The function is known to be NULL safe: it returns NULL only
    //   if any of its arguments is NULL
    //
    // - The function is not NULL safe: it can return NULL even if all
    //   of its arguments are non-NULL
    //
    functionCall: ({ funcName, argList }) => {
      switch (functionNullSafety(funcName)) {
        case 'safe':
          return pipe(
            traverseATE(argList, arg =>
              inferExpressionNullability(
                client,
                outsideCTEs,
                sourceColumns,
                paramNullability,
                nonNullExprs,
                arg
              )
            ),
            TaskEither.map(argNullability =>
              pipe(
                sequenceAW(argNullability),
                Warn.map(an =>
                  FieldNullability.any(
                    an.some(nullability => nullability.nullable)
                  )
                )
              )
            )
          )
        case 'unsafe':
          return anyTE(true)
        case 'neverNull':
          return anyTE(false)
        case null:
          return TaskEither.right(
            Warn.warning(
              FieldNullability.any(true),
              `Unknown function '${funcName}'`
            )
          )
      }
    },

    // expr IN (subquery) returns NULL if expr is NULL
    inOp: ({ lhs }) =>
      inferExpressionNullability(
        client,
        outsideCTEs,
        sourceColumns,
        paramNullability,
        nonNullExprs,
        lhs
      ),

    // ARRAY(subquery) is never null as a whole. The nullability of
    // the inside depends on the inside select list expression
    arraySubQuery: ({ subquery }) =>
      pipe(
        getOutputColumns(client, outsideCTEs, paramNullability, subquery),
        InferM.chain(columns => {
          if (columns.length != 1)
            return TaskEither.left('subquery must return only one column')
          return arrayTE(
            // An array constructed from a subquery is never NULL itself
            false,
            // Element nullability depends on the subquery column nullability
            columns[0].nullability.nullable
          )
        })
      ),

    case: ({ branches, else_ }) => {
      if (else_ === null) {
        // No ELSE branch => Rows that match none of the branches
        // will be NULL
        return anyTE(true)
      }
      return pipe(
        InferM.right(
          (branchNullabilities: FieldNullability[]) => (
            elseNullability: FieldNullability
          ) =>
            branchNullabilities.reduce(
              (a, b) => FieldNullability.disjunction(a)(b),
              elseNullability
            )
        ),
        InferM.ap(
          pipe(
            branches.map(({ condition, result }) => {
              const nonNullExprsByCond = getNonNullSubExpressionsFromRowCond(
                condition
              )
              return inferExpressionNullability(
                client,
                outsideCTEs,
                sourceColumns,
                paramNullability,
                [...nonNullExprsByCond, ...nonNullExprs],
                result
              )
            }),
            sequenceAIM
          )
        ),
        InferM.ap(
          inferExpressionNullability(
            client,
            outsideCTEs,
            sourceColumns,
            paramNullability,
            nonNullExprs,
            else_
          )
        )
      )
    },

    // A type cast evaluates to NULL if the expression to be casted is
    // NULL.
    typeCast: ({ lhs }) =>
      inferExpressionNullability(
        client,
        outsideCTEs,
        sourceColumns,
        paramNullability,
        nonNullExprs,
        lhs
      ),

    // NULL is the only nullable constant
    constant: ({ valueText }) => anyTE(valueText === 'NULL'),

    // By default, a parameter is non-nullable, but param
    // nullability infering may have overridden the default.
    parameter: ({ index }) => {
      const nullability = paramNullability.find(val => val.index === index)
      if (nullability !== undefined) return anyTE(nullability.nullable)
      return anyTE(false)
    },
  })
}

function getNonNullSubExpressionsFromRowCond(
  expression: ast.Expression | null,
  logicalNegation: boolean = false
): ast.Expression[] {
  if (expression == null) {
    return []
  }
  return ast.Expression.walkSome<ast.Expression[]>(expression, [], {
    columnRef: () => {
      return [expression]
    },
    tableColumnRef: () => {
      return [expression]
    },
    unaryOp: ({ op, operand }) => {
      if (op === 'IS NOT NULL' || op === 'NOTNULL') {
        // IS NOT NULL / NOTNULL promise that the operand is not null
        return getNonNullSubExpressionsFromRowCond(operand, logicalNegation)
      }
      if (op === 'NOT') {
        // Track logical negation across NOTs
        return getNonNullSubExpressionsFromRowCond(operand, !logicalNegation)
      }
      if (operatorNullSafety(op) === 'safe') {
        // For safe operators, the operator must non-nullable for the
        // result to evaluate to non-null
        return getNonNullSubExpressionsFromRowCond(operand, logicalNegation)
      }

      // Otherwise, the whole expression is non-null because it must
      // evaluate to true, but cannot say anything about the operands
      return [expression]
    },
    binaryOp: ({ lhs, op, rhs }) => {
      if (op === 'AND') {
        if (logicalNegation) {
          // `FALSE AND NULL` evaluates to NULL => NOT (FALSE AND
          // NULL) evaluates to true, so we cannot say anything about
          // the right hand side!
          return [...getNonNullSubExpressionsFromRowCond(lhs, logicalNegation)]
        } else {
          // `a AND b` evaluates to TRUE
          return [
            ...getNonNullSubExpressionsFromRowCond(lhs, logicalNegation),
            ...getNonNullSubExpressionsFromRowCond(rhs, logicalNegation),
          ]
        }
      }
      if (op === 'AND' || operatorNullSafety(op) === 'safe') {
        // For safe operators, both sides must be non-nullable for the
        // result to be non-nullable.
        return [
          ...getNonNullSubExpressionsFromRowCond(lhs, logicalNegation),
          ...getNonNullSubExpressionsFromRowCond(rhs, logicalNegation),
        ]
      }

      // Otherwise, the whole expression is non-null because it must
      // evaluate to true, but cannot say anything about the operands
      return [expression]
    },
    ternaryOp: ({ lhs, op, rhs1, rhs2 }) => {
      if (operatorNullSafety(op) === 'safe') {
        // For safe operators, all operands must be non-nullable for the
        // result to be non-nullable.
        return [
          ...getNonNullSubExpressionsFromRowCond(lhs, logicalNegation),
          ...getNonNullSubExpressionsFromRowCond(rhs1, logicalNegation),
          ...getNonNullSubExpressionsFromRowCond(rhs2, logicalNegation),
        ]
      }

      // Otherwise, the whole expression is non-null because it must
      // evaluate to true, but cannot say anything about the operands
      return [expression]
    },
    functionCall: ({ funcName, argList }) => {
      if (functionNullSafety(funcName) === 'safe') {
        return pipe(
          argList,
          Array.map(arg =>
            getNonNullSubExpressionsFromRowCond(arg, logicalNegation)
          ),
          Array.flatten
        )
      }
      return [expression]
    },
  })
}

// index 0 means param $1, index 1 means param $2, etc.
type ParamNullability = { index: number; nullable: boolean }

function getParamNullability(
  client: SchemaClient,
  tree: ast.AST
): TaskEither.TaskEither<string, ParamNullability[]> {
  return ast.walk(tree, {
    select: () => TaskEither.right([]),
    insert: ({ table, columns, values, onConflict }) => {
      const valuesParamNullability = pipe(
        TaskEither.right(combineParamNullability),
        TaskEither.ap(
          TaskEither.right(findParamsFromValues(values, columns.length))
        ),
        TaskEither.ap(findInsertColumns(client, table, columns))
      )
      const onConflictParamNullability = findParamNullabilityFromUpdates(
        client,
        table,
        onConflict
      )
      return pipe(
        TaskEither.right(concat2<ParamNullability>()),
        TaskEither.ap(valuesParamNullability),
        TaskEither.ap(onConflictParamNullability)
      )
    },
    update: ({ table, updates }) =>
      findParamNullabilityFromUpdates(client, table, updates),
    delete: () => TaskEither.right([]),
  })
}

function findParamsFromValues(
  values: ast.Values,
  numInsertColumns: number
): Array<Array<Option.Option<number>>> {
  return ast.Values.walk(values, {
    defaultValues: () => [R.repeat(Option.none, numInsertColumns)],
    exprValues: ({ valuesList }) =>
      valuesList.map(values => values.map(paramIndexFromExpr)),
  })
}

function findParamNullabilityFromUpdates(
  client: SchemaClient,
  table: ast.TableRef,
  updates: ast.UpdateAssignment[]
): TaskEither.TaskEither<string, ParamNullability[]> {
  return pipe(
    client.getTable(table.schema, table.table),
    TaskEither.chain(dbTable =>
      TaskEither.fromEither(
        traverseAE(updates, update => updateToParamNullability(dbTable, update))
      )
    ),
    TaskEither.map(paramNullabilities =>
      pipe(paramNullabilities, Array.filterMap(identity))
    )
  )
}

function paramIndexFromExpr(
  expression: ast.Expression | null
): Option.Option<number> {
  return pipe(
    Option.fromNullable(expression),
    Option.chain(nonNullExpr =>
      ast.Expression.walkSome(nonNullExpr, Option.none, {
        parameter: paramExpr => Option.some(paramExpr.index - 1),
      })
    )
  )
}

function updateToParamNullability(
  dbTable: Table,
  update: ast.UpdateAssignment
): Either.Either<string, Option.Option<ParamNullability>> {
  return pipe(
    Either.right(makeParamNullability),
    Either.ap(Either.right(paramIndexFromExpr(update.value))),
    Either.ap(findTableColumn(update.columnName, dbTable))
  )
}

const makeParamNullability = (index: Option.Option<number>) => (
  column: Column
): Option.Option<ParamNullability> =>
  pipe(
    index,
    Option.map(index => ({ index, nullable: column.nullable }))
  )

function findInsertColumns(
  client: SchemaClient,
  table: ast.TableRef,
  columnNames: string[]
): TaskEither.TaskEither<string, Column[]> {
  return pipe(
    client.getTable(table.schema, table.table),
    TaskEither.chain(dbTable =>
      TaskEither.fromEither(
        traverseAE(columnNames, columnName =>
          findTableColumn(columnName, dbTable)
        )
      )
    )
  )
}

const combineParamNullability = (
  valuesListParams: Array<Array<Option.Option<number>>>
) => (targetColumns: Column[]): ParamNullability[] => {
  return pipe(
    valuesListParams.map(valuesParams =>
      R.zip(targetColumns, valuesParams).map(([column, param]) =>
        pipe(
          param,
          Option.map(index => ({ index, nullable: column.nullable }))
        )
      )
    ),
    R.flatten,
    Array.filterMap(identity)
  )
}

function applyParamNullability(
  stmt: StatementDescription,
  paramNullability: ParamNullability[]
): StatementDescription {
  // paramNullability may contain multiple records for each param. If
  // any of the records states that the param is nullable, then it is
  // nullable.
  const nullability = R.range(0, stmt.params.length).map(index =>
    paramNullability
      .filter(record => record.index === index)
      .some(record => record.nullable)
  )
  return {
    ...stmt,
    params: R.zipWith(
      (param, nullable) => ({ ...param, nullable }),
      stmt.params,
      nullability
    ),
  }
}

function inferRowCount(
  statement: StatementDescription,
  astNode: ast.AST
): StatementDescription {
  const rowCount: StatementRowCount = ast.walk(astNode, {
    select: ({ body, setOps, limit }) => {
      if (setOps.length === 0 && body.from === null) {
        // No UNION/INTERSECT/EXCEPT, no FROM clause => one row
        return 'one'
      }
      if (limit && limit.count && isConstantExprOf('1', limit.count)) {
        // LIMIT 1 => zero or one row
        return 'zeroOrOne'
      }
      return 'many'
    },

    insert: ({ values, returning }) =>
      ast.Values.walk(values, {
        // INSERT INTO xxx DEFAULT VALUES always creates a single row
        defaultValues: () => 'one',
        exprValues: exprValues =>
          returning.length
            ? // Check the length of the VALUES expression list
              exprValues.valuesList.length === 1
              ? 'one'
              : 'many'
            : // No RETURNING, no output
              'zero',
      }),

    update: ({ returning }) =>
      returning.length
        ? 'many'
        : // No RETURNING, no output
          'zero',

    delete: ({ returning }) =>
      returning.length
        ? 'many'
        : // No RETURNING, no output
          'zero',
  })

  return { ...statement, rowCount }
}

function getVirtualTablesForWithQueries(
  client: SchemaClient,
  paramNullability: ParamNullability[],
  withQueries: ast.WithQuery[]
): InferM.InferM<VirtualTable[]> {
  return async () => {
    const virtualTables: VirtualTable[] = []
    let warnings: Warn.Warning[] = []

    for (const withQuery of withQueries) {
      // "Virtual tables" from previous WITH queries are available
      const virtualTable = pipe(
        await getOutputColumns(
          client,
          virtualTables,
          paramNullability,
          withQuery.query
        )(),
        Either.map(columnsWithWarnings =>
          pipe(
            columnsWithWarnings,
            Warn.map(columns => ({ name: withQuery.as, columns }))
          )
        )
      )
      if (Either.isLeft(virtualTable)) {
        return virtualTable
      }
      virtualTables.push(virtualTable.right.payload)
      warnings = warnings.concat(virtualTable.right.warnings)
    }

    return Either.right(Warn.make(virtualTables, warnings))
  }
}

function combineVirtualTables(
  outsideCTEs: VirtualTable[],
  ctes: InferM.InferM<VirtualTable[]>
): InferM.InferM<VirtualTable[]> {
  return pipe(
    ctes,
    InferM.map(virtualTables => [...outsideCTEs, ...virtualTables])
  )
}

function getSourceColumnsForTable(
  client: SchemaClient,
  ctes: VirtualTable[],
  table: ast.TableRef,
  as: string | null
): InferM.InferM<SourceColumn[]> {
  if (table.schema == null) {
    // Try to find a matching CTE
    const result = ctes.find(virtualTable => virtualTable.name === table.table)
    if (result)
      return InferM.right(
        result.columns.map(col => ({
          tableAlias: as || table.table,
          columnName: col.name,
          nullability: col.nullability,
          hidden: false,
        }))
      )
  }

  // No matching CTE, try to find a database table
  return pipe(
    client.getTable(table.schema, table.table),
    TaskEither.map(table =>
      table.columns.map(col => ({
        tableAlias: as || table.name,
        columnName: col.name,
        nullability: FieldNullability.any(col.nullable),
        hidden: col.hidden,
      }))
    ),
    InferM.fromTaskEither
  )
}

function getSourceColumnsForTableExpr(
  client: SchemaClient,
  ctes: VirtualTable[],
  paramNullability: ParamNullability[],
  tableExpr: ast.TableExpression | null,
  setNullable: boolean = false
): InferM.InferM<SourceColumn[]> {
  if (!tableExpr) {
    return InferM.right([])
  }

  return pipe(
    ast.TableExpression.walk(tableExpr, {
      table: ({ table, as }) =>
        getSourceColumnsForTable(client, ctes, table, as),
      subQuery: ({ query, as }) =>
        getSourceColumnsForSubQuery(client, ctes, paramNullability, query, as),
      crossJoin: ({ left, right }) =>
        combineSourceColumns(
          getSourceColumnsForTableExpr(
            client,
            ctes,
            paramNullability,
            left,
            false
          ),
          getSourceColumnsForTableExpr(
            client,
            ctes,
            paramNullability,
            right,
            false
          )
        ),
      qualifiedJoin: ({ left, joinType, right }) =>
        combineSourceColumns(
          getSourceColumnsForTableExpr(
            client,
            ctes,
            paramNullability,
            left,
            // RIGHT or FULL JOIN -> The left side columns becomes nullable
            joinType === 'RIGHT' || joinType === 'FULL'
          ),
          getSourceColumnsForTableExpr(
            client,
            ctes,
            paramNullability,
            right,
            // LEFT or FULL JOIN -> The right side columns becomes nullable
            joinType === 'LEFT' || joinType === 'FULL'
          )
        ),
    }),
    InferM.map(sourceColumns =>
      setNullable ? setSourceColumnsAsNullable(sourceColumns) : sourceColumns
    )
  )
}

function getSourceColumnsForSubQuery(
  client: SchemaClient,
  outsideCTEs: VirtualTable[],
  paramNullability: ParamNullability[],
  subquery: ast.AST,
  as: string
): InferM.InferM<SourceColumn[]> {
  return pipe(
    getOutputColumns(client, outsideCTEs, paramNullability, subquery),
    InferM.map(columns =>
      columns.map(column => ({
        tableAlias: as,
        columnName: column.name,
        nullability: column.nullability,
        hidden: false,
      }))
    )
  )
}

function setSourceColumnsAsNullable(
  sourceColumns: SourceColumn[]
): SourceColumn[] {
  return sourceColumns.map(col => ({
    ...col,
    nullability: { ...col.nullability, nullable: true },
  }))
}

function combineSourceColumns(
  ...sourceColumns: Array<InferM.InferM<SourceColumn[]>>
): InferM.InferM<SourceColumn[]> {
  return pipe(
    sourceColumns,
    sequenceAIM,
    InferM.map<SourceColumn[][], SourceColumn[]>(R.flatten)
  )
}

function isConstantExprOf(expectedValue: string, expr: ast.Expression) {
  return ast.Expression.walkSome(expr, false, {
    constant: ({ valueText }) => valueText === expectedValue,
  })
}

function findNonHiddenSourceColumns(
  sourceColumns: SourceColumn[]
): Either.Either<string, SourceColumn[]> {
  return pipe(
    sourceColumns.filter(col => !col.hidden),
    Either.fromPredicate(
      result => result.length > 0,
      () => `No columns`
    )
  )
}

function findNonHiddenSourceTableColumns(
  tableName: string,
  sourceColumns: SourceColumn[]
): Either.Either<string, SourceColumn[]> {
  return pipe(
    findNonHiddenSourceColumns(sourceColumns),
    Either.map(sourceColumns =>
      sourceColumns.filter(col => col.tableAlias === tableName)
    ),
    Either.chain(result =>
      result.length > 0
        ? Either.right(result)
        : Either.left(`No visible columns for table ${tableName}`)
    )
  )
}

function findSourceTableColumn(
  tableName: string,
  columnName: string,
  sourceColumns: SourceColumn[]
): Either.Either<string, SourceColumn> {
  return pipe(
    sourceColumns.find(
      source =>
        source.tableAlias === tableName && source.columnName === columnName
    ),
    Either.fromNullable(`Unknown column ${tableName}.${columnName}`)
  )
}

function findSourceColumn(
  columnName: string,
  sourceColumns: SourceColumn[]
): Either.Either<string, SourceColumn> {
  return pipe(
    sourceColumns.find(col => col.columnName === columnName),
    Either.fromNullable(`Unknown column ${columnName}`)
  )
}

function findTableColumn(columnName: string, table: Table) {
  return pipe(
    table.columns.find(column => column.name === columnName),
    Either.fromNullable(`Unknown column ${columnName}`)
  )
}
