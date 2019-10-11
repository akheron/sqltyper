import * as Array from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'

import * as TaskEitherW from './TaskEitherW'
import * as Warn from './Warn'

export const traverseATs = Array.array.traverse(Task.taskSeq)
export const traverseAE = Array.array.traverse(Either.either)
export const traverseATE = Array.array.traverse(TaskEither.taskEither)
export function traverseATEW<A, E, B>(
  ta: A[],
  f: (a: A) => TaskEitherW.TaskEitherW<E, B>
): TaskEitherW.TaskEitherW<E, B[]> {
  return pipe(
    traverseATE(ta, f),
    TaskEither.map(sequenceAW)
  )
}

export const sequenceATE = Array.array.sequence(TaskEither.taskEither)
export const sequenceAW = Array.array.sequence(Warn.warn_)
export function sequenceATEW<A, E>(
  ta: TaskEitherW.TaskEitherW<E, A>[]
): TaskEitherW.TaskEitherW<E, A[]> {
  return pipe(
    sequenceATE(ta),
    TaskEither.map(sequenceAW)
  )
}
