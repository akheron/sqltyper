import * as Array from 'fp-ts/lib/Array'
import * as Either from 'fp-ts/lib/Either'
import * as Task from 'fp-ts/lib/Task'
import * as TaskEither from 'fp-ts/lib/TaskEither'

export const sequenceATs = Array.array.sequence(Task.taskSeq)
export const sequenceAE = Array.array.sequence(Either.either)
export const sequenceATE = Array.array.sequence(TaskEither.taskEither)
