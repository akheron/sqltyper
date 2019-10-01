import { StatementDescription } from './types'
import wrapAnsi = require('wrap-ansi')

export function warn(
  summary: string,
  description: string,
  stmt: StatementDescription
): StatementDescription {
  // TODO: Lenses would be nice
  return {
    ...stmt,
    warnings: [...stmt.warnings, { summary, description }],
  }
}

export function hasWarnings(stmt: StatementDescription): boolean {
  return stmt.warnings.length > 0
}

export function formatWarnings(
  stmt: StatementDescription,
  verbose: boolean,
  columns: number
): string {
  let result = stmt.warnings
    .map(
      warning =>
        `
WARNING: ${warning.summary}${verbose ? '\n\n' + warning.description : ''}`
    )
    .join('\n')

  result += `

Due to the problems listed above, the inferred types may be inaccurate with respect to nullability.
`

  if (verbose) {
    result += `
Please open an issue on https://github.com/akheron/sqltyper.

Include the above error message, relevant parts of your database schema (CREATE TABLE statements, CREATE TYPE statements, etc.) and the SQL statement that failed to parse.

Thank you in advance!
`
  } else {
    result += `
Re-run with --verbose for instructions on how to report or fix this.
`
  }
  return wrapAnsi(result.trim(), columns, { hard: true, trim: false })
}
