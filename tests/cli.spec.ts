import * as childProcess from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const projectRoot = path.join(__dirname, '..')
const testDir = path.join(__dirname, 'cli')
const testNodeModules = path.join(testDir, 'node_modules')
const setupSqlPath = path.join(testDir, 'setup.sql')
const teardownSqlPath = path.join(testDir, 'teardown.sql')
const sqlsDir = path.join(testDir, 'sqls')
const invalidSqlsDir = path.join(testDir, 'invalid-sqls')
const checkTemplate = path.join(testDir, 'check.ts.template')
const checkTs = path.join(testDir, 'check.ts')
const typePlaceholder = '__CONNECTION_TYPE__'
const cliPath = path.join(__dirname, '../dist/src/cli.js')

// postgres.js defaults
const user = process.env.PGUSER || os.userInfo().username
const db = process.env.PGDATABASE || 'postgres'

function removeGeneratedFiles() {
  // eslint-disable-next-line @typescript-eslint/no-extra-semi
  ;[sqlsDir, invalidSqlsDir].forEach((dir) =>
    fs
      .readdirSync(dir)
      .filter((fileName) => path.extname(fileName) === '.ts')
      .forEach((fileName) => fs.unlinkSync(path.join(dir, fileName)))
  )
  if (fs.existsSync(checkTs)) fs.unlinkSync(checkTs)
}

function runSqlScript(path: string) {
  childProcess.execSync(`psql -f ${path}`, {
    env: { ...process.env, PGUSER: user, PGDATABASE: db },
  })
}

function runCli(paths: string, options = '') {
  childProcess.execSync(`node ${cliPath} ${options} ${paths}`, {
    cwd: testDir,
    stdio: 'pipe',
    timeout: 5000,
  })
}

function generateCheckTs(connectionType: string) {
  const template = fs.readFileSync(checkTemplate, 'utf-8')
  fs.writeFileSync(checkTs, template.replace(typePlaceholder, connectionType))
}

function build(cwd = testDir) {
  try {
    childProcess.execSync('yarn build', {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    })
  } catch (err) {
    console.log(err)
    throw err
  }
}

describe('cli', () => {
  beforeAll(() => {
    if (!fs.existsSync(cliPath)) {
      build(projectRoot)
    }
    if (!fs.existsSync(testNodeModules)) {
      childProcess.execSync('yarn', { cwd: testDir })
    }
    runSqlScript(setupSqlPath)
  })

  afterAll(() => {
    runSqlScript(teardownSqlPath)
  })

  afterEach(() => {
    removeGeneratedFiles()
  })

  it('generates valid node-postgres code', () => {
    runCli(sqlsDir, '--target pg')
    generateCheckTs('Pool')
    build()
  })

  it('generates valid postgres.js code', () => {
    runCli(sqlsDir, '--target postgres')
    generateCheckTs('Sql<{}>')
    build()
  })

  it('exit status 1 on failure', () => {
    type ErrorType = (Error & childProcess.SpawnSyncReturns<Buffer>) | undefined
    let error: ErrorType = undefined
    try {
      runCli(invalidSqlsDir)
    } catch (err) {
      error = err as ErrorType
    }
    expect(error?.status).toEqual(1)
    expect(error?.message).toContain('ERROR:  syntax error at or near "foo"')
  })
})
