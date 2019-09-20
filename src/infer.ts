import * as R from 'ramda'

import * as Array from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as Option from 'fp-ts/lib/Option'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'

import * as ast from './ast'
import { sequenceAE, sequenceATE } from './fp-utils'
import { functionNullSafety, operatorNullSafety } from './const-utils'
import { parse } from './parser'
import {
  SchemaClient,
  Table,
  Column,
  setTableColumnsAsNullable,
} from './schema'
import { StatementDescription, StatementRowCount } from './types'

export type SourceTable = {
  table: Table
  as: string
}

export function inferStatementNullability(
  client: SchemaClient,
  statement: StatementDescription
): TaskEither.TaskEither<string, StatementDescription> {
  return pipe(
    TaskEither.fromEither(parse(statement.sql)),
    TaskEither.chain(astNode =>
      pipe(
        inferColumnNullability(client, statement, astNode),
        TaskEither.chain(stmt => inferParamNullability(client, stmt, astNode)),
        TaskEither.map(stmt => inferRowCount(stmt, astNode))
      )
    ),
    TaskEither.orElse(parseErrorStr => {
      console.warn(
        `WARNING: The internal SQL parser failed to parse the SQL \
statement. The inferred types may be inaccurate with respect to nullability.`
      )
      // tslint-disable-next-line no-console
      console.warn(`Parse error: ${parseErrorStr}`)
      return TaskEither.right(statement)
    })
  )
}

export function inferColumnNullability(
  client: SchemaClient,
  statement: StatementDescription,
  tree: ast.AST
): TaskEither.TaskEither<string, StatementDescription> {
  return pipe(
    getColumnNullability(client, tree),
    TaskEither.chain(columnNullability =>
      TaskEither.fromEither(
        applyColumnNullability(statement, columnNullability)
      )
    )
  )
}

type ColumnNullability = boolean

function getColumnNullability(
  client: SchemaClient,
  tree: ast.AST
): TaskEither.TaskEither<string, ColumnNullability[]> {
  return ast.walk(tree, {
    select: ({ body }) =>
      pipe(
        getSourceTablesForTableExpr(client, body.from),
        TaskEither.chain(sourceTables =>
          TaskEither.fromEither(
            inferSelectListNullability(
              sourceTables,
              body.where,
              body.selectList
            )
          )
        )
      ),
    insert: ({ table, as, returning }) =>
      pipe(
        getSourceTable(client, table, as),
        TaskEither.chain(sourceTables =>
          TaskEither.fromEither(
            inferSelectListNullability(sourceTables, null, returning)
          )
        )
      ),
    update: ({ table, as, from, where, returning }) =>
      pipe(
        combineSourceTables(
          getSourceTablesForTableExpr(client, from),
          getSourceTable(client, table, as)
        ),
        TaskEither.chain(sourceTables =>
          TaskEither.fromEither(
            inferSelectListNullability(sourceTables, where, returning)
          )
        )
      ),
    delete: ({ table, as, where, returning }) =>
      pipe(
        getSourceTable(client, table, as),
        TaskEither.chain(sourceTables =>
          Task.of(inferSelectListNullability(sourceTables, where, returning))
        )
      ),
  })
}

function applyColumnNullability(
  stmt: StatementDescription,
  columnNullability: ColumnNullability[]
): Either.Either<string, StatementDescription> {
  if (columnNullability.length != stmt.columns.length) {
    return Either.left(`BUG: Non-equal number of columns: \
inferred ${columnNullability.length}, actual ${stmt.columns.length}`)
  }
  return Either.right({
    ...stmt,
    columns: R.zipWith(
      (column, nullable) => ({ ...column, nullable }),
      stmt.columns,
      columnNullability
    ),
  })
}

function inferSelectListNullability(
  sourceTables: SourceTable[],
  where: ast.Expression | null,
  selectList: ast.SelectListItem[]
): Either.Either<string, ColumnNullability[]> {
  return pipe(
    Either.right(getNonNullExpressionsFromWhere(where)),
    Either.chain(nonNullExpressions =>
      pipe(
        selectList.map(item =>
          inferSelectListItemNullability(sourceTables, nonNullExpressions, item)
        ),
        sequenceAE,
        Either.map(R.flatten)
      )
    )
  )
}

function inferSelectListItemNullability(
  sourceTables: SourceTable[],
  nonNullExpressions: ast.Expression[],
  selectListItem: ast.SelectListItem
): Either.Either<string, ColumnNullability[]> {
  return ast.SelectListItem.walk(selectListItem, {
    allFields: () =>
      Either.right(
        pipe(
          sourceTables.map(sourceTable => sourceTable.table.columns),
          R.flatten,
          R.map(column => column.nullable)
        )
      ),

    allTableFields: ({ tableName }) =>
      pipe(
        findSourceTable(sourceTables, tableName),
        Either.map(sourceTable => sourceTable.table.columns),
        Either.map(columns => columns.map(column => column.nullable))
      ),

    selectListExpression: ({ expression }) =>
      pipe(
        inferExpressionNullability(
          sourceTables,
          nonNullExpressions,
          expression
        ),
        Either.map(x => [x])
      ),
  })
}

function inferExpressionNullability(
  sourceTables: SourceTable[],
  nonNullExprs: ast.Expression[],
  expression: ast.Expression
): Either.Either<string, boolean> {
  if (
    nonNullExprs.some(nonNull => ast.Expression.equals(expression, nonNull))
  ) {
    // This expression is guaranteed to be not NULL by a
    // `WHERE expr IS NOT NULL` clause
    return Either.right(false)
  }
  return ast.Expression.walk<Either.Either<string, boolean>>(expression, {
    // A column reference may evaluate to NULL if the column doesn't
    // have a NOT NULL constraint
    tableColumnRef: ({ table, column }) =>
      pipe(
        findSourceTableColumn(sourceTables, table, column),
        Either.map(column => column.nullable)
      ),

    // A column reference may evaluate to NULL if the column doesn't
    // have a NOT NULL constraint
    columnRef: ({ column }) =>
      pipe(
        findSourceColumn(sourceTables, column),
        Either.map(column => column.nullable)
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
          return inferExpressionNullability(sourceTables, nonNullExprs, operand)
        case 'unsafe':
        case 'alwaysNull':
          return Either.right(true)
        case 'neverNull':
          return Either.right(false)
      }
    },

    // A binary operator has two options:
    //
    // - The operator is known to be NULL safe: it returns NULL only
    //   if any of its operands is NULL
    //
    // - The function is not NULL safe: it can return NULL even if all
    //   of its operands are non-NULL
    binaryOp: ({ op, lhs, rhs }) => {
      switch (operatorNullSafety(op)) {
        case 'safe':
          return (
            inferExpressionNullability(sourceTables, nonNullExprs, lhs) ||
            inferExpressionNullability(sourceTables, nonNullExprs, rhs)
          )
        case 'unsafe':
        case 'alwaysNull':
          return Either.right(true)
        case 'neverNull':
          return Either.right(false)
      }
    },

    // EXISTS (subquery) never returns NULL
    existsOp: () => Either.right(false),

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
            argList.map(arg =>
              inferExpressionNullability(sourceTables, nonNullExprs, arg)
            ),
            sequenceAE,
            Either.map(R.any(R.identity))
          )
        case 'unsafe':
        case 'alwaysNull':
          return Either.right(true)
        case 'neverNull':
          return Either.right(false)
      }
    },

    // expr IN (subquery) returns NULL if expr is NULL
    inOp: ({ lhs }) =>
      inferExpressionNullability(sourceTables, nonNullExprs, lhs),

    // A constant is never NULL
    constant: () => Either.right(false),

    // A parameter can be NULL
    parameter: () => Either.right(true),
  })
}

function getNonNullExpressionsFromWhere(
  where: ast.Expression | null
): ast.Expression[] {
  if (where == null) {
    return []
  }
  return ast.Expression.walkSome<ast.Expression[]>(where, [], {
    binaryOp: ({ lhs, op, rhs }) => {
      if (op === 'AND') {
        return [
          ...getNonNullExpressionsFromWhere(lhs),
          ...getNonNullExpressionsFromWhere(rhs),
        ]
      }
      return []
    },
    unaryOp: ({ op, operand }) => {
      if (op === 'IS NOT NULL' || op === 'NOTNULL') {
        return [operand]
      }
      return []
    },
  })
}

function inferParamNullability(
  client: SchemaClient,
  statement: StatementDescription,
  tree: ast.AST
): TaskEither.TaskEither<string, StatementDescription> {
  return pipe(
    getParamNullability(client, tree),
    TaskEither.chain(paramNullability =>
      paramNullability
        ? TaskEither.fromEither(
            applyParamNullability(statement, paramNullability)
          )
        : TaskEither.right(statement)
    )
  )
}

// index 0 means param $1, index 1 means param $2, etc.
type ParamNullability = { index: number; nullable: boolean }

function getParamNullability(
  client: SchemaClient,
  tree: ast.AST
): TaskEither.TaskEither<string, ParamNullability[] | null> {
  return ast.walk<TaskEither.TaskEither<string, ParamNullability[] | null>>(
    tree,
    {
      select: () => TaskEither.right(null),
      insert: ({ table, columns, values }) =>
        pipe(
          TaskEither.right(combineParamNullability),
          TaskEither.ap(
            TaskEither.right(findParamsFromValues(values, columns.length))
          ),
          TaskEither.ap(findInsertColumns(client, table, columns))
        ),
      update: ({ table, updates }) =>
        findParamNullabilityFromUpdates(client, table, updates),
      delete: () => TaskEither.right(null),
    }
  )
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
        pipe(
          updates.map(update => updateToParamNullability(dbTable, update)),
          sequenceAE
        )
      )
    ),
    TaskEither.map(paramNullabilities =>
      pipe(
        paramNullabilities,
        Array.filterMap(R.identity)
      )
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
    Either.ap(findTableColumn(dbTable, update.columnName))
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
        pipe(
          columnNames.map(columnName => findTableColumn(dbTable, columnName)),
          sequenceAE
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
    Array.filterMap(R.identity)
  )
}

function applyParamNullability(
  stmt: StatementDescription,
  paramNullability: ParamNullability[]
): Either.Either<string, StatementDescription> {
  // paramNullability may contain multiple records for each param. If
  // any of the records states that the param is nullable, then it is
  // nullable.
  const nullability = R.range(0, stmt.params.length).map(index =>
    paramNullability
      .filter(record => record.index === index)
      .some(record => record.nullable)
  )
  return Either.right({
    ...stmt,
    params: R.zipWith(
      (param, nullable) => ({ ...param, nullable }),
      stmt.params,
      nullability
    ),
  })
}

function inferRowCount(
  statement: StatementDescription,
  astNode: ast.AST
): StatementDescription {
  const rowCount: StatementRowCount = ast.walk(astNode, {
    select: ({ limit }) =>
      limit && limit.count && isConstantExprOf('1', limit.count)
        ? 'zeroOrOne' // LIMIT 1 => zero or one rows
        : 'many',

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

function getSourceTable(
  client: SchemaClient,
  table: ast.TableRef,
  as: string | null
): TaskEither.TaskEither<string, SourceTable[]> {
  return pipe(
    client.getTable(table.schema, table.table),
    TaskEither.map(table => [
      {
        table,
        as: as || table.name,
      },
    ])
  )
}

function getSourceTablesForTableExpr(
  client: SchemaClient,
  tableExpr: ast.TableExpression | null,
  setNullable: boolean = false
): TaskEither.TaskEither<string, SourceTable[]> {
  if (!tableExpr) {
    return TaskEither.right([])
  }

  return pipe(
    ast.TableExpression.walk(tableExpr, {
      table: ({ table, as }) => getSourceTable(client, table, as),
      crossJoin: ({ left, right }) =>
        combineSourceTables(
          getSourceTablesForTableExpr(client, left, false),
          getSourceTablesForTableExpr(client, right, false)
        ),
      qualifiedJoin: ({ left, joinType, right }) =>
        combineSourceTables(
          getSourceTablesForTableExpr(
            client,
            left,
            // RIGHT or FULL JOIN -> The left side columns becomes is nullable
            joinType === 'RIGHT' || joinType === 'FULL'
          ),
          getSourceTablesForTableExpr(
            client,
            right,
            // LEFT or FULL JOIN -> The right side columns becomes is nullable
            joinType === 'LEFT' || joinType === 'FULL'
          )
        ),
    }),
    TaskEither.map(sourceTables =>
      setNullable
        ? sourceTables.map(setSourceTableColumnsAsNullable)
        : sourceTables
    )
  )
}

function setSourceTableColumnsAsNullable(
  sourceTable: SourceTable
): SourceTable {
  return {
    ...sourceTable,
    table: setTableColumnsAsNullable(sourceTable.table),
  }
}

function combineSourceTables(
  ...tables: Array<TaskEither.TaskEither<string, SourceTable[]>>
): TaskEither.TaskEither<string, SourceTable[]> {
  return pipe(
    tables,
    sequenceATE,
    TaskEither.map(R.flatten)
  )
}

function isConstantExprOf(expectedValue: string, expr: ast.Expression) {
  return ast.Expression.walkSome(expr, false, {
    constant: ({ valueText }) => valueText === expectedValue,
  })
}

function findSourceTable(sourceTables: SourceTable[], tableName: string) {
  return pipe(
    sourceTables.find(sourceTable => sourceTable.as === tableName),
    Either.fromNullable(`Unknown table ${tableName}`)
  )
}

function findSourceTableColumn(
  sourceTables: SourceTable[],
  tableName: string,
  columnName: string
) {
  return pipe(
    findSourceTable(sourceTables, tableName),
    Either.chain(table =>
      pipe(
        table.table.columns.find(column => column.name === columnName),
        Either.fromNullable(`Unknown column ${tableName}.${columnName}`)
      )
    )
  )
}

function findSourceColumn(sourceTables: SourceTable[], columnName: string) {
  return pipe(
    sourceTables.map(sourceTable => sourceTable.table.columns),
    R.flatten,
    R.find(column => column.name === columnName),
    Either.fromNullable(`Unknown column ${columnName}`)
  )
}

function findTableColumn(table: Table, columnName: string) {
  return pipe(
    table.columns.find(column => column.name === columnName),
    Either.fromNullable(`Unknown column ${columnName}`)
  )
}
