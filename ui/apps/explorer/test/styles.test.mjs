// The Explorer's own styles follow the Eidos rules the components do: no window widths of their
// own (Responsive Explorer, rule 3), no durations or curves of their own (Eidos Motion, rule 8),
// controls placed but never drawn (Eidos Form Controls, rule 7), and every --eio-* variable they
// read exists in @noi/eio-tokens.
// Widened 18 Nov 2026 at the user's word ("Yes, widen them"), so an agent's page cannot slip past
// Eidos: no colours and no sizes of their own (the components' rules 1 and 2), in style files and in
// styles written in the code; and no hand-made controls in the code, buttons included. Then, once Button
// could be a link and the Chip was approved (Links Drawn by Eidos, decision 4): no page draws a button
// or a chip of its own.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = fileURLToPath(new URL('../app/', import.meta.url))
const TOKENS = readFileSync(new URL('../../../packages/eio-tokens/tokens.css', import.meta.url), 'utf8')
const defined = new Set([...TOKENS.matchAll(/^\s*(--eio-[a-z0-9-]+):/gm)].map(m => m[1]))
const LIB = fileURLToPath(new URL('../lib/', import.meta.url))
const files = readdirSync(APP, { recursive: true }).map(f => relative(APP, join(APP, f)))
const sheets = files
  .filter(f => f.endsWith('.css'))
  .map(f => ({ file: f, css: readFileSync(join(APP, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))
// Comments are left out: block comments, JSX comments and lines that are only a comment. A comment
// after code on the same line stays, since "//" can also be words on a page (<p>1 // 2</p>): a control
// named in such a comment fails loudly, never passes quietly.
const uncommented = text => text.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm, '')
const code = [
  ...files.filter(f => f.endsWith('.tsx')).map(f => join(APP, f)),
  ...readdirSync(LIB).filter(f => /\.tsx?$/.test(f)).map(f => join(LIB, f)),
].map(path => ({ file: relative(join(APP, '..'), path), tsx: uncommented(readFileSync(path, 'utf8')) }))

// Only the values: property names and selectors never break the rules. A value ends at ";" or, for
// the last one in a rule, at "}". A token's name (var(--eio-…)) is not a value of its own.
const values = css => [...css.matchAll(/:\s*([^;{}]+)[;}]/g)].map(m => m[1].replace(/var\(--[a-z0-9-]+\)/gi, ''))
// Every colour CSS names (CSS Color 4): a page's colour comes from a role, never a name.
const COLOUR_NAMES = `
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
  burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan
  darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid
  darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
  deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro
  ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow
  lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
  mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise
  mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab
  orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru
  pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
  seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan
  teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
`.trim().split(/\s+/)
const NAMED = new RegExp(`\\b(${COLOUR_NAMES.join('|')})\\b`, 'i')
const COLOUR_FN = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i
// Every CSS length unit, in any case.
const LENGTH = /-?\d*\.?\d+(px|rem|em|rex|ex|rch|ch|cap|ic|rlh|lh|vmin|vmax|vh|vw|vi|vb|dvh|svh|lvh|dvw|svw|lvw|dvmin|dvmax|svmin|svmax|lvmin|lvmax|cqw|cqh|cqi|cqb|cqmin|cqmax|pt|pc|cm|mm|q|in)\b/gi
// The whole window is not a size of the app's own: a page may fill it. Nor is one line of Eidos's own
// text (1lh), which follows the text style.
const WHOLE_WINDOW = /^100(vh|dvh|svh|lvh|vw|dvw|svw|lvw)$/i
const ONE_LINE = /^1r?lh$/i

/** Each style object written in the code (`style={{ … }}`), as text. */
function styleObjects(tsx) {
  const out = []
  for (const m of tsx.matchAll(/style=\{\{/g)) {
    let depth = 2, i = m.index + m[0].length
    for (; i < tsx.length && depth > 0; i++) depth += tsx[i] === '{' ? 1 : tsx[i] === '}' ? -1 : 0
    out.push(tsx.slice(m.index + m[0].length, i - 2))
  }
  return out
}

test('there are styles to check', () => {
  assert.ok(sheets.length >= 5, `found ${sheets.length} style sheets`)
  assert.ok(code.length >= 20, `found ${code.length} code files`)
})

for (const { file, css } of sheets) {
  test(`${file}: colours come only from Eidos's roles`, () => {
    for (const v of values(css)) {
      assert.doesNotMatch(v, /#[0-9a-f]{3,8}\b/i, `a colour of its own in "${v}": use an --eio-color-* role`)
      assert.doesNotMatch(v, COLOUR_FN, `a colour of its own in "${v}": use an --eio-color-* role`)
      assert.doesNotMatch(v, NAMED, `a named colour in "${v}": use an --eio-color-* role`)
    }
  })
  test(`${file}: sizes come only from Eidos`, () => {
    for (const v of values(css)) {
      for (const [n] of v.matchAll(LENGTH)) {
        assert.ok(parseFloat(n) === 0 || WHOLE_WINDOW.test(n) || ONE_LINE.test(n), `a size of its own, ${n}, in "${v}": use an --eio-* size, space, corner or border`)
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
  test(`${file}: places controls, never draws them`, () => {
    for (const [, selector] of css.matchAll(/([^{};]+)\{/g)) {
      if (selector.trim().startsWith('@')) continue
      assert.doesNotMatch(selector, /(^|[\s,>+~(])(input|select|textarea|summary|details|button|dialog|fieldset|legend)(?![\w-])/, `"${selector.trim()}" draws a control: use Button, Checkbox, Radio, Choices, Select, TextArea, Disclosure or Drawer from @noi/eio-react`)
      assert.doesNotMatch(selector, /\[type=["']?(checkbox|radio)/, `"${selector.trim()}" draws a control: use Checkbox or Radio from @noi/eio-react`)
    }
    assert.doesNotMatch(css, /accent-color\s*:/, 'accent-color: Eidos draws checkboxes and radios, and Safari ignores it')
  })
  // Links Drawn by Eidos (agreed 18 Nov), decision 4: the button's corners belong to Eidos's Button and
  // Chip. A page style that reads them is drawing a button or a chip of its own.
  test(`${file}: draws no button or chip of its own`, () => {
    assert.doesNotMatch(css, /--eio-radius-button\b/, 'the button’s corners: use Button (with an address for a link) or Chip from @noi/eio-react')
  })
  test(`${file}: every token it reads exists`, () => {
    for (const [, name] of css.matchAll(/var\((--eio-[a-z0-9-]+)/g)) {
      assert.ok(defined.has(name), `${name} is not in @noi/eio-tokens`)
      assert.doesNotMatch(name, /^--eio-color-palette-/, 'the app reads roles, never palette colors')
    }
  })
}

for (const { file, tsx } of code) {
  test(`${file}: uses Eidos's controls, never its own`, () => {
    const own = [...tsx.matchAll(/<(button|select|textarea|details|summary|dialog|fieldset)\b/g)].map(m => m[1])
    assert.deepEqual(own, [], `a hand-made ${own[0]}: use Button, Select, TextArea, Disclosure, Drawer or Choices from @noi/eio-react`)
    assert.doesNotMatch(tsx, /\brole=["'{]+(button|checkbox|radio|switch|combobox|listbox|tab)\b/, 'a hand-made control by its role: use Button, Checkbox, Radio, Select or Tabs from @noi/eio-react')
    assert.doesNotMatch(tsx, /\bcreateElement\(\s*['"`](button|input|select|textarea|details|summary|dialog|fieldset)\b/, 'a hand-made control made with createElement: use @noi/eio-react')
    // A hidden field carries data in a form; it draws nothing. A spread could change its type.
    for (const [input] of tsx.matchAll(/<input\b[^>]*>/g)) {
      assert.match(input, /type="hidden"/, `a hand-made input, ${input.slice(0, 60)}: use Field, Checkbox or Radio from @noi/eio-react`)
      assert.doesNotMatch(input, /\s\{\s*\.\.\./, `a hidden input with a spread, ${input.slice(0, 60)}: name its fields`)
    }
  })
  test(`${file}: styles in the code use Eidos, or a meron's own value`, () => {
    for (const style of styleObjects(tsx)) {
      assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i, `a colour of its own in style={{${style}}}`)
      assert.doesNotMatch(style, COLOUR_FN, `a colour of its own in style={{${style}}}`)
      for (const [, text] of style.matchAll(/['"`]([^'"`]*)['"`]/g)) {
        assert.doesNotMatch(text.replace(/var\(--[a-z0-9-]+\)/gi, ''), NAMED, `a named colour in style={{${style}}}`)
      }
      assert.doesNotMatch(style, /--eio-radius-button\b/, `the button’s corners in style={{${style}}}: use Button or Chip from @noi/eio-react`)
      for (const [n] of style.matchAll(LENGTH)) assert.ok(parseFloat(n) === 0, `a size of its own, ${n}, in style={{${style}}}`)
      // A number written in the style is a size or a value of its own. Allowed: 0, an index ([2]),
      // and × 100 to turn a share into a percentage.
      for (const m of style.matchAll(/(?<![\w.$-])\d+(\.\d+)?(?![\w.])/g)) {
        const before = style.slice(0, m.index).trimEnd()
        const ok = Number(m[0]) === 0 || before.endsWith('[') || (m[0] === '100' && before.endsWith('*'))
        assert.ok(ok, `a number of its own, ${m[0]}, in style={{${style}}}: take it from Eidos or from the meron`)
      }
    }
  })
}
