const notCached = Symbol()

export function asyncCached<R>(fn: () => Promise<R>): () => Promise<R> {
  let cached: R | typeof notCached = notCached
  return async () => {
    if (cached === notCached) {
      cached = await fn()
    }
    return cached
  }
}
