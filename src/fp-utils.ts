import * as Array from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'
import { pipe } from 'fp-ts/lib/pipeable'

import * as InferM from './InferM'
import * as Warn from './Warn'

export const traverseATs = Array.array.traverse(Task.taskSeq)
export const traverseAE = Array.array.traverse(Either.either)
export const traverseATE = Array.array.traverse(TaskEither.taskEither)
export function traverseAIM<A, B>(
  ta: A[],
  f: (a: A) => InferM.InferM<B>
): InferM.InferM<B[]> {
  return pipe(traverseATE(ta, f), TaskEither.map(sequenceAW))
}

export const sequenceATE = Array.array.sequence(TaskEither.taskEither)
export const sequenceAW = Array.array.sequence(Warn.warn_)
export function sequenceAIM<A>(ta: InferM.InferM<A>[]): InferM.InferM<A[]> {
  return pipe(sequenceATE(ta), TaskEither.map(sequenceAW))
}

export const concat2 = <A>() => (arr1: A[]) => (arr2: A[]): A[] => [
  ...arr1,
  ...arr2,
]
