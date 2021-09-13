import * as Monoid from 'fp-ts/lib/Monoid'
import * as Option from 'fp-ts/lib/Option'
import { identity, pipe } from 'fp-ts/lib/function'
import * as Warn from '../src/Warn'

describe('Warn', () => {
  it('ok', () => {
    expect(Warn.of('foo')).toEqual({ payload: 'foo', warnings: [] })
  })

  it('warningWarning', () => {
    const warn = Warn.warning('foo', 'summary1', 'desc1')
    expect(warn).toEqual({
      payload: 'foo',
      warnings: [{ summary: 'summary1', description: 'desc1' }],
    })
  })

  it('addWarning', () => {
    const warn = pipe(
      Warn.of('foo'),
      Warn.addWarning('summary1', 'desc1'),
      Warn.addWarning('summary2', 'desc2')
    )
    expect(warn).toEqual({
      payload: 'foo',
      warnings: [
        { summary: 'summary1', description: 'desc1' },
        { summary: 'summary2', description: 'desc2' },
      ],
    })
  })

  describe('typeclass instances', () => {
    const warn = pipe(
      Warn.of('foo'),
      Warn.addWarning('summary1', 'desc1'),
      Warn.addWarning('summary2', 'desc2')
    )
    const originalWarnings = warn.warnings

    it('map', () => {
      expect(Warn.warn_.map(warn, (x) => x + 'bar')).toEqual({
        payload: 'foobar',
        warnings: originalWarnings,
      })
    })

    it('ap', () => {
      const fw = pipe(
        Warn.of((x: string) => x + 'bar'),
        Warn.addWarning('summary0', 'desc0')
      )
      expect(Warn.warn_.ap(fw, warn)).toEqual({
        payload: 'foobar',
        warnings: [
          { summary: 'summary0', description: 'desc0' },
          ...originalWarnings,
        ],
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
        Warn.of(Option.some('foo')),
        Warn.addWarning('summary1', 'desc1'),
        Warn.addWarning('summary2', 'desc2')
      )
      const originalWarnings = warnOpt.warnings

      expect(Warn.warn_.traverse(Option.option)(warnOpt, identity)).toEqual(
        Option.some({ payload: 'foo', warnings: originalWarnings })
      )
    })

    it('sequence', () => {
      const warnOpt = pipe(
        Warn.of(Option.some('foo')),
        Warn.addWarning('summary1', 'desc1'),
        Warn.addWarning('summary2', 'desc2')
      )
      const originalWarnings = warnOpt.warnings

      expect(Warn.warn_.sequence(Option.option)(warnOpt)).toEqual(
        Option.some({ payload: 'foo', warnings: originalWarnings })
      )
    })
  })
})
