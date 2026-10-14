import { describe, expect, test } from 'bun:test'
import { createObjectScanner } from './json-stream'

function scanAll(chunks: string[]) {
  const scanner = createObjectScanner()
  const found = chunks.flatMap((chunk) => scanner.feed(chunk))
  return { found, partial: scanner.hasPartial() }
}

describe('createObjectScanner', () => {
  test('reads JSON Lines split across chunks', () => {
    const text = '{"kind":"meta","title":"A"}\n{"kind":"item","title":"B"}\n'
    const chunks = text.match(/.{1,5}/gs)!
    const { found, partial } = scanAll(chunks)
    expect(found.map((s) => JSON.parse(s).title)).toEqual(['A', 'B'])
    expect(partial).toBe(false)
  })

  test('ignores code fences, commentary and array brackets', () => {
    const text = 'Sure! Here you go:\n```json\n[{"a":1},\r\n{"a":2}]\n```\nDone.'
    expect(scanAll([text]).found.map((s) => JSON.parse(s).a)).toEqual([1, 2])
  })

  test('handles pretty-printed objects with nested objects and arrays', () => {
    const text = '{\n  "due": {"date": "2026-10-16"},\n  "subtasks": ["a", "b"]\n}'
    const { found } = scanAll([text])
    expect(found).toHaveLength(1)
    expect(JSON.parse(found[0]!).subtasks).toEqual(['a', 'b'])
  })

  test('braces and quotes inside strings do not confuse it', () => {
    const text = '{"title":"Fix {weird} \\"quoted\\" thing }","x":"\\\\"}{"title":"next"}'
    const { found } = scanAll(text.split(''))
    expect(found.map((s) => JSON.parse(s).title)).toEqual(['Fix {weird} "quoted" thing }', 'next'])
  })

  test('reports an unfinished object at the end', () => {
    const { found, partial } = scanAll(['{"a":1}\n{"b":'])
    expect(found).toHaveLength(1)
    expect(partial).toBe(true)
  })

  test('keeps non-ASCII text intact', () => {
    const { found } = scanAll(['{"quote":"kal doodh lena hai 🥛 — café"}'])
    expect(JSON.parse(found[0]!).quote).toBe('kal doodh lena hai 🥛 — café')
  })
})
