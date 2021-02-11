import { Parser, attempt, seq, seq2, oneOf } from '../typed-parser'
import { Expression } from '../ast'
import { expectIdentifier, symbol } from './token'
import { optional, parenthesized } from './utils'

// We need to take the expression parser as an argument to avoid cyclic
// imports
export function specialFunctionCall(
  primaryExpr: Parser<Expression>
): Parser<Expression> {
  function specialFunctionParser(
    funcName: string,
    argsParser: Parser<Expression[]>
  ) {
    return seq(
      expectIdentifier(funcName),
      parenthesized(argsParser)
    )((_, argList) =>
      Expression.createFunctionCall(null, funcName, argList, null, null)
    )
  }

  const overlayFunction: Parser<Expression> = specialFunctionParser(
    'overlay',
    seq(
      primaryExpr,
      expectIdentifier('placing'),
      primaryExpr,
      expectIdentifier('from'),
      primaryExpr,
      expectIdentifier('for'),
      primaryExpr
    )((a1, _placing, a2, _from, a3, _for, a4) => [a1, a2, a3, a4])
  )

  const positionFunction: Parser<Expression> = specialFunctionParser(
    'position',
    seq(
      primaryExpr,
      expectIdentifier('in'),
      primaryExpr
    )((a1, _in, a2) => [a1, a2])
  )

  const substringFunction: Parser<Expression> = specialFunctionParser(
    'substring',
    seq(
      primaryExpr,
      expectIdentifier('from'),
      primaryExpr,
      optional(seq2(expectIdentifier('for'), primaryExpr))
    )((a1, _from, a2, a3) => (a3 ? [a1, a2, a3] : [a1, a2]))
  )

  type TrimDirection = 'leading' | 'trailing' | 'both'

  const trimDirection = oneOf(
    expectIdentifier('leading'),
    expectIdentifier('trailing'),
    expectIdentifier('both')
  )

  function trimArgs(
    dir: TrimDirection | null,
    chrs: Expression | null,
    str: Expression
  ) {
    return [
      Expression.createConstant(dir || 'both'),
      chrs || Expression.createConstant(''),
      str,
    ]
  }

  // trim([leading | trailing | both] from string [, characters] )
  // trim([leading | trailing | both] characters from string)
  // trim([leading | trailing | both] string [, characters] )
  const trimFunction: Parser<Expression> = specialFunctionParser(
    'trim',
    seq(
      optional(trimDirection),
      oneOf<[Expression, Expression | null]>(
        seq(
          expectIdentifier('from'),
          primaryExpr,
          optional(seq2(symbol(','), primaryExpr))
        )((_from, str, chars) => [str, chars]),
        oneOf(
          attempt(
            seq(
              primaryExpr,
              expectIdentifier('from'),
              primaryExpr
            )((chrs, _from, str) => [str, chrs])
          ),
          seq(
            primaryExpr,
            optional(seq2(symbol(','), primaryExpr))
          )((str, chrs) => [str, chrs])
        )
      )
    )((dir, [str, chrs]) => trimArgs(dir, chrs, str))
  )

  return oneOf(
    overlayFunction,
    positionFunction,
    substringFunction,
    trimFunction
  )
}
