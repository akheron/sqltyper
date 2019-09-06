import { either } from 'fp-ts'

export type InferError = {
  kind: 'InferError'
  message: string
}

export function isInferError(value: any): value is InferError {
  return value && value.kind === 'InferError'
}

export function error(message: string): InferError {
  return { kind: 'InferError', message }
}

export type Failable<T> = either.Either<InferError, T>

export function fail<T>(message: string): Failable<T> {
  return either.left(error(message))
}

export function ok<T>(value: T): Failable<T> {
  return either.right(value)
}
