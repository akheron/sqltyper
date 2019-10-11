import * as Either from 'fp-ts/lib/Either'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { flow } from 'fp-ts/lib/function'
import { pipe } from 'fp-ts/lib/pipeable'

import * as Warn from './Warn'

export type TaskEitherW<E, A> = TaskEither.TaskEither<E, Warn.Warn<A>>

export const map: <E, A, B>(
  f: (a: A) => B
) => (fa: TaskEitherW<E, A>) => TaskEitherW<E, B> = flow(
  Warn.map,
  TaskEither.map
)

export const fromEither: <E, A>(
  e: Either.Either<E, A>
) => TaskEitherW<E, A> = flow(
  Either.map(Warn.of),
  TaskEither.fromEither
)

export const fromTaskEither: <E, A>(
  te: TaskEither.TaskEither<E, A>
) => TaskEitherW<E, A> = TaskEither.map(Warn.of)

export const right: <E = never, A = never>(a: A) => TaskEitherW<E, A> = flow(
  Warn.of,
  TaskEither.right
)

export const payload: <E, A>(
  fa: TaskEitherW<E, A>
) => TaskEither.TaskEither<E, A> = TaskEither.map(warn => warn.payload)

export const warnings: <E, A>(
  fa: TaskEitherW<E, A>
) => TaskEither.TaskEither<E, Warn.Warning[]> = TaskEither.map(
  warn => warn.warnings
)

export function chain<E, A, B>(f: (a: A) => TaskEitherW<E, B>) {
  return (ma: TaskEitherW<E, A>): TaskEitherW<E, B> =>
    pipe(
      TaskEither.right((p: Warn.Warn<B>) => (w: Warn.Warning[]) =>
        Warn.make(p.payload, p.warnings.concat(w))
      ),
      TaskEither.ap(
        pipe(
          ma,
          TaskEither.chain(w => f(w.payload))
        )
      ),
      TaskEither.ap(warnings(ma))
    )
}

export function ap<E, A>(fa: TaskEitherW<E, A>) {
  return <B>(fab: TaskEitherW<E, (a: A) => B>): TaskEitherW<E, B> =>
    pipe(
      TaskEither.right((p: B) => (w1: Warn.Warning[]) => (w2: Warn.Warning[]) =>
        Warn.make(p, w1.concat(w2))
      ),
      TaskEither.ap(
        pipe(
          payload(fab),
          TaskEither.ap(payload(fa))
        )
      ),
      TaskEither.ap(warnings(fa)),
      TaskEither.ap(warnings(fab))
    )
}
