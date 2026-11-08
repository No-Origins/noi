// Fit test (Responsive Explorer, rule 6): every Explorer screen at both edges of every window class,
// in light and dark. It fails when a page is wider than its window (rule 1) or a control's target is
// under the Eidos minimum (rule 4). Window edges and the minimum come from @noi/eio-tokens, so the
// test moves with Mero. It also checks that reduced motion makes every motion instant (Eidos Motion,
// rule 7).
//
// Needs the explorer and mero launch settings running. Drives a local Chrome over the DevTools
// protocol: CHROME=/path/to/chrome, else the headless shell Playwright keeps in ~/Library/Caches.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const EXPLORER = process.env.EXPLORER_URL ?? 'http://localhost:3000'
const MERO = process.env.MERO_URL ?? 'http://127.0.0.1:8787'
const tokens = JSON.parse(readFileSync(new URL('../../../packages/eio-tokens/tokens.json', import.meta.url), 'utf8'))
const MINIMUM = tokens.size.target.minimum
// The narrowest phone, the last width of each class and the first of the next, and a desktop.
const edges = Object.values(tokens.layout.window).map(w => w.minWidth).filter(w => w > 0).sort((a, b) => a - b)
const WIDTHS = [320, ...edges.flatMap(w => [w - 1, w]), 1440]
const THEMES = ['light', 'dark']

// ——— The screens: each view, one meron of every kind, a group, the Change form and the batches ———
const get = async url => {
  const res = await fetch(url).catch(() => null)
  if (!res?.ok) throw new Error(`${url} is not answering: start the explorer and mero launch settings first`)
  return res.json()
}
const [registry, reviewState] = await Promise.all([get(`${MERO}/api/registry`), get(`${MERO}/api/review`)])
const hrefOf = path => `/merons/${path.split('.').join('/')}`
const merons = registry.merons.filter(m => m.lifecycle.state !== 'retired').sort((a, b) => a.identity.path.localeCompare(b.identity.path))
const kinds = new Map()
for (const m of merons) {
  const kind = `${m.classification.type}/${m.classification.subtype ?? ''}`
  if (!kinds.has(kind)) kinds.set(kind, m)
}
const paths = new Set(merons.map(m => m.identity.path))
const group = merons.map(m => m.identity.path.split('.').slice(0, -1).join('.')).find(p => p && !paths.has(p))
const ROUTES = [
  '/merons',
  '/review',
  '/eidos',
  ...[...kinds.values()].map(m => hrefOf(m.identity.path)),
  ...(group ? [hrefOf(group)] : []),
  ...(reviewState.writable ? [`${hrefOf([...kinds.values()].find(m => m.lifecycle.state === 'active').identity.path)}?change`] : []),
  ...reviewState.batches.slice(0, 6).map(b => `/review/${b.uid}`),
]

// ——— A small DevTools protocol client ———
function chromePath() {
  if (process.env.CHROME) return process.env.CHROME
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  const shell = existsSync(cache) && readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-')).sort().at(-1)
  const path = shell && join(cache, shell, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
  if (!path || !existsSync(path)) throw new Error('No Chrome found: set CHROME to a Chrome or headless shell binary')
  return path
}

async function openBrowser() {
  const profile = mkdtempSync(join(tmpdir(), 'explorer-fit-'))
  const chrome = spawn(chromePath(), ['--headless', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  let port
  for (let i = 0; i < 100 && !port; i++) {
    await new Promise(r => setTimeout(r, 100))
    try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch {}
  }
  if (!port) throw new Error('Chrome did not start')
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail })
  let seq = 0
  const pending = new Map(), events = []
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data)
    if (m.id && pending.has(m.id)) {
      const { ok, fail } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? fail(new Error(m.error.message)) : ok(m.result)
    } else events.forEach(f => f(m))
  }
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const id = ++seq
    pending.set(id, { ok, fail })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const once = method => new Promise(ok => { const f = m => { if (m.method === method) { events.splice(events.indexOf(f), 1); ok(m) } }; events.push(f) })
  const run = async (fn, ...args) => {
    const r = await send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  await send('Page.enable')
  return {
    send, run,
    async open(url) {
      const loaded = once('Page.loadEventFired')
      await send('Page.navigate', { url })
      await loaded
      await run(() => document.fonts.ready.then(() => true))
    },
    async close() {
      ws.close()
      const exited = new Promise(r => chrome.once('exit', r))
      chrome.kill()
      await exited
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
    },
  }
}

// ——— What is measured on the page ———
// Runs in the page: whether it is wider than the window, and every control whose target is too small.
// With `scope` (the open menu), only what is inside it, and whether anything reaches past its edge.
function measure(minimum, scope) {
  const root = scope ? document.querySelector(scope) : document.body
  const W = document.documentElement.clientWidth
  const edge = scope ? root.getBoundingClientRect().right : W
  const name = e => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0].replace(/^.*?__/, '') : ''} “${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 40)}”`
  const beyond = e => e.getBoundingClientRect().right > edge + 0.5
  const wide = scope ? edge > W + 0.5 || [...root.querySelectorAll('*')].some(beyond) : document.documentElement.scrollWidth > W
  // The outermost elements that reach past the edge, for the failure message.
  const past = !wide ? [] : [...root.querySelectorAll('*')]
    .filter(e => beyond(e) && !(e.parentElement && e.parentElement !== root && beyond(e.parentElement)))
    .slice(0, 5).map(e => `${name(e)} ends at ${Math.round(e.getBoundingClientRect().right)} px`)
  // A target is the control's box joined with any positioned ::before or ::after that reaches past it.
  const target = e => {
    const r = e.getBoundingClientRect(), own = getComputedStyle(e)
    // A positioned pseudo-element is placed from the padding box, inside the border.
    const [bt, bl] = [parseFloat(own.borderTopWidth), parseFloat(own.borderLeftWidth)]
    let [top, bottom, left, right] = [r.top, r.bottom, r.left, r.right]
    for (const pseudo of ['::before', '::after']) {
      const s = getComputedStyle(e, pseudo)
      if (s.content === 'none' || s.position !== 'absolute') continue
      const t = r.top + bt + parseFloat(s.top), l = r.left + bl + parseFloat(s.left), h = parseFloat(s.height), w = parseFloat(s.width)
      if ([t, l, h, w].some(Number.isNaN)) continue
      top = Math.min(top, t); bottom = Math.max(bottom, t + h); left = Math.min(left, l); right = Math.max(right, l + w)
    }
    return { w: right - left, h: bottom - top }
  }
  const small = []
  for (const e of root.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary')) {
    if (!e.checkVisibility()) continue
    // Links inside running text are exempt, as in WCAG; their sentence is the target.
    if (e.tagName === 'A' && getComputedStyle(e).display === 'inline') continue
    // A field's input or a choice's radio is reached through its label.
    const t = target(e.closest('label') ?? e)
    if (Math.min(t.w, t.h) < minimum - 0.5) small.push(`${name(e)} is ${Math.round(t.w)} × ${Math.round(t.h)} px`)
  }
  return { wide, width: scope ? Math.round(edge) : document.documentElement.scrollWidth, window: W, past, small: [...new Set(small)].slice(0, 8) }
}

// Runs in the page: opens the menu where this window shows its button. True once it is open,
// false where there is no menu button (two panes), or why it did not open.
function openMenu() {
  const button = document.querySelector('button[aria-label="Open the menu"]')
  if (!button?.checkVisibility()) return false
  const start = performance.now()
  return new Promise(resolve => {
    const attempt = () => {
      if (document.querySelector('dialog[open]')) return requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
      if (performance.now() - start > 5000) return resolve('the menu did not open')
      button.click() // before the page is hydrated a click does nothing, so try again
      setTimeout(attempt, 100)
    }
    attempt()
  })
}
const closeMenu = () => new Promise(resolve => { document.querySelector('dialog[open]')?.close(); requestAnimationFrame(() => resolve(true)) })

const browser = await openBrowser()
after(() => browser.close())

for (const route of ROUTES) {
  test(`fits every window: ${route}`, async () => {
    const problems = []
    await browser.send('Emulation.setDeviceMetricsOverride', { width: WIDTHS[0], height: 900, deviceScaleFactor: 1, mobile: false })
    await browser.open(EXPLORER + route)
    for (const width of WIDTHS) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
      for (const theme of THEMES) {
        await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
        await browser.run(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
        const m = await browser.run(measure, MINIMUM)
        if (m.wide) problems.push(`${width} px ${theme}: page is ${m.width} px wide in a ${m.window} px window; ${m.past.join('; ')}`)
        if (m.small.length) problems.push(`${width} px ${theme}: targets under ${MINIMUM} px: ${m.small.join('; ')}`)
        // Where one pane fills the window, the menu holds the views, the list and Theme: check it too.
        const opened = await browser.run(openMenu)
        if (typeof opened === 'string') problems.push(`${width} px ${theme}: ${opened}`)
        if (opened === true) {
          const menu = await browser.run(measure, MINIMUM, 'dialog[open]')
          if (menu.wide) problems.push(`${width} px ${theme}: the menu reaches past its edge (${menu.width} px in a ${menu.window} px window); ${menu.past.join('; ')}`)
          if (menu.small.length) problems.push(`${width} px ${theme}: in the menu, targets under ${MINIMUM} px: ${menu.small.join('; ')}`)
          await browser.run(closeMenu)
        }
      }
    }
    assert.deepEqual(problems, [], `\n${problems.join('\n')}`)
  })
}

// Eidos Motion, rule 7: with the system asking for reduced motion, nothing moves and nothing fades.
test('reduced motion makes every motion instant', async () => {
  const durations = () => browser.run(() => {
    const found = new Set()
    for (const e of document.querySelectorAll('body *')) {
      const s = getComputedStyle(e)
      for (const d of `${s.transitionDuration},${s.animationDuration}`.split(',')) found.add(d.trim())
    }
    return [...found]
  })
  await browser.send('Emulation.setDeviceMetricsOverride', { width: WIDTHS[0], height: 900, deviceScaleFactor: 1, mobile: false })
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await browser.open(EXPLORER + '/merons/noi/eio')
  assert.deepEqual((await durations()).filter(d => d !== '0s'), [], 'every transition and animation lasts 0 s')
  const opened = await browser.run(openMenu)
  assert.equal(opened, true, 'the menu opens')
  assert.deepEqual((await durations()).filter(d => d !== '0s'), [], 'the menu and its icon too')
  await browser.run(closeMenu)
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await browser.run(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  assert.ok((await durations()).includes('0.1s'), 'without it, controls fade their color in 100 ms')
})
