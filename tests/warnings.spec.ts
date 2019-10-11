import * as Monoid from 'fp-ts/lib/Monoid'
import * as Option from 'fp-ts/lib/Option'
import { identity } from 'fp-ts/lib/function'
import { pipe } from 'fp-ts/lib/pipeable'
import * as Warn from '../src/warnings'

describe('Warn', () => {
  it('ok', () => {
    expect(Warn.ok('foo')).toEqual({ payload: 'foo', warnings: [] })
  })

  it('warn', () => {
    const ok = Warn.ok('foo')
    const warn1 = Warn.warn('summary1', 'desc1')(ok)
    const warn2 = Warn.warn('summary2', 'desc2')(warn1)

    expect(warn1).toEqual({
      payload: 'foo',
      warnings: [{ summary: 'summary1', description: 'desc1' }],
    })

    expect(warn2).toEqual({
      payload: 'foo',
      warnings: [
        { summary: 'summary1', description: 'desc1' },
        { summary: 'summary2', description: 'desc2' },
      ],
    })
  })

  describe('typeclass instances', () => {
    const warn = pipe(
      Warn.ok('foo'),
      Warn.warn('summary1', 'desc1'),
      Warn.warn('summary2', 'desc2')
    )
    const originalWarnings = warn.warnings

    it('map', () => {
      expect(Warn.warn_.map(warn, x => x + 'bar')).toEqual({
        payload: 'foobar',
        warnings: originalWarnings,
      })
    })

    it('ap', () => {
      const fw = Warn.ok((x: string) => x + 'bar')
      expect(Warn.warn_.ap(fw, warn)).toEqual({
        payload: 'foobar',
        warnings: originalWarnings,
      })
    })

    it('of', () => {
      expect(Warn.warn_.of('foo')).toEqual({ payload: 'foo', warnings: [] })
    })

    it('reduce', () => {
      expect(Warn.warn_.reduce(warn, 'bar', (acc, p) => p + acc)).toEqual(
        'foobar'
      )
    })

    it('reduceRight', () => {
      expect(Warn.warn_.reduceRight(warn, 'bar', (p, acc) => p + acc)).toEqual(
        'foobar'
      )
    })

    it('foldMap', () => {
      expect(Warn.warn_.foldMap(Monoid.monoidString)(warn, identity)).toEqual(
        'foo'
      )
    })

    it('traverse', () => {
      const warnOpt = pipe(
        Warn.ok(Option.some('foo')),
        Warn.warn('summary1', 'desc1'),
        Warn.warn('summary2', 'desc2')
      )
      const originalWarnings = warnOpt.warnings

      expect(Warn.warn_.traverse(Option.option)(warnOpt, identity)).toEqual(
        Option.some({ payload: 'foo', warnings: originalWarnings })
      )
    })

    it('sequence', () => {
      const warnOpt = pipe(
        Warn.ok(Option.some('foo')),
        Warn.warn('summary1', 'desc1'),
        Warn.warn('summary2', 'desc2')
      )
      const originalWarnings = warnOpt.warnings

      expect(Warn.warn_.sequence(Option.option)(warnOpt)).toEqual(
        Option.some({ payload: 'foo', warnings: originalWarnings })
      )
    })
  })
})
