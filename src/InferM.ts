import * as Either from 'fp-ts/lib/Either'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { flow, pipe } from 'fp-ts/lib/function'

import * as Warn from './Warn'

export type InferM<A> = TaskEither.TaskEither<string, Warn.Warn<A>>

export const fromEither: <A>(e: Either.Either<string, A>) => InferM<A> = flow(
  Either.map(Warn.of),
  TaskEither.fromEither
)

export const fromTaskEither: <A>(
  te: TaskEither.TaskEither<string, A>
) => InferM<A> = TaskEither.map(Warn.of)

export const right: <A = never>(a: A) => InferM<A> = flow(
  Warn.of,
  TaskEither.right
)

export const payload: <A>(fa: InferM<A>) => TaskEither.TaskEither<string, A> =
  TaskEither.map((warn) => warn.payload)

export const warnings: <A>(
  fa: InferM<A>
) => TaskEither.TaskEither<string, Warn.Warning[]> = TaskEither.map(
  (warn) => warn.warnings
)

export const map: <A, B>(f: (a: A) => B) => (fa: InferM<A>) => InferM<B> = flow(
  Warn.map,
  TaskEither.map
)

export function chain<A, B>(f: (a: A) => InferM<B>) {
  return (ma: InferM<A>): InferM<B> =>
    pipe(
      TaskEither.right(
        (p: Warn.Warn<B>) => (w: Warn.Warning[]) =>
          Warn.make(p.payload, p.warnings.concat(w))
      ),
      TaskEither.ap(
        pipe(
          ma,
          TaskEither.chain((w) => f(w.payload))
        )
      ),
      TaskEither.ap(warnings(ma))
    )
}

export function ap<A>(fa: InferM<A>) {
  return <B>(fab: InferM<(a: A) => B>): InferM<B> =>
    pipe(
      TaskEither.right(
        (p: B) => (w1: Warn.Warning[]) => (w2: Warn.Warning[]) =>
          Warn.make(p, w1.concat(w2))
      ),
      TaskEither.ap(pipe(payload(fab), TaskEither.ap(payload(fa)))),
      TaskEither.ap(warnings(fa)),
      TaskEither.ap(warnings(fab))
    )
}
