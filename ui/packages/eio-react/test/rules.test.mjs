// Enforces the agreed component rules on every component's styles:
// 1 · Roles only: no color values; colors come from --eio-color-* roles (a swatch's color is content, set in code).
// 2 · Tokens only: no raw lengths besides zero; sizes, spaces, corners and borders come from --eio-* tokens.
// 3 · Windows from Eidos: no width queries; layout follows the window through the --eio-window-* variables.
// 4 · Motion from Eidos: no durations or curves of their own; only --eio-motion-* (agreed 6 Nov).
// And every --eio-* variable a component reads exists in @noi/eio-tokens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const TOKENS = readFileSync(new URL('../../eio-tokens/tokens.css', import.meta.url), 'utf8')
const defined = new Set([...TOKENS.matchAll(/^\s*(--eio-[a-z0-9-]+):/gm)].map(m => m[1]))
const sheets = readdirSync(SRC).filter(f => f.endsWith('.module.css')).map(f => ({
  file: f,
  css: readFileSync(join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
}))
// Only the values: property names and selectors never break the rules.
const values = css => [...css.matchAll(/:\s*([^;{}]+);/g)].map(m => m[1])
const NAMED = /\b(white|black|red|green|blue|yellow|orange|purple|violet|pink|gray|grey|lime|navy|teal|silver|gold)\b/i

test('there are component styles to check', () => {
  assert.ok(sheets.length >= 8, `found ${sheets.length} style sheets`)
  assert.ok(defined.size > 50, 'tokens.css defines the --eio-* variables')
})

for (const { file, css } of sheets) {
  test(`${file}: colors come only from roles`, () => {
    for (const v of values(css)) {
      assert.doesNotMatch(v, /#[0-9a-f]{3,8}\b/i, `color value "${v}"`)
      assert.doesNotMatch(v, /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i, `color function "${v}"`)
      assert.doesNotMatch(v, NAMED, `named color "${v}"`)
    }
  })
  test(`${file}: lengths come only from tokens`, () => {
    for (const v of values(css)) {
      for (const [n] of v.matchAll(/-?\d*\.?\d+(px|rem|em|vh|vw|pt)\b/g)) {
        assert.ok(parseFloat(n) === 0, `raw length ${n} in "${v}"`)
      }
    }
  })
  test(`${file}: no window widths of its own`, () => {
    assert.doesNotMatch(css, /@media[^{]*\b(width|height|min-width|max-width)\b/, 'a width query: read --eio-window-* instead')
    assert.doesNotMatch(css, /@container\b/, 'a container query: read --eio-window-* instead')
  })
  test(`${file}: motion only from Eidos`, () => {
    for (const v of values(css)) {
      assert.doesNotMatch(v, /(^|[\s,(])-?\d*\.?\d+m?s\b/, `a duration of its own in "${v}": use --eio-motion-duration-*`)
      assert.doesNotMatch(v, /\b(cubic-bezier|steps)\(|\b(ease|ease-in|ease-out|ease-in-out|step-start|step-end)\b|\blinear\b(?!-)/, `a curve of its own in "${v}": use --eio-motion-easing-standard`)
    }
  })
  test(`${file}: every token it reads exists`, () => {
    for (const [, name] of css.matchAll(/var\((--eio-[a-z0-9-]+)/g)) {
      assert.ok(defined.has(name), `${name} is not in @noi/eio-tokens`)
      assert.doesNotMatch(name, /^--eio-color-palette-/, 'components read roles, never palette colors')
    }
  })
}
