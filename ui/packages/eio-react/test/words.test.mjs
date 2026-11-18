// Eidos Form Controls (agreed 8 Nov), the rules a component test can see:
// 1 · Words come with it: Checkbox and Radio are one label holding the real input and the words, and
//     the row is at least the 44 px target, so clicking the words works too. (Their words being
//     required is checked by the type checker: test/words.check.tsx.)
// 4 · Radios come with their question: Choices is a real fieldset whose legend is the question.
// 2 · On is lime, with a mark: the checked box takes the primary action color and shows its tick or dot.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// A file in its component's folder, named as the file is (Choice.module.css is in Choice/).
const read = f => readFileSync(new URL(`../src/${f.split('.')[0]}/${f}`, import.meta.url), 'utf8')
const css = read('Choice.module.css').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = sel => css.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[2] ?? ''

for (const name of ['Checkbox', 'Radio']) {
  const src = read(`${name}.tsx`)
  test(`${name}: its words are required`, () => {
    assert.match(src, /\n\s*children: ReactNode\n/, 'children must not be optional')
  })
  test(`${name}: one label holds the input and the words`, () => {
    const body = src.slice(src.indexOf('return ('))
    assert.match(body, /^return \(\s*<label\b/, 'the outermost element is a label')
    assert.match(body, /<input type="(checkbox|radio)"/, 'the real input is inside it')
    assert.match(body, /\{children\}/, 'and so are the words')
    assert.match(body, /<\/label>\s*\)/, 'the label closes last')
  })
}

test('the whole row is at least the minimum target', () => {
  assert.match(rule('.choice'), /min-height:\s*var\(--eio-size-target-minimum\)/)
  assert.match(rule('.choice'), /cursor:\s*pointer/)
})

test('on is lime, with a mark', () => {
  assert.match(rule('.input:checked'), /background:\s*var\(--eio-color-action-primary\)/)
  assert.match(rule('.input:checked ~ .mark'), /visibility:\s*visible/)
  assert.match(read('Checkbox.tsx'), /<Icon name="tick"/, 'a ticked box shows the tick')
  assert.match(read('Radio.tsx'), /styles\.dot/, 'a chosen radio shows the dot')
  assert.doesNotMatch(rule('.input:checked'), /border/, 'it keeps its border')
})

test('Choices is a fieldset whose legend is the question', () => {
  const src = read('Choices.tsx')
  assert.match(src, /<fieldset\b[\s\S]*<legend\b[\s\S]*\{legend\}<\/legend>/)
})
