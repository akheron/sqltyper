import { Applicative, Applicative1 } from 'fp-ts/lib/Applicative'
import { Apply1 } from 'fp-ts/lib/Apply'
import { Foldable1 } from 'fp-ts/lib/Foldable'
import { Functor1 } from 'fp-ts/lib/Functor'
import { HKT } from 'fp-ts/lib/HKT'
import { Traversable1 } from 'fp-ts/lib/Traversable'

import wrapAnsi = require('wrap-ansi')

export const URI = 'Warn'
export type URI = typeof URI

declare module 'fp-ts/lib/HKT' {
  interface URItoKind<A> {
    Warn: Warn<A>
  }
}

export type Warn<A> = {
  payload: A
  warnings: Warning[]
}

export type Warning = {
  summary: string
  description: string
}

export const warn_: Functor1<URI> &
  Apply1<URI> &
  Applicative1<URI> &
  Foldable1<URI> &
  Traversable1<URI> = {
  URI,
  map: (ma, f) => ({
    payload: f(ma.payload),
    warnings: ma.warnings,
  }),
  ap: (fab, fa) => ({
    payload: fab.payload(fa.payload),
    warnings: fab.warnings.concat(fa.warnings),
  }),
  of: of,
  reduce: (fa, b, f) => f(b, fa.payload),
  reduceRight: (fa, b, f) => f(fa.payload, b),
  foldMap: _M => (fa, f) => f(fa.payload),
  traverse: <F>(F: Applicative<F>) => <A, B>(
    ta: Warn<A>,
    f: (a: A) => HKT<F, B>
  ): HKT<F, Warn<B>> =>
    F.map(f(ta.payload), b => ({ payload: b, warnings: ta.warnings })),
  sequence: <F>(F: Applicative<F>) => <A>(
    ta: Warn<HKT<F, A>>
  ): HKT<F, Warn<A>> =>
    F.map(ta.payload, a => ({ payload: a, warnings: ta.warnings })),
}

export function of<A>(payload: A): Warn<A> {
  return { payload, warnings: [] }
}

export function warning<A>(payload: A, summary: string, description = '') {
  return {
    payload,
    warnings: [{ summary, description }],
  }
}

export function addWarning(summary: string, description: string) {
  return <A>(warn: Warn<A>): Warn<A> => {
    return {
      payload: warn.payload,
      warnings: [...warn.warnings, { summary, description }],
    }
  }
}

export function make<A>(payload: A, warnings: Warning[]) {
  return { payload, warnings }
}

export function split<A>(warn: Warn<A>): [A, Warning[]] {
  return [warn.payload, warn.warnings]
}

export function map<A, B>(f: (payload: A) => B) {
  return (a: Warn<A>): Warn<B> => {
    return { ...a, payload: f(a.payload) }
  }
}

export function ap<A>(fa: Warn<A>) {
  return <B>(fab: Warn<(a: A) => B>): Warn<B> => warn_.ap(fab, fa)
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
WARNING: ${warning.summary}${
          verbose && warning.description != ''
            ? '\n\n' + warning.description
            : ''
        }`
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
