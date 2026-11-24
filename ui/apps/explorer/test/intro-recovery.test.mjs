import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'next/dist/build/swc/index.js'

const INTRO = new URL('../app/hyperbase/world/intro/', import.meta.url)
const realRequire = createRequire(new URL('intro.ts', INTRO))
// Execute the shipped code with controlled browser, renderer and React lifecycle boundaries.
function load(file, dependencies, globals = {}) {
  const source = readFileSync(new URL(file, INTRO), 'utf8')
  const { code } = transformSync(source, {
    filename: file,
    jsc: { parser: { syntax: 'typescript', tsx: file.endsWith('.tsx') }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'commonjs' },
  })
  const exports = {}
  runInNewContext(code, {
    exports,
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : realRequire(name),
    ...globals,
  })
  return exports
}

function opening({ search = '', reduced = false } = {}) {
  const slots = [], effects = [], timers = new Map()
  let cursor = 0, dirty = false, tree, id = 0, now = 0
  const react = {
    useState(initial) {
      const key = cursor++
      slots[key] ??= { value: initial }
      return [slots[key].value, next => {
        slots[key].value = typeof next === 'function' ? next(slots[key].value) : next
        dirty = true
      }]
    },
    useEffect(effect, deps) {
      const key = cursor++
      const before = slots[key]
      if (!before || deps.some((value, i) => !Object.is(value, before.deps[i]))) {
        effects.push(() => {
          before?.cleanup?.()
          slots[key] = { deps, cleanup: effect() }
        })
      }
    },
  }
  const WorldView = () => {}, IntroView = () => {}
  const { WorldOpens } = load('WorldOpens.tsx', {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' },
    '../WorldView': { WorldView }, './IntroView': { IntroView },
    './intro': { TOTAL: 16.3 }, './intro.module.css': { intro: 'intro', leaving: 'leaving' },
  }, {
    window: { location: { search }, matchMedia: () => ({ matches: reduced }) }, URLSearchParams,
    setTimeout: (fn, ms) => { timers.set(++id, { fn, at: now + ms }); return id },
    clearTimeout: key => timers.delete(key),
  })
  const render = () => {
    do {
      dirty = false
      cursor = 0
      tree = WorldOpens()
      for (const effect of effects.splice(0)) effect()
    } while (dirty)
  }
  render()
  return {
    get intro() { return tree.props.children.find(node => node?.type === IntroView)?.props },
    get world() { return tree.props.children.find(node => node?.type === WorldView)?.props },
    get timers() { return timers.size },
    emit(name) { this.intro[name](); render() },
    opened() { this.world.onOpen(); render() },
    advance(ms) {
      const until = now + ms
      while (true) {
        const next = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        now = next[1].at
        timers.delete(next[0])
        next[1].fn()
        render()
      }
      now = until
    },
    close() { for (const slot of slots) slot?.cleanup?.() },
  }
}

test('normal handover waits for arrival, the end and the world, then settles and fades', () => {
  const page = opening()
  assert.ok(page.intro)
  assert.equal(page.world, undefined)
  page.emit('onArrived')
  assert.ok(page.world)
  page.opened()
  page.advance(200)
  assert.equal(page.intro.leaving, false, 'ready world does not cut the animation short')
  page.emit('onEnded')
  page.advance(149)
  assert.equal(page.intro.leaving, false)
  page.advance(1)
  assert.equal(page.intro.leaving, true)
  page.advance(450)
  assert.equal(page.intro, undefined)
  assert.ok(page.world)
  assert.equal(page.timers, 0)
})

test('failed setup immediately removes the intro and reveals the world', () => {
  for (const arrived of [false, true]) {
    const page = opening()
    if (arrived) page.emit('onArrived')
    const lateArrival = page.intro.onArrived
    page.emit('onError')
    assert.equal(page.intro, undefined)
    assert.ok(page.world)
    assert.equal(page.timers, 0)
    lateArrival()
    page.advance(60000)
    assert.equal(page.intro, undefined, 'late completion cannot restore the intro')
  }
})

test('setup that never settles recovers even without an arrival or end event', () => {
  for (const arrived of [false, true]) {
    const page = opening()
    page.advance(1000)
    if (arrived) page.emit('onArrived')
    page.advance(23299)
    assert.ok(page.intro)
    page.advance(1)
    assert.equal(page.intro, undefined)
    assert.ok(page.world)
    assert.equal(page.timers, 0)
  }
})

test('the completed intro still exposes a world that fails to open after its existing wait', () => {
  const page = opening()
  page.emit('onArrived')
  page.emit('onEnded')
  page.advance(7999)
  assert.equal(page.intro.leaving, false)
  page.advance(1)
  assert.equal(page.intro.leaving, true)
  page.advance(450)
  assert.equal(page.intro, undefined)
  assert.ok(page.world)
})

test('reduced motion and ?intro=off open the world without mounting the intro or its timers', () => {
  for (const options of [{ reduced: true }, { search: '?intro=off' }]) {
    const page = opening(options)
    assert.equal(page.intro, undefined)
    assert.ok(page.world)
    assert.equal(page.timers, 0)
  }
})

test('unmount cancels the startup deadline', () => {
  const page = opening()
  assert.equal(page.timers, 1)
  page.close()
  assert.equal(page.timers, 0)
})

test('IntroView forwards renderer failure and disposes its canvas and player on unmount', () => {
  let effect, cleanup, report, closed = 0, removed = 0, arrived, ended
  const errors = []
  const canvas = { remove() { removed++ } }
  const window = { matchMedia: () => ({ matches: false }) }
  const { IntroView } = load('IntroView.tsx', {
    react: { useRef: current => ({ current }), useEffect: fn => { effect = fn } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    './intro.module.css': {},
    './intro': { playIntro(parts, look, onError) {
      assert.equal(parts.canvas, canvas)
      report = onError
      return { arrived(fn) { arrived = fn }, ended(fn) { ended = fn }, close() { closed++ } }
    } },
  }, {
    window, document: { createElement: () => canvas },
    getComputedStyle: () => ({ backgroundColor: '#000', getPropertyValue: () => '#fff' }),
  })
  const tree = IntroView({ onError: why => errors.push(why), onArrived: () => errors.push('arrived'), onEnded: () => errors.push('ended') })
  const assignRefs = node => {
    if (!node || typeof node !== 'object') return
    if (node.props.ref) node.props.ref.current = { append() {} }
    for (const child of [node.props.children].flat()) assignRefs(child)
  }
  assignRefs(tree)
  cleanup = effect()
  const why = new Error('no rendering backend')
  report(why)
  arrived()
  ended()
  assert.deepEqual(errors, [why, 'arrived', 'ended'])
  cleanup()
  assert.equal(closed, 1)
  assert.equal(removed, 1)
  assert.equal(window.__intro, undefined)
})

function player(openWorld) {
  const frames = new Map(), errors = []
  let id = 0
  const { playIntro } = load('intro.ts', { '../world.ts': { openWorld } }, {
    performance: { now: () => 0 }, console: { error: why => errors.push(why) },
    requestAnimationFrame: fn => { frames.set(++id, fn); return id },
    cancelAnimationFrame: key => frames.delete(key),
  })
  const part = { setAttribute() {}, style: {} }
  const intro = playIntro(
    { host: { clientWidth: 1600, clientHeight: 900 }, canvas: {}, logo: part, lime: part, outline: part },
    { background: '#000', colour: () => '#fff', secondary: '--secondary' },
    why => errors.push(why),
  )
  return { intro, frames, errors }
}

test('renderer rejection reports failure and stops the intro frames', async () => {
  const why = new Error('renderer init failed')
  const running = player(() => Promise.reject(why))
  await new Promise(setImmediate)
  assert.deepEqual(running.errors, [why, why], 'logged and delivered to the owner')
  assert.equal(running.frames.size, 0)
  running.intro.close()
  assert.equal(running.errors.length, 2)
})

test('renderer resolution or rejection after unmount cannot revive the intro or notify its owner', async () => {
  for (const reject of [false, true]) {
    let resolve, fail, closed = 0, watched = 0
    const pending = new Promise((yes, no) => { resolve = yes; fail = no })
    const running = player(() => pending)
    running.intro.close()
    if (reject) fail(new Error('late failure'))
    else resolve({ close() { closed++ }, eachFrame() { watched++ } })
    await new Promise(setImmediate)
    assert.equal(closed, reject ? 0 : 1)
    assert.equal(watched, 0)
    assert.equal(running.frames.size, 0)
    assert.equal(running.errors.length, 0)
  }
})
