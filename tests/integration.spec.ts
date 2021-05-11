import * as fs from 'fs'
import * as path from 'path'

import * as postgres from '../src/postgres'

import * as Array from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as Ord from 'fp-ts/lib/Ord'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { identity } from 'fp-ts/lib/function'
import { pipe } from 'fp-ts/lib/pipeable'

import { sqlToStatementDescription } from '../src/index'
import * as C from '../src/clients'
import { StatementRowCount, StatementDescription } from '../src/types'
import { traverseATs, traverseAE } from '../src/fp-utils'
import { errorToString } from '../src/describe'
import * as Warn from '../src/Warn'

// Dynamically create a test case from each integration/*.sql file

const testDir = path.join(__dirname, 'integration')

describe('Integration tests', () => {
  let sql: postgres.Sql<{}>

  beforeAll(() => {
    sql = postgres()
  })

  afterAll(() => {
    sql.end({ timeout: 5 })
  })

  fs.readdirSync(testDir, { withFileTypes: true }).forEach((dirent) => {
    const fileName = dirent.name
    const filePath = path.join(testDir, fileName)
    if (!dirent.isFile() || !isTestFileName(fileName)) {
      return
    }

    const testFn = makeTest(fileName, filePath)
    if (isSkippedTestFileName(fileName)) {
      it.skip(fileName, testFn)
    } else {
      it(fileName, testFn)
    }
  })

  function makeTest(
    fileName: string,
    filePath: string
  ): () => Promise<Either.Either<string, void>> {
    return pipe(
      TaskEither.fromEither(parseTestFile(filePath)),
      TaskEither.chain(
        (testFile) => () =>
          alwaysRollback(sql, async (tx) => {
            const clients = await C.clients(tx)

            // Setup
            await testSetup(tx, testFile.setup)

            // Check expectations
            return await pipe(
              sqlToStatementDescription(clients, testFile.query),
              TaskEither.chain((stmtWithWarnings) => {
                const warnings = stmtWithWarnings.warnings
                if (testFile.warnings.length === 0 && warnings.length > 0) {
                  // No warnings expected => Treat warnings as errors
                  return TaskEither.left(
                    Warn.format(warnings, true, process.stdout.columns || 78)
                  )
                }
                return TaskEither.right(stmtWithWarnings)
              }),
              TaskEither.chain((stmtWithWarnings) =>
                TaskEither.rightTask(
                  checkExpectations(clients, testFile, stmtWithWarnings)
                )
              )
            )()
          })
      ),
      TaskEither.mapLeft((errorMessage) => {
        throw new Error(`Failed to run ${fileName}: ${errorMessage}`)
      })
    )
  }
})

function checkExpectations(
  clients: C.Clients,
  testFile: TestFile,
  statementDescriptionWithWarnings: Warn.Warn<StatementDescription>
): Task.Task<void> {
  // Throws on errors
  return async () => {
    const [statementDescription, warnings] = Warn.split(
      statementDescriptionWithWarnings
    )

    // Expected row count
    expect(testFile.outputRowCount).toEqual(statementDescription.rowCount)

    // Expected column types
    await pipe(
      traverseATs(statementDescription.columns, clients.types.columnType),
      Task.map((columnTypes) =>
        expect(columnTypes).toEqual(testFile.columnTypes)
      )
    )()

    // Expected param types
    await pipe(
      traverseATs(statementDescription.params, (param) =>
        pipe(
          clients.types.tsType(param.type, param.nullable),
          Task.map((tsType) => ({ name: param.name, type: tsType }))
        )
      ),
      Task.map((paramTypes) => expect(paramTypes).toEqual(testFile.paramTypes))
    )()

    // Expected warnings (only check the summary)
    expect(pipe(testFile.warnings, Array.sort(Ord.ordString))).toEqual(
      pipe(
        warnings.map((w) => w.summary),
        Array.sort(Ord.ordString)
      )
    )
  }
}

function isTestFileName(fileName: string): boolean {
  return /\.sql(\.skip)?$/.test(fileName)
}

function isSkippedTestFileName(fileName: string): boolean {
  return /\.sql.skip$/.test(fileName)
}

type TestFile = {
  filePath: string
  setup: string
  query: string
  outputRowCount: StatementRowCount
  columnTypes: Field[]
  paramTypes: Field[]
  warnings: string[]
}

type Field = {
  name: string
  type: string
}

function parseTestFile(filePath: string): Either.Either<string, TestFile> {
  const content = fs.readFileSync(filePath, {
    encoding: 'utf-8',
  })

  const testFile =
    (setup: string) =>
    (query: string) =>
    (outputRowCount: StatementRowCount) =>
    (columnTypes: Field[]) =>
    (paramTypes: Field[]) =>
    (warnings: string[]): TestFile => ({
      filePath,
      setup,
      query,
      outputRowCount,
      columnTypes,
      paramTypes,
      warnings,
    })

  return pipe(
    Either.right(testFile),
    Either.ap(extractSection('setup', content)),
    Either.ap(extractSection('query', content)),
    Either.ap(
      pipe(
        extractSection('expected row count', content),
        Either.chain(statementRowCountFromString)
      )
    ),
    Either.ap(
      pipe(
        extractSection('expected column types', content),
        Either.chain(splitFields)
      )
    ),
    Either.ap(
      pipe(
        extractSection('expected param types', content),
        Either.chain(splitFields)
      )
    ),
    Either.ap(
      pipe(
        extractSection('expected warnings', content),
        Either.map((s) => s.split('\n')),
        Either.map((lines) => lines.filter(identity)),
        Either.orElse(() => Either.right([] as string[]))
      )
    )
  )
}

async function testSetup(sql: postgres.Sql<{}>, setupStatement: string) {
  try {
    return await sql.unsafe(setupStatement)
  } catch (err) {
    throw new Error(errorToString(err, setupStatement))
  }
}

function extractSection(
  sectionName: string,
  text: string
): Either.Either<string, string> {
  const match = text.match(sectionRegex(sectionName))
  if (!match || !match.groups)
    return Either.left(`Could not find section "${sectionName}"`)

  return Either.right(match.groups.content.trim())
}

function sectionRegex(sectionName: string): RegExp {
  return new RegExp(
    `(^|\\n)--- ${sectionName} -+\\n(?<content>.*?)\\n?(---|$)`,
    's'
  )
}

function splitFields(text: string): Either.Either<string, Field[]> {
  if (!text) return Either.right([])
  return traverseAE(text.split('\n'), (line) => {
    const parts = splitOnce(': ', line.trimRight())
    if (parts.length !== 2) return Either.left(`Invalid line: "${line}"`)
    return Either.right({ name: parts[0], type: parts[1] })
  })
}

function splitOnce(separator: string, text: string): string[] {
  const parts = text.split(separator)
  if (parts.length > 2) return [parts[0], parts.slice(1).join(': ')]
  return parts
}

function statementRowCountFromString(
  a: string
): Either.Either<string, StatementRowCount> {
  switch (a) {
    case 'zero':
    case 'one':
    case 'many':
      return Either.right(a)
    case 'zero or one':
      return Either.right('zeroOrOne')
  }
  return Either.left(`"${a}" is not a valid statement row count`)
}

const ROLLBACK_MARKER = '__intended_rollback__'

async function alwaysRollback<T>(
  sql: postgres.Sql<{}>,
  wrapped: (sql: postgres.Sql<{}>) => Promise<T>
): Promise<T> {
  let result: T | undefined = undefined
  try {
    await sql.begin(async (tx: postgres.Sql<{}>) => {
      result = await wrapped(tx)
      throw new Error(ROLLBACK_MARKER)
    })
  } catch (err) {
    if (err.message !== ROLLBACK_MARKER) throw err
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return result!
}
