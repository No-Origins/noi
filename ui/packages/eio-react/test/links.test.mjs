// Links Drawn by Eidos (agreed 18 Nov 2026), the rules a component test can see:
// 1 · Button can be a link. Inside No Origins it stays a button, with the arrow after its words or the
//     action's icon instead; outside, it is words with a dashed underline and the arrow, in a new tab.
// 2 · The Chip: a link to one thing, with its small picture, its name (required) and a note. Given
//     another site's address, it keeps the outside sign: the arrow, and a new tab.
// Where an address leads is read the way a browser reads it, and the components are drawn for real.
// The Toggle (agreed 22 Nov 2026) is drawn here too: a real checkbox told to be a switch.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createElement as h } from 'react'
import { insideNoOrigins } from '../src/links/links.ts'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const read = f => readFileSync(join(PKG, 'src', f), 'utf8')

// Addresses that say one thing and lead to another site, each as a browser reads it: a backslash is a
// slash, tabs and newlines are dropped, leading control characters are dropped, and a name and password
// before @ are not the site.
const LOOK_INSIDE = [
  '/\\evil.example', '\\\\evil.example', '\\/evil.example', 'https://evil.example\\.no-origins.com',
  'https://no-origins.com:x@evil.example', 'https://no-origins.com@evil.example', 'https://a:b@evil.example',
  '/\t/evil.example', '/\n/evil.example', 'h\nttps://evil.example', '\u0001//evil.example',
  'java\tscript:alert(1)', '\u0000javascript:alert(1)', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)',
  'data:text/html,hello', 'https://no-origins.com./', 'https://%zz',
]

test('an address inside No Origins: a path, or a name of No Origins', () => {
  for (const inside of ['/review', '/merons/noi/eio', '#top', '?change', 'review', './here', '  /review',
    'https://no-origins.com/', 'https://gov.no-origins.com/account', 'http://mero.no-origins.localhost:3000/review',
    '//eidos.no-origins.com/', 'HTTPS://Mero.No-Origins.com/x', 'https://gov.no-origins.com:8443/x']) {
    assert.equal(insideNoOrigins(inside), true, JSON.stringify(inside))
  }
})

test('an address outside No Origins: any other site, or another kind of address', () => {
  for (const outside of ['https://github.com/No-Origins/noi', 'http://localhost:3000/', 'https://no-origins.com.evil.example/',
    'https://not-no-origins.com/', 'https://no-origins.co/', 'mailto:someone@example.com', 'tel:+100', '//example.com/']) {
    assert.equal(insideNoOrigins(outside), false, JSON.stringify(outside))
  }
})

test('an address that only looks inside is outside: where it leads is read as a browser reads it', () => {
  for (const address of LOOK_INSIDE) assert.equal(insideNoOrigins(address), false, JSON.stringify(address))
})

// The components drawn for real: TypeScript turns the package into JavaScript beside its own React (in
// node_modules/.cache), each style file stands in as its class names, and draw() calls the components
// down to the tags a browser is given.
let built, Button, Chip, Icon, Toggle
before(async () => {
  mkdirSync(join(PKG, 'node_modules/.cache'), { recursive: true })
  built = mkdtempSync(join(PKG, 'node_modules/.cache/links-test-'))
  execFileSync(process.execPath, [join(PKG, 'node_modules/typescript/bin/tsc'), '-p', PKG,
    '--noEmit', 'false', '--noCheck', '--outDir', built, '--rootDir', PKG])
  for (const f of readdirSync(join(built, 'src'), { recursive: true }).filter(f => f.endsWith('.js'))) {
    const p = join(built, 'src', f)
    writeFileSync(p, readFileSync(p, 'utf8')
      .replace(/^import (\w+) from '\.\/[\w.-]+\.css';$/gm, 'const $1 = new Proxy({}, { get: (_, k) => k });')
      .replace(/from '(\.\.?\/[\w./-]+?)'/g, (m, s) => (/\.js$/.test(s) ? m : `from '${s}.js'`)))
  }
  ;({ Button } = await import(pathToFileURL(join(built, 'src/Button/Button.js'))))
  ;({ Chip } = await import(pathToFileURL(join(built, 'src/Chip/Chip.js'))))
  ;({ Icon } = await import(pathToFileURL(join(built, 'src/Icon/Icon.js'))))
  ;({ Toggle } = await import(pathToFileURL(join(built, 'src/Toggle/Toggle.js'))))
})
after(() => built && rmSync(built, { recursive: true, force: true }))

const FRAGMENT = Symbol.for('react.fragment')
/** What a component draws, down to tags: { tag, props, children }, or text. */
function draw(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (Array.isArray(node)) return node.flatMap(draw)
  if (typeof node !== 'object') return [String(node)]
  if (typeof node.type === 'function') return draw(node.type(node.props))
  if (node.type === FRAGMENT) return draw(node.props.children)
  const { children, ...props } = node.props
  return [{ tag: node.type, props, children: draw(children) }]
}
const one = node => draw(node)[0]
const classes = d => (d.props.className ?? '').split(' ')
const svgs = d => (typeof d === 'string' ? [] : d.tag === 'svg' ? [d] : d.children.flatMap(svgs))
const text = d => (typeof d === 'string' ? d : d.tag === 'svg' ? '' : d.children.map(text).join(''))
/** Which icon a drawn svg is, by its lines. */
const iconOf = svg => {
  const lines = JSON.stringify(svg.children)
  return ['up-right', 'pen', 'arrow'].find(name => JSON.stringify(one(h(Icon, { name })).children) === lines)
}

test('the arrow points up and to the right', () => {
  const d = one(h(Icon, { name: 'up-right' }))
  assert.equal(d.children[0].props.d, 'M6 14l8-8M8 6h6v6')
})

test('Button without an address is a real button', () => {
  const d = one(h(Button, { children: 'Save' }))
  assert.equal(d.tag, 'button')
  assert.equal(d.props.type, 'button')
})

test('Button inside No Origins: a button with the arrow after its words, in this tab', () => {
  const d = one(h(Button, { href: '/review', children: 'Review' }))
  assert.equal(d.tag, 'a')
  assert.equal(d.props.href, '/review')
  assert.ok(classes(d).includes('button') && classes(d).includes('link'), 'drawn as a button')
  assert.ok(!classes(d).includes('outside'))
  assert.equal(d.props.target, undefined)
  assert.equal(d.props.rel, undefined)
  assert.equal(text(d), 'Review')
  const arrows = svgs(d)
  assert.equal(arrows.length, 1)
  assert.equal(iconOf(arrows[0]), 'up-right')
  assert.equal(d.children.at(-1), arrows[0], 'after its words')
  assert.equal(arrows[0].props['aria-hidden'], true, 'nothing to say: it stays here')
})

test('Button inside No Origins with an action’s icon: the icon instead of the arrow', () => {
  const d = one(h(Button, { href: '/merons/noi/eio/edit', icon: 'pen', children: 'Change' }))
  assert.ok(classes(d).includes('button'))
  assert.deepEqual(svgs(d).map(iconOf), ['pen'])
  assert.equal(d.children[0], svgs(d)[0], 'before its words')
  assert.equal(d.props.target, undefined)
})

test('Button outside No Origins: words with the arrow, in a new tab, and it says so', () => {
  const d = one(h(Button, { href: 'https://github.com/No-Origins/noi', icon: 'pen', target: '_self', rel: 'opener', children: 'The code' }))
  assert.equal(d.tag, 'a')
  assert.deepEqual(classes(d), ['outside'], 'words, not a button')
  assert.equal(d.props.target, '_blank')
  assert.equal(d.props.rel, 'noopener noreferrer')
  assert.deepEqual(svgs(d).map(iconOf), ['up-right'], 'the arrow, never the action’s icon')
  assert.equal(svgs(d)[0].props['aria-label'], 'opens in a new tab')
})

test('Button given an address that only looks inside is drawn as outside', () => {
  for (const href of LOOK_INSIDE) {
    const d = one(h(Button, { href, children: 'Somewhere' }))
    assert.deepEqual(classes(d), ['outside'], JSON.stringify(href))
    assert.equal(d.props.target, '_blank', JSON.stringify(href))
    assert.equal(d.props.rel, 'noopener noreferrer', JSON.stringify(href))
  }
})

test('Button: outside, words with a dashed underline', () => {
  const css = read('Button/Button.module.css')
  const outside = css.match(/\n\.outside \{([^}]*)\}/)?.[1] ?? ''
  assert.match(outside, /text-decoration-line:\s*underline/)
  assert.match(outside, /text-decoration-style:\s*dashed/)
})

test('Chip: its name is required, and it leads somewhere', () => {
  const src = read('Chip/Chip.tsx')
  assert.match(src, /\n\s*children: ReactNode\n/, 'children must not be optional')
  assert.match(src, /\n\s*href: string\n/, 'a chip leads somewhere')
})

test('Chip: a real link to a thing in No Origins, in this tab', () => {
  const d = one(h(Chip, { href: '/merons/noi/eio', mark: 'x', note: 'admitted', children: 'Eidos' }))
  assert.equal(d.tag, 'a')
  assert.equal(d.props.href, '/merons/noi/eio')
  assert.ok(classes(d).includes('chip'))
  assert.equal(d.props.target, undefined)
  assert.equal(svgs(d).length, 0, 'no arrow')
  assert.equal(text(d), 'xEidosadmitted')
})

test('Chip given another site’s address: the arrow after its name, in a new tab, and it says so', () => {
  for (const href of ['https://github.com/No-Origins/noi/issues/1', ...LOOK_INSIDE]) {
    const d = one(h(Chip, { href, target: '_self', children: 'An issue' }))
    assert.ok(classes(d).includes('chip'), JSON.stringify(href))
    assert.equal(d.props.target, '_blank', JSON.stringify(href))
    assert.equal(d.props.rel, 'noopener noreferrer', JSON.stringify(href))
    assert.deepEqual(svgs(d).map(iconOf), ['up-right'], JSON.stringify(href))
    assert.equal(svgs(d)[0].props['aria-label'], 'opens in a new tab')
    assert.equal(d.children.at(-1), svgs(d)[0], 'after its name')
  }
})

test('Toggle: a real checkbox told to be a switch, in one label with its words', () => {
  const d = one(h(Toggle, { checked: true, disabled: true, readOnly: true, children: 'Markers' }))
  assert.equal(d.tag, 'label')
  assert.equal(text(d), 'Markers')
  const inputs = (function find(x) { return typeof x === 'string' ? [] : x.tag === 'input' ? [x] : x.children.flatMap(find) })(d)
  assert.equal(inputs.length, 1)
  assert.equal(inputs[0].props.type, 'checkbox')
  assert.equal(inputs[0].props.role, 'switch')
  assert.equal(inputs[0].props.checked, true, 'what it is given reaches the input')
  assert.equal(inputs[0].props.disabled, true)
})
