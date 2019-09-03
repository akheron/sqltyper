import { parse, ParseError } from '../src/parser'

describe('select', () => {
  it('Minimal', () => {
    const sql = `
SELECT 1
`
    expect(parse(sql)).toEqual({
      selectList: [{ expression: { kind: 'Literal', value: '1' }, as: null }],
      from: null,
      orderBy: [],
    })
  })
  it('AS', () => {
    const sql = `
SELECT 1 one, 2 AS two
`
    expect(parse(sql)).toEqual({
      selectList: [
        { expression: { kind: 'Literal', value: '1' }, as: 'one' },
        { expression: { kind: 'Literal', value: '2' }, as: 'two' },
      ],
      from: null,
      orderBy: [],
    })
  })
  it('FROM/JOIN', () => {
    const sql = `
SELECT
    f.bar foo_bar,
    g.baz AS goo_baz
FROM foo f
INNER JOIN goo AS g ON g.id = f.goo_id
`
    expect(parse(sql)).toEqual({
      selectList: [
        { expression: { kind: 'Field', chain: ['f', 'bar'] }, as: 'foo_bar' },
        { expression: { kind: 'Field', chain: ['g', 'baz'] }, as: 'goo_baz' },
      ],
      from: {
        table: 'foo',
        as: 'f',
        joins: [
          {
            kind: 'JOIN',
            joinType: 'INNER',
            table: 'goo',
            as: 'g',
            condition: {
              kind: 'Op',
              lhs: { kind: 'Field', chain: ['g', 'id'] },
              op: '=',
              rhs: { kind: 'Field', chain: ['f', 'goo_id'] },
            },
          },
        ],
      },
      orderBy: [],
    })
  })
  it('ORDER BY', () => {
    const sql = `
SELECT foo
FROM tbl t
ORDER BY t.foo, bar ASC, baz DESC, quux USING <, qyzzy DESC NULLS LAST
`
    expect(parse(sql)).toEqual({
      selectList: [{ expression: { kind: 'Field', chain: ['foo'] }, as: null }],
      from: { table: 'tbl', as: 't', joins: [] },
      orderBy: [
        {
          expression: { kind: 'Field', chain: ['t', 'foo'] },
          order: null,
          nulls: null,
        },
        {
          expression: { kind: 'Field', chain: ['bar'] },
          order: 'ASC',
          nulls: null,
        },
        {
          expression: { kind: 'Field', chain: ['baz'] },
          order: 'DESC',
          nulls: null,
        },
        {
          expression: { kind: 'Field', chain: ['quux'] },
          order: '<',
          nulls: null,
        },
        {
          expression: { kind: 'Field', chain: ['qyzzy'] },
          order: 'DESC',
          nulls: 'LAST',
        },
      ],
    })
  })
})

function prettyPrint(x: any) {
  console.log(
    require('util').inspect(x, { showHidden: false, colors: true, depth: null })
  )
}

//console.log((parse(sql) as ParseError).explain())
//prettyPrint(parse(sql))
