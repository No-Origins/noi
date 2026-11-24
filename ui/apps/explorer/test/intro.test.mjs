// The intro of the world (23 Nov 2026): the logo of No Origins as one stroke, and the order the user gave the
// intro. The user: "reveal like a single stroke painting with lime ... and then after few seconds we want to
// transition into blueprint drawing by quick render of secondary colour (violet) outline of the stroke and the
// lime should disappear. Then the wave and circular twist base platform should start building row by row behind
// the stroke. As it builds, the camera should move from the front to the top right and towards the beginning of
// the platform from the back."
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LOGO_PATH, LOGO_SIZE, STROKE, edgesOf } from '../app/hyperbase/world/intro/logoStroke.ts'
import { STRIP, alongStrip, drawnAt, logoEye, lowEdgeIsOne, onStrip } from '../app/hyperbase/world/intro/logoView.ts'
import { ARRIVED, BASE, BASE_FROM, BUILDING_FROM, JUST_LAID, TIMES, TOTAL, baseReach } from '../app/hyperbase/world/intro/intro.ts'
import { ASTROID, ASTROID_STATES, BASE_TILE, WAVE_PLATFORM, value } from '@noi/eio-3d'

const INTRO = fileURLToPath(new URL('../app/hyperbase/world/intro/', import.meta.url))
const code = text => text.replace(/\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm, '')

test('the logo is one stroke: from a tip to a tip, its places equally far apart, all within its size', () => {
  assert.ok(STROKE.length > 500, `${STROKE.length} places`)
  assert.equal(STROKE[0].half, 0, 'it begins at a tip')
  assert.equal(STROKE.at(-1).half, 0, 'it ends at a tip')
  const steps = STROKE.slice(1).map((p, i) => Math.hypot(p.x - STROKE[i].x, p.y - STROKE[i].y))
  const mean = steps.reduce((s, v) => s + v, 0) / steps.length
  for (const step of steps) assert.ok(Math.abs(step - mean) < mean * 0.05, `a step of ${step} beside the usual ${mean}`)
  for (const p of STROKE) {
    assert.ok(p.half >= 0, 'no width less than none')
    assert.ok(p.x >= -0.5 && p.x <= LOGO_SIZE.width + 0.5 && p.y >= -0.5 && p.y <= LOGO_SIZE.height + 0.5, `the place ${p.x}, ${p.y} is outside the logo`)
  }
  assert.ok(STROKE[0].x < STROKE.at(-1).x, 'it runs from the left tip to the right tip')
})

test('the stroke has two edges that meet at its tips, and stay within the logo', () => {
  const { one, other } = edgesOf()
  assert.equal(one.length, STROKE.length)
  assert.equal(other.length, STROKE.length)
  assert.deepEqual(one[0], other[0], 'the edges meet at the left tip')
  assert.deepEqual(one.at(-1), other.at(-1), 'the edges meet at the right tip')
  for (const [x, y] of [...one, ...other]) assert.ok(x >= -0.5 && x <= LOGO_SIZE.width + 0.5 && y >= -0.5 && y <= LOGO_SIZE.height + 0.5, `the edge reaches ${x}, ${y}, outside the logo`)
})

test('the vector is one closed outline of curves, within the logo', () => {
  assert.match(LOGO_PATH, /^M[-\d. ]+(C[-\d. ]+)+Z$/, 'a start, curves, and closed')
  const numbers = LOGO_PATH.match(/-?\d+(\.\d+)?/g).map(Number)
  assert.equal((numbers.length - 2) % 6, 0, 'every curve has its three dots')
  // a curve's handles may reach a little past the stroke; the dots it passes through do not
  for (let i = 0; i < numbers.length; i += 2) assert.ok(numbers[i] > -20 && numbers[i] < LOGO_SIZE.width + 20 && numbers[i + 1] > -20 && numbers[i + 1] < LOGO_SIZE.height + 20, `the outline reaches ${numbers[i]}, ${numbers[i + 1]}`)
})

test('behind every place of the stroke lies a place along the platform, in order, end to end', () => {
  const along = alongStrip()
  assert.equal(along.length, STROKE.length)
  assert.equal(along[0], 0, 'the left tip is the beginning of the platform')
  assert.equal(along.at(-1), STRIP.long, 'the right tip is its end')
  for (let i = 1; i < along.length; i++) assert.ok(along[i] >= along[i - 1], 'it never goes back along the platform')
  // from the logo's eye the platform's middle line lies behind the stroke's: about the stroke's own width
  // away on average (the stroke is a drawing, and the eye is held at street level, so not exactly: logoView.ts)
  const eye = logoEye(1, 0, 0, 0, 0)
  const gaps = along.map((y, i) => { const p = drawnAt(eye, onStrip(0, y), 0, 0); return Math.hypot(p[0] - STROKE[i].x, p[1] - STROKE[i].y) })
  const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length
  assert.ok(mean < 32, `the platform lies ${mean.toFixed(1)} units from the stroke on average`)
  assert.equal(typeof lowEdgeIsOne(along), 'boolean')
})

test('the intro goes in the order the user gave', () => {
  const painted = TIMES.dark + TIMES.paint
  const outlineFrom = painted + TIMES.stay
  assert.ok(TIMES.stay >= 2, 'the painted logo stays a few seconds')
  assert.ok(TIMES.outline < 1, 'the outline is a quick render')
  assert.ok(outlineFrom + TIMES.limeGoesAfter + TIMES.limeGoes <= BUILDING_FROM, 'the lime is gone before the building starts')
  assert.ok(outlineFrom + TIMES.outline <= BUILDING_FROM, 'the outline is drawn before the building starts')
  assert.ok(TIMES.build <= TIMES.forwardAfter + TIMES.forward / 2, 'the platform is built while the eye still has it whole in its picture, or nearly')
  assert.equal(ARRIVED, BUILDING_FROM + Math.max(TIMES.round, TIMES.riseAfter + TIMES.rise, TIMES.forwardAfter + TIMES.forward))
  assert.equal(TOTAL, Math.max(BUILDING_FROM + TIMES.build, ARRIVED) + TIMES.glowGoes)
})

// The user, of the row being laid, which showed as a violet line across the platform: "not the violet color line
// rendering each tile, but the asteroids between the tiles should glow when they render, and they have to keep
// glowing till the camera reaches the end, and then they should go back to their normal state."
test('the astroids glow from when they are laid until the eye has arrived, and no line marks the row', () => {
  assert.ok(BUILDING_FROM + TIMES.build <= ARRIVED, 'every astroid is laid before the eye arrives: all glow till then')
  assert.equal(TOTAL, ARRIVED + TIMES.glowGoes, 'and the intro ends with them in their normal state')
  const text = code(readFileSync(INTRO + 'intro.ts', 'utf8'))
  assert.doesNotMatch(text, /BoxGeometry|LIT_ROWS/, 'the bar across the row being laid is gone')
  assert.match(text, /kind\.of === ASTROID/, 'what glows is the astroids')
})

// The user: "Since we added glow animation for the asteroids, it should be a state, right?"
test('the glow is the astroid\'s own state, and the intro only says when', () => {
  assert.deepEqual(ASTROID.states.map(s => s.id), ['default', 'active'], 'the astroid has two states, as the stage has')
  assert.equal(ASTROID.states[0].glow, undefined, 'in its first state it does not glow')
  const whole = ASTROID_STATES.active.glow.whole
  assert.ok(whole.bright > 1, 'active, it gives off more than its own colour')
  assert.ok(whole.round.across > ASTROID.size.x && whole.round.across < BASE_TILE.size.x, 'its light reaches beyond it, and not as far as the next astroid\'s')
  assert.ok(whole.round.above > 0, 'the light lies over the tiles\' tops, never in them')
  assert.equal(TIMES.glowGoes, value('noi.eio.world.states.change'), 'they go back to normal in Eidos\'s own time for a change of state')
  const text = code(readFileSync(INTRO + 'intro.ts', 'utf8'))
  assert.match(text, /kind\.made\.state\(states\.active, true\)/, 'the astroids are active from the moment they are laid')
  assert.match(text, /kind\.made\.state\(active \? states\.active : states\.normal, jumped\)/, 'and go back when the eye has arrived')
  assert.doesNotMatch(text, /emissive/, 'the intro lights no astroid itself')
  // the one thing that is the intro's own: an astroid just laid is brighter for a moment
  assert.ok(JUST_LAID.bright > 0 && whole.round.bright + JUST_LAID.bright <= 1, 'brighter, and never more than the colour itself')
  assert.ok(JUST_LAID.over > 0 && JUST_LAID.goes > 0 && JUST_LAID.goes < TIMES.glowGoes + (ARRIVED - BUILDING_FROM - TIMES.build), 'and that has faded before the eye arrives')
})

// The user, on seeing the first move: "The camera should go from street to right, up, and then behind the logo, and
// then to the front. Right now it feels like the logo is rotating for the camera. So what we can do is we can have a
// base with a violet line, so that we will have a reference to the base."
test('the eye goes right, then up, then behind the logo, then forward, and never stops between', () => {
  assert.ok(TIMES.riseAfter > 0, 'it has begun to go right before it rises')
  assert.ok(TIMES.riseAfter + TIMES.rise <= TIMES.round, 'it has risen by the time it is behind the logo')
  assert.ok(TIMES.forwardAfter > TIMES.riseAfter, 'it goes forward after it has begun to rise')
  assert.ok(TIMES.forwardAfter < TIMES.round, 'it starts forward while it still goes round')
  assert.ok(TIMES.forwardAfter + TIMES.forward > TIMES.round, 'and going forward is the last of its move')
  assert.ok(TIMES.look < TIMES.round, 'it looks at the platform well before it is behind it')
})

test('the eye starts at street level, looking level, so the base is seen as one line', () => {
  const eye = logoEye(1, 0, 0, 0, 0)
  assert.ok(eye.from[1] > 0 && eye.from[1] < 3, `the eye stands ${eye.from[1]} m above the ground`)
  assert.ok(Math.abs(eye.looks[1]) < 1e-9, 'it looks level')
  assert.ok(Math.abs(eye.top[0]) < 1e-9 && Math.abs(eye.top[2]) < 1e-9, 'and stands upright')
  // the base's four corners are drawn on one level line, under the logo's foot, and inside the picture: the
  // logo takes 61% of the picture's width, so the picture reaches 295 of the logo's units beyond it each way
  const reach = baseReach()
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => drawnAt(eye, [0 - sx * reach.x, 0 - BASE.under, 0 - sy * reach.y], 0, 0))
  for (const [x, y, before] of corners) {
    assert.ok(before > 0, 'the base lies before the eye')
    assert.ok(Math.abs(y - corners[0][1]) < 3, 'on one line')
    assert.ok(y > LOGO_SIZE.height - 6 && y < LOGO_SIZE.height + 6, `the line is at the logo's foot (${y.toFixed(1)} of ${LOGO_SIZE.height})`)
    assert.ok(x > -250 && x < LOGO_SIZE.width + 250, `the line ends inside the picture (${x.toFixed(0)})`)
  }
})

test('the base lies under the whole platform, on whole lines', () => {
  const reach = baseReach()
  assert.ok(reach.x >= WAVE_PLATFORM.size.x / 2 + BASE.beyond && reach.y >= WAVE_PLATFORM.size.y / 2 + BASE.beyond, 'it reaches beyond the platform every way')
  assert.equal(reach.x % BASE.every, 0)
  assert.equal(reach.y % BASE.every, 0)
  assert.ok(BASE.under > 0, 'under the platform, never through it')
  assert.equal(BASE_FROM, TIMES.dark + TIMES.paint + TIMES.stay + TIMES.baseAfter)
  assert.ok(BASE_FROM + TIMES.base <= BUILDING_FROM, 'the base is drawn before the eye moves')
})

test('three.js draws the platform, and the page draws the stroke: the intro has no drawing code of its own', () => {
  for (const name of readdirSync(INTRO).filter(f => /\.tsx?$/.test(f))) {
    const text = code(readFileSync(INTRO + name, 'utf8'))
    assert.doesNotMatch(text, /getContext\(/, `${name} asks a canvas for a drawing context of its own`)
    assert.doesNotMatch(text, /\bgl\.(draw|bind|use|create)[A-Z]/, `${name} draws by hand`)
    assert.doesNotMatch(text, /\b(function makeElement|function makeMany|const BASE_TILE\b)/, `${name} makes an element of its own`)
    assert.doesNotMatch(text, /\bscene\.(add|attach)\(/, `${name} puts a thing straight into the scene, not into xyz`)
  }
  assert.match(code(readFileSync(INTRO + 'intro.ts', 'utf8')), /from '@noi\/eio-3d'/, 'the platform is Eidos\'s own element')
})

// The user, asked whether the intro should open the world: "Yes, open /world".
test('the world opens with the intro, and the world is shown when the eye has arrived', () => {
  const WORLD = fileURLToPath(new URL('../app/hyperbase/world/', import.meta.url))
  const page = code(readFileSync(WORLD + 'page.tsx', 'utf8'))
  assert.match(page, /return <WorldOpens \/>/, 'the world\'s page shows the opening')
  const opens = code(readFileSync(INTRO + 'WorldOpens.tsx', 'utf8'))
  assert.match(opens, /const world = opening === 'arrived' \|\| opening === 'leaving' \|\| opening === 'world'/, 'the world is opened when the eye has arrived, not before')
  assert.match(opens, /\{world && <WorldView onOpen=/, 'and says when it is open')
  assert.match(opens, /if \(opening !== 'arrived' \|\| !ended\) return/, 'the intro goes only after it has run to its end')
  assert.match(opens, /open \? SETTLES_IN : WAITS_AT_MOST/, 'and once the world is open, or after a wait when it does not open')
  // for checks and tools, and for whoever asked for less motion: the world at once
  assert.match(opens, /get\('intro'\) === 'off'/, 'the address can leave the intro out')
  assert.match(opens, /prefers-reduced-motion: reduce/, 'and so can the device')
  const view = code(readFileSync(WORLD + 'WorldView.tsx', 'utf8'))
  assert.match(view, /setLand\(opened\)\s+onOpen\?\.\(\)/, 'the world says it is open once its land is drawn')
  const css = readFileSync(INTRO + 'intro.module.css', 'utf8')
  assert.match(css, /\.leaving \{[^}]*transition: opacity var\(--eio-motion-duration-ms300\) var\(--eio-motion-easing-standard\)/, 'the intro goes in Eidos\'s own time')
})
