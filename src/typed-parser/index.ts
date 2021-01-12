// Modified from https://github.com/jinjor/typed-parser/blob/4228d4871e84ef4417f51058970c2423e077f8af/src/index.ts

/**
 * The source location.
 */
export interface Position {
  row: number
  column: number
}

/**
 * Location range of the source.
 * (See also `mapWithRange()`)
 */
export interface Range {
  start: Position
  end: Position
}

/**
 * This error is thrown by `run()` when the parser fails.
 * Unexpected errors (e.g. "undefined is not a function") won't be wraped with this error.
 */
export interface ParseError extends Error {
  offset: number
  position: Position
  explain(): string
}

/**
 * Judge if an error (or anything else) is a ParseError.
 */
export function isParseError(e: any): e is ParseError {
  return e instanceof ParseErrorImpl
}

class ParseErrorImpl extends Error implements ParseError {
  private positions = new Map<number, Position>()
  constructor(private source: string, private error: Failure) {
    super(error.message)
  }
  get offset(): number {
    return this.error.offset
  }
  get position(): Position {
    return this.getPosition(this.offset)
  }
  private getPosition(offset: number): Position {
    let result = this.positions.get(offset)
    if (result === undefined) {
      result = calcPosition(this.source, offset)
      this.positions.set(offset, result)
    }
    return result
  }
  explain(): string {
    let text = ''
    const startPos = this.getPosition(this.error.scope.offset)
    const errorPos = this.position
    const lines = this.source.split('\n').slice(startPos.row - 1, errorPos.row)
    function appendSubMessages(error: Failure | string, indent: number): void {
      if (indent) {
        text += ' '.repeat(indent) + '- '
      }
      if (typeof error === 'string') {
        text += error + '\n'
        return
      }
      if (error.message) {
        const at = indent ? '' : ` at (${errorPos.row}:${errorPos.column})`
        text += `${error.message}${at}\n`
        return
      }
      if (error instanceof ExpectOneOf) {
        const pureExpects = []
        const others = []
        for (const e of error.errors) {
          if (e instanceof Expect) {
            pureExpects.push(e.name)
          } else if (e instanceof ExpectOneOf) {
            pureExpects.push(e.alias)
          } else {
            others.push(e)
          }
        }
        const expectations =
          'Expect ' +
          (pureExpects.length > 1 ? 'one of ' : '') +
          pureExpects.join(', ') +
          '\n'

        if (!others.length) {
          text += expectations
        } else {
          text += `Multiple parsers were not successful\n`
          appendSubMessages(expectations, indent + 2)
          for (const e of others) {
            appendSubMessages(e, indent + 2)
          }
        }
      }
    }
    appendSubMessages(this.error, 0)
    text += '\n'
    for (let r = startPos.row; r <= errorPos.row; r++) {
      const line = lines[r - startPos.row]
      text += `${String(r).padStart(5)}| ${line}\n`
    }
    text += `${' '.repeat(6 + errorPos.column)}^\n`
    if (this.error.scope.name) {
      text += 'Context:\n'
    }
    let scope: Scope | undefined = this.error.scope
    while (scope && scope.name !== null) {
      const { row, column } = this.getPosition(scope.offset)
      text += `    at ${scope.name} (${row}:${column}) \n`
      scope = scope.parent
    }
    return text
  }
}

export function calcPosition(source: string, offset: number): Position {
  const sub = (source + ' ').slice(0, offset + 1)
  const lines = sub.split('\n')
  const row = lines.length
  const column = lines[lines.length - 1].length
  return { row, column }
}

interface Failure {
  scope: Scope
  offset: number
  message: string
}

function isFailure(e: unknown | Failure): e is Failure {
  return e instanceof AbstractFailure
}

abstract class AbstractFailure implements Failure {
  scope: Scope
  offset: number
  abstract message: string
  constructor(context: Context) {
    this.scope = context.scope
    this.offset = context.offset
  }
}

class Expect extends AbstractFailure {
  public alias: string | null = null
  constructor(context: Context, public what: string, public type: string) {
    super(context)
  }
  get message(): string {
    return `Expect ${this.name}`
  }
  get name(): string {
    return this.alias || `${this.type} \`${this.what}\``
  }
}

class NotFound extends AbstractFailure {
  constructor(context: Context, public what: string, public name: string) {
    super(context)
  }
  get message(): string {
    return `${this.name} \`${this.what}\` not found`
  }
}

class ExpectEnd extends AbstractFailure {
  constructor(context: Context) {
    super(context)
  }
  get message(): string {
    return `Expect the end of source`
  }
}
class CustomErr extends AbstractFailure {
  constructor(context: Context, public message: string) {
    super(context)
  }
}

class ExpectOneOf extends AbstractFailure {
  public alias: string | null = null
  constructor(context: Context, public errors: Failure[]) {
    super(context)
  }
  get message(): string {
    if (this.alias) {
      return `Expected ${this.alias}`
    }
    return ''
  }
}

class Scope {
  constructor(
    public offset: number,
    public name: string | null,
    public parent?: Scope
  ) {}
}

class Context {
  offset = 0
  scope: Scope = new Scope(0, null)
}

/**
 * `Parser<A>` returns `A` when it succeeds.
 */
export type Parser<A> = (source: string, context: Context) => A | Failure

/**
 * Run a parser. It throws ParseError when it fails.
 */
export function run<A>(parser: Parser<A>, source: string): A {
  const context = new Context()
  const result = parser(source, context)
  if (isFailure(result)) {
    throw new ParseErrorImpl(source, result)
  }
  return result
}

/**
 * Apply given parsers and convert the results to another value.
 */
export function seq<A extends Array<any>, B>(
  map: (...args: { [I in keyof A]: A[I] }) => B,
  ...parsers: { [I in keyof A]: Parser<A[I]> }
): Parser<B> {
  return (source, context) => {
    const values: any = []
    for (let i = 0; i < parsers.length; i++) {
      const parser = parsers[i]
      const result = parser(source, context)
      if (isFailure(result)) {
        return result
      }
      values[i] = result
    }
    return map(...values)
  }
}

/**
 * `seq($null, ...)` will return null.
 */
export function $null(..._: unknown[]): null {
  return null
}

/**
 * `seq($1, ...)` will return the first result.
 */
export function $1<A>(a: A): A {
  return a
}

/**
 * `seq($2, ...)` will return the second result.
 */
export function $2<A>(_1: any, a: A): A {
  return a
}

/**
 * `seq($3, ...)` will return the third result.
 */
export function $3<A>(_1: any, _2: any, a: A): A {
  return a
}

/**
 * Apply given parser and convert the result to another value.
 */
export function map<A, B>(
  f: (a: A, toError: (message: string) => Failure) => B | Failure,
  parser: Parser<A>
): Parser<B> {
  return (source, context) => {
    const originalOffset = context.offset
    const result = parser(source, context)
    if (isFailure(result)) {
      return result
    }
    const result2 = f(result, function toError(message) {
      context.offset = originalOffset
      return new CustomErr(context, message)
    })
    return result2
  }
}

/**
 * Apply given parser and convert the result to another value along with the source location.
 */
export function mapWithRange<A, B>(
  f: (value: A, range: Range, toError: (message: string) => Failure) => B,
  parser: Parser<A>
): Parser<B> {
  return (source, context) => {
    const originalOffset = context.offset
    const start = calcPosition(source, context.offset)
    const result = parser(source, context)
    if (isFailure(result)) {
      return result
    }
    const end = calcPosition(source, context.offset - 1)
    const result2 = f(result, { start, end }, function toError(message) {
      context.offset = originalOffset
      return new CustomErr(context, message)
    })
    return result2
  }
}

/**
 * Only succeeds when position is at the end of the source.
 */
export const end: Parser<null> = (source, context) => {
  if (source.length !== context.offset) {
    return new ExpectEnd(context)
  }
  return null
}

/**
 * Succeeds when one of given parsers succeeds.
 * Note that no fallback will occur if any one of them consumes even a single character.
 * (See also `attempt()`)
 */
export function oneOf<A>(...parsers: Parser<A>[]): Parser<A> {
  return (source, context) => {
    const errors = []
    const originalOffset = context.offset
    for (const parser of parsers) {
      const result = parser(source, context)
      if (!(result instanceof AbstractFailure)) {
        return result
      }
      if (originalOffset === context.offset) {
        errors.push(result)
      } else {
        return result
      }
    }
    return new ExpectOneOf(context, errors)
  }
}

/**
 * If the first parser fails, the second will be applied.
 * It looks similar to `oneOf()`, but it will say nothing about the first error when the second fails.
 */
export function guard<A>(guarder: Parser<A>, parser: Parser<A>): Parser<A> {
  return (source, context) => {
    const first = guarder(source, context)
    if (!isFailure(first)) {
      return first
    }
    return parser(source, context)
  }
}

/**
 * When the given parser fails, offset will return to the first position
 * it started parsing, even if it consists of multiple parsers.
 * This can be used to force fallback in `oneOf()`, but overuse can lead to poor performance.
 */
export function attempt<A>(parser: Parser<A>): Parser<A> {
  return (source, context) => {
    const originalOffset = context.offset
    const result = parser(source, context)
    if (isFailure(result)) {
      context.offset = originalOffset
      return result
    }
    return result
  }
}

/**
 * Add helpful name (ex. array, object, ...) to given parser.
 */
export function withContext<A>(name: string, parser: Parser<A>): Parser<A> {
  return (source, context) => {
    const parent = context.scope
    context.scope = new Scope(context.offset, name, parent)
    const originalOffset = context.offset
    const result = parser(source, context)
    if (
      context.offset == originalOffset &&
      (result instanceof Expect || result instanceof ExpectOneOf)
    ) {
      result.alias = name
    }
    context.scope = parent
    return result
  }
}

/**
 * Recursively declared parsers cause infinite loop (and stack overflow).
 * To avoid that, `lazy()` gets the parser only when it is needed.
 */
export function lazy<A>(getParser: () => Parser<A>): Parser<A> {
  return (source, context) => {
    const parser = getParser()
    if (!parser) {
      throw new Error('Could not get parser')
    }
    return parser(source, context)
  }
}

/**
 * Get string that matched the regex.
 */
export function match(regexString: string): Parser<string> {
  const regexp = new RegExp(regexString, 'smy')
  return (source, context) => {
    regexp.lastIndex = context.offset
    const result = regexp.exec(source)
    if (result) {
      const s = result[0]
      context.offset += s.length
      return s
    } else {
      return new Expect(context, regexString, 'pattern')
    }
  }
}

/**
 * Skip a part of source that matched the regex.
 */
export function skip(regexString: string): Parser<null> {
  const regexp = new RegExp(regexString, 'smy')
  return (source, context) => {
    regexp.lastIndex = context.offset
    if (regexp.test(source)) {
      context.offset = regexp.lastIndex
    }
    return null
  }
}

/**
 * Succeeds if the rest of source starts with the given string.
 * The optional type indicates what that string means.
 */
export function expectString(s: string, type = 'string'): Parser<null> {
  return (source, context) => {
    if (source.startsWith(s, context.offset)) {
      context.offset += s.length
      return null
    } else {
      return new Expect(context, s, type)
    }
  }
}

function _stringUntil(
  regexString: string,
  excludeLast: boolean
): Parser<string> {
  const regexp = new RegExp(regexString, 'g')
  return (source, context) => {
    regexp.lastIndex = context.offset
    const result = regexp.exec(source)
    if (!result) {
      return new NotFound(context, regexString, 'pattern')
    }
    const s = source.slice(context.offset, result.index)
    context.offset += s.length + (excludeLast ? 0 : result[0].length)
    return s
  }
}

/**
 * Gets the string before the given pattern but does not consume the last.
 */
export function stringBefore(regexString: string): Parser<string> {
  return _stringUntil(regexString, true)
}

/**
 * Get the string before the given pattern and consume the last.
 */
export function stringUntil(regexString: string): Parser<string> {
  return _stringUntil(regexString, false)
}

/**
 * Gets the string before the given pattern or the end of the source.
 */
export function stringBeforeEndOr(regexString: string): Parser<string> {
  const regexp = new RegExp(regexString, 'g')
  return (source, context) => {
    regexp.lastIndex = context.offset
    const result = regexp.exec(source)
    let index
    if (result) {
      index = result.index
    } else {
      index = source.length
    }
    const s = source.slice(context.offset, index)
    context.offset += s.length
    return s
  }
}

/**
 * Do nothing
 */
export const noop: Parser<null> = () => {
  return null
}

/**
 * Always succeed and return the constant value.
 */
export function constant<T>(t: T): Parser<T> {
  return () => t
}

/**
 * This can be used when the implementation is not done.
 */
export function todo<A>(name: string): Parser<A> {
  throw new Error(`Parser "${name}" is not implemented yet.`)
}

/**
 * Parse many items while it is possible.
 * If the item parser *partially* succeeds, then the entire parser fails.
 * (See also `attempt()`)
 */
export function many<A>(itemParser: Parser<A>): Parser<A[]> {
  return (source, context) => {
    const items = []
    while (true) {
      const originalOffset = context.offset
      const result = itemParser(source, context)
      if (originalOffset === context.offset) {
        break
      }
      if (isFailure(result)) {
        return result
      }
      items.push(result)
    }
    return items
  }
}

function nextItem<A>(
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A> {
  return seq($2, attempt(separator), itemParser)
}

/**
 * Parse zero or more items with given separator.
 */
export function sepBy<A>(
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return oneOf(
    seq(
      (head, tail) => {
        tail.unshift(head)
        return tail
      },
      itemParser,
      many(nextItem(separator, itemParser))
    ),
    constant([])
  )
}

/**
 * Parse one or more items with given separator.
 */
export function sepBy1<A>(
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return seq(
    (head, tail) => {
      tail.unshift(head)
      return tail
    },
    itemParser,
    many(nextItem(separator, itemParser))
  )
}

/**
 * Parse many items until something.
 */
export function manyUntil<A>(
  end: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return (source, context) => {
    const items = []
    while (true) {
      if (!isFailure(end(source, context))) {
        break
      }
      const result = itemParser(source, context)
      if (isFailure(result)) {
        return result
      }
      items.push(result)
    }
    return items
  }
}

/**
 * Parse zero or more items with given separator until something.
 */
export function sepUntil<A>(
  end: Parser<unknown>,
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return guard(
    map((_) => [], end),
    sepUntil1(end, separator, itemParser)
  )
}

/**
 * Parse one or more items with given separator until something.
 */
export function sepUntil1<A>(
  end: Parser<unknown>,
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return seq(
    (head, tail) => {
      tail.unshift(head)
      return tail
    },
    itemParser,
    manyUntil(end, seq($2, separator, itemParser))
  )
}

/**
 * Expect a symbol like `,`, `"`, `[`, etc.
 */
export function symbol(s: string): Parser<null> {
  return expectString(s, 'symbol')
}

/**
 * Expect a keyword like `true`, `null`, `for`, etc.
 * Return the second argument if provided.
 */
export function keyword(s: string): Parser<null>
export function keyword<A>(s: string, value: A): Parser<A>
export function keyword<A>(s: string, value?: A): Parser<A> {
  if (value === undefined) {
    return expectString(s, 'keyword') as any
  }
  return map((_) => value, expectString(s, 'keyword'))
}

/**
 * Parse integer with given regex.
 */
export function int(regexString: string): Parser<number> {
  return map((s, toError) => {
    const n = parseInt(s)
    if (isNaN(n)) {
      return toError(`${s} is not an integer`)
    }
    return n
  }, match(regexString))
}

/**
 * Parse float number with given regex.
 */
export function float(regexString: string): Parser<number> {
  return map((s, toError) => {
    const n = parseFloat(s)
    if (isNaN(n)) {
      return toError(`${s} is not a float`)
    }
    return n
  }, match(regexString))
}

/**
 * Skip whitespace (`\\s*`)
 */
export const whitespace: Parser<null> = skip('\\s*')

/**
 * Alias of `whitespace`
 */
export const _: Parser<null> = whitespace

/**
 * Parse something between symbols with padding (`whitespace`).
 * (Note: should be renamed to `between`)
 */
export function braced<A>(
  start: string,
  end: string,
  itemParser: Parser<A>
): Parser<A> {
  return seq($3, symbol(start), _, itemParser, _, symbol(end))
}

/**
 * Parse something like `[ 1, 2, 3 ]`
 */
export function bracedSep<A>(
  start: string,
  end: string,
  separator: Parser<unknown>,
  itemParser: Parser<A>
): Parser<A[]> {
  return seq(
    $3,
    symbol(start),
    _,
    sepUntil(seq($null, _, symbol(end)), separator, itemParser)
  )
}
