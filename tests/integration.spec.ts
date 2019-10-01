import * as fs from 'fs'
import * as path from 'path'

import * as pg from '../src/pg'

import * as Either from 'fp-ts/lib/Either'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'

import { sqlToStatementDescription } from '../src/index'
import * as C from '../src/clients'
import { StatementRowCount, StatementDescription } from '../src/types'
import { traverseATs, traverseAE } from '../src/fp-utils'
import { pgErrorToString } from '../src/describe'
import { hasWarnings, formatWarnings } from '../src/warnings'

// Dynamically create a test case from each integration/*.sql file

const testDir = path.join(__dirname, 'integration')

describe('Integration tests', () => {
  let clients: C.Clients
  beforeAll(async () => {
    clients = ((await pipe(
      () => C.connect(),
      TaskEither.mapLeft(err => {
        throw new Error(err)
      })
    )()) as Either.Right<C.Clients>).right
  })

  afterAll(async () => {
    await C.disconnect(clients)
  })

  beforeEach(async () => {
    clients = await C.clearCache(clients)
  })

  fs.readdirSync(testDir, { withFileTypes: true }).forEach(dirent => {
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
      TaskEither.chain(testFile => () =>
        alwaysRollback<Either.Either<string, void>>(clients.pg, async () => {
          // Setup
          await testSetup(clients.pg, testFile.setup)

          // Check expectations
          return await pipe(
            sqlToStatementDescription(clients, testFile.query),
            TaskEither.chain(stmt =>
              hasWarnings(stmt)
                ? TaskEither.left(
                    formatWarnings(stmt, true, process.stdout.columns || 78)
                  )
                : TaskEither.right(stmt)
            ),
            TaskEither.chain(stmt =>
              TaskEither.rightTask(checkExpectations(clients, testFile, stmt))
            )
          )()
        })
      ),
      TaskEither.mapLeft(errorMessage => {
        throw new Error(`Failed to run ${fileName}: ${errorMessage}`)
      })
    )
  }
})

function checkExpectations(
  clients: C.Clients,
  testFile: TestFile,
  statementDescription: StatementDescription
): Task.Task<void> {
  // Throws on errors
  return async () => {
    // Expected row count
    expect(testFile.outputRowCount).toEqual(statementDescription.rowCount)

    // Expected column types
    await pipe(
      traverseATs(statementDescription.columns, clients.types.columnType),
      Task.map(columnTypes => expect(columnTypes).toEqual(testFile.columnTypes))
    )()

    // Expected param types
    await pipe(
      traverseATs(statementDescription.params, param =>
        pipe(
          clients.types.tsType(param.type, param.nullable),
          Task.map(tsType => ({ name: param.name, type: tsType }))
        )
      ),
      Task.map(paramTypes => expect(paramTypes).toEqual(testFile.paramTypes))
    )()
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
  setup: string[]
  query: string
  outputRowCount: StatementRowCount
  columnTypes: Field[]
  paramTypes: Field[]
}

type Field = {
  name: string
  type: string
}

function parseTestFile(filePath: string): Either.Either<string, TestFile> {
  const content = fs.readFileSync(filePath, {
    encoding: 'utf-8',
  })

  const testFile = (setup: string[]) => (query: string) => (
    outputRowCount: StatementRowCount
  ) => (columnTypes: Field[]) => (paramTypes: Field[]): TestFile => ({
    filePath,
    setup,
    query,
    outputRowCount,
    columnTypes,
    paramTypes,
  })

  return pipe(
    Either.right(testFile),
    Either.ap(
      pipe(
        extractSection('setup', content),
        Either.map(splitSQLStatements)
      )
    ),
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
    )
  )
}

async function testSetup(pgClient: pg.Client, setupStatements: string[]) {
  return traverseATs(setupStatements, stmt => async () => {
    try {
      return await pgClient.query(stmt)
    } catch (err) {
      throw new Error(pgErrorToString(err, stmt))
    }
  })()
}

function extractSection(
  sectionName: string,
  text: string
): Either.Either<string, string> {
  const match = text.match(sectionRegex(sectionName))
  if (!match) return Either.left(`Could not find section "${sectionName}"`)

  return Either.right(match.groups!.content.trim())
}

function sectionRegex(sectionName: string): RegExp {
  return new RegExp(
    `(^|\\n)--- ${sectionName} -+\\n(?<content>.*?)\\n?(---|$)`,
    's'
  )
}

function splitFields(text: string): Either.Either<string, Field[]> {
  if (!text) return Either.right([])
  return traverseAE(text.split('\n'), line => {
    let parts = splitOnce(': ', line.trimRight())
    if (parts.length !== 2) return Either.left(`Invalid line: "${line}"`)
    return Either.right({ name: parts[0], type: parts[1] })
  })
}

function splitOnce(separator: string, text: string): string[] {
  const parts = text.split(separator)
  if (parts.length > 2) return [parts[0], parts.slice(1).join(': ')]
  return parts
}

function splitSQLStatements(sql: string): string[] {
  return sql
    .split(';')
    .map(x => x.trim())
    .filter(x => !!x)
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

async function alwaysRollback<T>(
  pgClient: pg.Client,
  wrapped: (pgClient: pg.Client) => Promise<T>
): Promise<T> {
  await pgClient.query('BEGIN')
  try {
    return await wrapped(pgClient)
  } finally {
    await pgClient.query('ROLLBACK')
  }
}
