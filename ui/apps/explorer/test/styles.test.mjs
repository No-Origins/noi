// The Explorer's own styles follow the Eidos rules the components do: no window widths of their
// own (Responsive Explorer, rule 3), no durations or curves of their own (Eidos Motion, rule 8),
// controls placed but never drawn (Eidos Form Controls, rule 7), and every --eio-* variable they
// read exists in @noi/eio-tokens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = fileURLToPath(new URL('../app/', import.meta.url))
const TOKENS = readFileSync(new URL('../../../packages/eio-tokens/tokens.css', import.meta.url), 'utf8')
const defined = new Set([...TOKENS.matchAll(/^\s*(--eio-[a-z0-9-]+):/gm)].map(m => m[1]))
const sheets = readdirSync(APP, { recursive: true })
  .filter(f => f.endsWith('.css'))
  .map(f => ({ file: relative(APP, join(APP, f)), css: readFileSync(join(APP, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))

test('there are styles to check', () => {
  assert.ok(sheets.length >= 5, `found ${sheets.length} style sheets`)
})

for (const { file, css } of sheets) {
  test(`${file}: no window widths of its own`, () => {
    assert.doesNotMatch(css, /@media[^{]*\b(width|height|min-width|max-width)\b/, 'a width query: read --eio-window-* instead')
    assert.doesNotMatch(css, /@container\b/, 'a container query: read --eio-window-* instead')
  })
  test(`${file}: motion only from Eidos`, () => {
    for (const v of [...css.matchAll(/:\s*([^;{}]+);/g)].map(m => m[1])) {
      assert.doesNotMatch(v, /(^|[\s,(])-?\d*\.?\d+m?s\b/, `a duration of its own in "${v}": use --eio-motion-duration-*`)
      assert.doesNotMatch(v, /\b(cubic-bezier|steps)\(|\b(ease|ease-in|ease-out|ease-in-out|step-start|step-end)\b|\blinear\b(?!-)/, `a curve of its own in "${v}": use --eio-motion-easing-standard`)
    }
  })
  test(`${file}: places controls, never draws them`, () => {
    for (const [, selector] of css.matchAll(/([^{};]+)\{/g)) {
      if (selector.trim().startsWith('@')) continue
      assert.doesNotMatch(selector, /(^|[\s,>+~(])(input|select|textarea|summary)(?![\w-])/, `"${selector.trim()}" draws a control: use Checkbox, Radio, Select, TextArea or Disclosure from @noi/eio-react`)
      assert.doesNotMatch(selector, /\[type=["']?(checkbox|radio)/, `"${selector.trim()}" draws a control: use Checkbox or Radio from @noi/eio-react`)
    }
    assert.doesNotMatch(css, /accent-color\s*:/, 'accent-color: Eidos draws checkboxes and radios, and Safari ignores it')
  })
  test(`${file}: every token it reads exists`, () => {
    for (const [, name] of css.matchAll(/var\((--eio-[a-z0-9-]+)/g)) {
      assert.ok(defined.has(name), `${name} is not in @noi/eio-tokens`)
      assert.doesNotMatch(name, /^--eio-color-palette-/, 'the app reads roles, never palette colors')
    }
  })
}
