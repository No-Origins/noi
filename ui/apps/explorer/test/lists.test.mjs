// Review tells a changed list by what was added, taken away and changed (18 Nov 2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asList, listChange, listChanged, listSummary } from '../lib/lists.ts'

test('states: three added at the end, nine as they were', () => {
  const before = ['primary', 'secondary', 'plain', 'sizes', 'icon', 'wide', 'hovered', 'focused', 'disabled']
  const after = [...before, 'inside link', 'action link', 'outside link']
  const c = listChange(before, after)
  assert.deepEqual(c.added, ['inside link', 'action link', 'outside link'])
  assert.deepEqual(c.removed, [])
  assert.equal(c.kept, 9)
  assert.equal(listSummary(c), '3 added · 9 as they were')
})

test('files: a new file, a changed fingerprint, one taken away', () => {
  const f = (path, sha256) => ({ path, sha256 })
  const c = listChange([f('src/Button.tsx', 'a'), f('src/Button.module.css', 'b'), f('src/Old.ts', 'c')],
    [f('src/Button.tsx', 'z'), f('src/Button.module.css', 'b'), f('src/links.ts', 'd')])
  assert.deepEqual(c.added, ['src/links.ts'])
  assert.deepEqual(c.removed, ['src/Old.ts'])
  assert.deepEqual(c.changed, ['src/Button.tsx'])
  assert.equal(c.kept, 1)
  assert.equal(listSummary(c), '1 added · 1 taken away · 1 changed · 1 as it was')
})

test('the same items in a new order is still a change, and says so', () => {
  const c = listChange(['a', 'b'], ['b', 'a'])
  assert.ok(listChanged(c))
  assert.equal(listSummary(c), 'the same, in a new order')
  assert.ok(!listChanged(listChange(['a'], ['a'])))
})

test('not a list on either side: nothing to tell', () => {
  assert.equal(listChange('a', ['a']), null)
  assert.equal(listChange(undefined, []), null)
})

test('states by key: added, taken away and reworded, by group and key', () => {
  const before = asList('component', 'states', { variant: { primary: 'main', plain: 'the rest' }, size: { large: '48 px' } })
  const after = asList('component', 'states', { variant: { primary: 'for the one main action', plain: 'the rest', secondary: 'other' } })
  const c = listChange(before, after)
  assert.deepEqual(c.added, ['variant · secondary'])
  assert.deepEqual(c.removed, ['size · large'])
  assert.deepEqual(c.changed, ['variant · primary'], 'the same key, new words')
  assert.equal(c.kept, 1)
  assert.deepEqual(asList('component', 'reads', ['a']), ['a'], 'other fields stay as they are')
})

test('the move: a list of sentences becomes states by key', () => {
  const c = listChange(asList('component', 'states', ['primary, for the main action']), asList('component', 'states', { variant: { primary: 'for the main action' } }))
  assert.deepEqual(c.added, ['variant · primary'])
  assert.deepEqual(c.removed, ['primary, for the main action'])
})


// Found by the review before commit (18 Nov): a summary that could say "nothing changed".
test('two items with one key: shown whole, never "the same, in a new order"', () => {
  assert.equal(listChange([{ path: 'x', v: 1 }, { path: 'x', v: 2 }], [{ path: 'x', v: 9 }, { path: 'x', v: 2 }]), null)
  assert.equal(listChange(['a'], ['a', 'a']), null)
})

test('a changed item that is neither a fingerprint nor words: shown whole', () => {
  assert.equal(listChange([{ path: 'x', note: 'a' }], [{ path: 'x', note: 'b' }]), null)
  assert.equal(listChange([{ path: 'x', sha256: 'a' }], [{ path: 'x', sha256: 'b', extra: 1 }]), null)
  assert.deepEqual(listChange([{ path: 'x', sha256: 'a' }], [{ path: 'x', sha256: 'b' }]).changed, ['x'])
})

test('states read as a list only for a component, and only as groups of words', () => {
  const states = { variant: { primary: 'main' } }
  assert.equal(asList('token', 'states', states), states, 'another kind keeps its states as they are')
  assert.deepEqual(asList('component', 'states', { a: 1 }), { a: 1 }, 'numbers are not words')
  assert.deepEqual(asList('component', 'states', { a: 'words' }), { a: 'words' }, 'a string is not a group')
  assert.deepEqual(asList('component', 'states', states), [{ path: 'variant · primary', words: 'main' }])
})
