import { Parser, $2, attempt, seq, oneOf } from '../typed-parser'
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
      (_, argList) =>
        Expression.createFunctionCall(funcName, argList, null, null),
      expectIdentifier(funcName),
      parenthesized(argsParser)
    )
  }

  const overlayFunction: Parser<Expression> = specialFunctionParser(
    'overlay',
    seq(
      (a1, _placing, a2, _from, a3, _for, a4) => [a1, a2, a3, a4],
      primaryExpr,
      expectIdentifier('placing'),
      primaryExpr,
      expectIdentifier('from'),
      primaryExpr,
      expectIdentifier('for'),
      primaryExpr
    )
  )

  const positionFunction: Parser<Expression> = specialFunctionParser(
    'position',
    seq(
      (a1, _in, a2) => [a1, a2],
      primaryExpr,
      expectIdentifier('in'),
      primaryExpr
    )
  )

  const substringFunction: Parser<Expression> = specialFunctionParser(
    'substring',
    seq(
      (a1, _from, a2, a3) => (a3 ? [a1, a2, a3] : [a1, a2]),
      primaryExpr,
      expectIdentifier('from'),
      primaryExpr,
      optional(seq($2, expectIdentifier('for'), primaryExpr))
    )
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
      (dir, [str, chrs]) => trimArgs(dir, chrs, str),
      optional(trimDirection),
      oneOf<[Expression, Expression | null]>(
        seq(
          (_from, str, chars) => [str, chars],
          expectIdentifier('from'),
          primaryExpr,
          optional(seq($2, symbol(','), primaryExpr))
        ),
        oneOf(
          attempt(
            seq(
              (chrs, _from, str) => [str, chrs],
              primaryExpr,
              expectIdentifier('from'),
              primaryExpr
            )
          ),
          seq(
            (str, chrs) => [str, chrs],
            primaryExpr,
            optional(seq($2, symbol(','), primaryExpr))
          )
        )
      )
    )
  )

  return oneOf(
    overlayFunction,
    positionFunction,
    substringFunction,
    trimFunction
  )
}
