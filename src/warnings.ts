import wrapAnsi = require('wrap-ansi')

export type Warn<A> = {
  payload: A
  warnings: Warning[]
}

export type Warning = {
  summary: string
  description: string
}

export function ok<A>(payload: A): Warn<A> {
  return { payload, warnings: [] }
}

export function warn(summary: string, description: string) {
  return <A>(warn: Warn<A>): Warn<A> => {
    return {
      ...warn,
      warnings: [...warn.warnings, { summary, description }],
    }
  }
}

export function run<A>(warn: Warn<A>): [A, Warning[]] {
  return [warn.payload, warn.warnings]
}

export function get<A>(warn: Warn<A>): A {
  return warn.payload
}

export function map<A, B>(f: (payload: A) => B) {
  return (a: Warn<A>): Warn<B> => {
    return { ...a, payload: f(a.payload) }
  }
}

export function sequenceA<A>(warns: Warn<A>[]): Warn<A[]> {
  const payload: A[] = []
  let warnings: Warning[] = []
  for (const warn of warns) {
    payload.push(warn.payload)
    warnings = warnings.concat(warn.warnings)
  }
  return { payload, warnings }
}

export function format(
  warnings: Warning[],
  verbose: boolean,
  columns: number
): string {
  let result = warnings
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
