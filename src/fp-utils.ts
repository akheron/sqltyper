import * as Array from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'

import * as Warn from './warnings'

export const traverseATs = Array.array.traverse(Task.taskSeq)
export const traverseAE = Array.array.traverse(Either.either)
export const traverseATE = Array.array.traverse(TaskEither.taskEither)
export const sequenceATE = Array.array.sequence(TaskEither.taskEither)
export const sequenceAW = Array.array.sequence(Warn.warn_)
