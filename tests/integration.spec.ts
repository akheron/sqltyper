import * as fs from 'fs'
import * as path from 'path'

import * as pg from '../src/pg'

import * as Array from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'

import { describeStatement } from '../src/describe'
import { validateStatement } from '../src/codegen'
import { inferStatementNullability } from '../src/infer'
import { preprocessSQL } from '../src/preprocess'
import { schemaClient as getSchemaClient } from '../src/schema'
import { typeClient as getTypeClient } from '../src/tstype'
import { StatementRowCount } from '../src/types'

// Dynamically create a test case from each integration/*.sql file

const testDir = path.join(__dirname, 'integration')

describe('Integration tests', () => {
  let pgClient: pg.Client
  beforeAll(async () => {
    pgClient = new pg.Client()
    await pgClient.connect()
  })

  afterAll(async () => {
    await pgClient.end()
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

  function makeTest(fileName: string, filePath: string) {
    return () =>
      pipe(
        TaskEither.fromEither(parseTestFile(filePath)),
        TaskEither.chain(testFile => () =>
          alwaysRollback<Either.Either<string, void>>(
            pgClient,
            async pgClient => {
              // Setup
              await testSetup(pgClient, testFile.setup)

              // Describe the query
              const statementDescription = processQuery(
                pgClient,
                testFile.query
              )

              // Check expectations
              const typeClient = await getTypeClient(pgClient)
              return await pipe(
                statementDescription,
                TaskEither.map(statementDescription => {
                  // Expected row count
                  expect(testFile.outputRowCount).toEqual(
                    statementDescription.rowCount
                  )

                  // Expected column types
                  const columnTypes = statementDescription.columns.map(
                    typeClient.columnType
                  )
                  expect(columnTypes).toEqual(testFile.columnTypes)

                  // Expected param types
                  const paramTypes = statementDescription.params.map(param => ({
                    name: param.name,
                    type: typeClient.tsType(param.type, param.nullable),
                  }))
                  expect(paramTypes).toEqual(testFile.paramTypes)
                })
              )()
            }
          )
        ),
        TaskEither.mapLeft(errorMessage => {
          throw new Error(`Failed to run ${fileName}: ${errorMessage}`)
        })
      )()
  }
})

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

  return pipe(
    Either.right(testFile(filePath)),
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

const testFile = (filePath: string) => (setup: string[]) => (query: string) => (
  outputRowCount: StatementRowCount
) => (columnTypes: Field[]) => (paramTypes: Field[]): TestFile => ({
  filePath,
  setup,
  query,
  outputRowCount,
  columnTypes,
  paramTypes,
})

async function testSetup(pgClient: pg.Client, setupStatements: string[]) {
  return Array.array.sequence(Task.taskSeq)(
    setupStatements.map(stmt => () => pgClient.query(stmt))
  )()
}

function processQuery(pgClient: pg.Client, sql: string) {
  const schemaClient = getSchemaClient(pgClient)
  return pipe(
    TaskEither.fromEither(preprocessSQL(sql)),
    TaskEither.chain(processed =>
      describeStatement(pgClient, processed.sql, processed.paramNames)
    ),
    TaskEither.chain(stmt => TaskEither.fromEither(validateStatement(stmt))),
    TaskEither.chain(stmt => inferStatementNullability(schemaClient, stmt))
  )
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
  return pipe(
    text.split('\n').map(line => {
      let parts = splitOnce(': ', line.trimRight())
      if (parts.length !== 2) return Either.left(`Invalid line: "${line}"`)
      return Either.right({ name: parts[0], type: parts[1] })
    }),
    Array.array.sequence(Either.either)
  )
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
