// The rules of the 3D world and of Eidos, as tests on @noi/eio-3d (17 Nov 2026).
// From the user's own rules (the world's notes) and Eidos's component rules:
// 1 · Colours come only from Eidos: no colour of its own anywhere in the package.
// 2 · Sizes come only from Eidos: none of the world's numbers is written in the code.
// 3 · Solid things have no edge lines: no face of the arch or its block asks for one.
// 4 · One rule for the edge of the world: it is written once, and the painter of solid things uses it.
// 5 · The arch is the user's side-view sketch: upright back, top reaching toward the pool, nothing at the ground.
// 6 · The styles use Eidos's tokens and roles only, as eio-react's do.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { archMeasure, archShape, blockShape } from '../src/arch/arch.ts'
import { FRAG_S, EDGE } from '../src/drawing/glsl.ts'
import { FLOATS } from '../src/drawing/gl.ts'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const files = (dir = SRC) => readdirSync(dir).flatMap(f => statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)])
// Each file by its name: every name in the package is its own, wherever its folder is.
const source = Object.fromEntries(files().map(f => [basename(f), readFileSync(f, 'utf8')]))
assert.equal(Object.keys(source).length, files().length, 'two files of the package share a name')
const TOKENS = readFileSync(new URL('../../eio-tokens/tokens.css', import.meta.url), 'utf8')
const defined = new Set([...TOKENS.matchAll(/^\s*(--eio-[a-z0-9-]+):/gm)].map(m => m[1]))
// The arch as Mero holds it today (17 Nov); any arch will do for the shape's rules.
const ARCH = { height: 56, width: 40, thickness: 4, reach: 41.44, distance: 112 }

test('1 · no colour of its own: colours come from Eidos', () => {
  for (const [file, text] of Object.entries(source)) {
    assert.doesNotMatch(text, /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i, `${file} writes a colour`)
    assert.doesNotMatch(text, /\b0x[0-9a-f]{6}\b/i, `${file} writes a colour`)
    assert.doesNotMatch(text, /\b(rgba?|hsla?|oklch)\(/i, `${file} writes a colour`)
  }
})

test('2 · none of the world\'s numbers is written in the code: they come from Eidos', () => {
  const WORLD = ['56', '112', '41.44', '0.74', '128', '48', '0.35', '9.6', '1.6']
  for (const [file, text] of Object.entries(source)) {
    if (file === 'glsl.ts') continue // the card's own sums: light, grain noise, fog shares
    const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const n of WORLD) assert.doesNotMatch(code, new RegExp(`(?<![\\w.])${n.replace('.', '\\.')}(?![\\w.])`), `${file} writes ${n}`)
  }
})

test('3 · solid things have no edge lines', () => {
  for (const [name, data] of [['the arch', archShape(ARCH)], ['its block', blockShape(ARCH, 176)]]) {
    assert.ok(data.length > 0 && data.length % FLOATS === 0, name)
    for (let i = 0; i < data.length; i += FLOATS) {
      assert.deepEqual([...data.slice(i + 10, i + 14)], [0, 0, 0, 0], `${name}: a face asks for an edge line`)
    }
  }
  assert.match(source['stage.ts'], /uEdges, 0\)/, 'the stage draws solid things with no edges')
})

test('4 · one rule for the edge of the world, written once and used', () => {
  const where = Object.entries(source).filter(([, t]) => /float\s+goneAt\s*\(/.test(t)).map(([f]) => f)
  assert.deepEqual(where, ['glsl.ts'], 'goneAt is written once, in glsl.ts')
  assert.ok(FRAG_S.includes(EDGE), 'the painter of solid things carries the edge rule')
  assert.match(FRAG_S, /goneAt\(vWorld\.xz\)/, 'and asks it, by place')
})

test('5 · the arch is the user\'s side-view sketch', () => {
  const d = archShape(ARCH)
  const corners = []
  for (let i = 0; i < d.length; i += FLOATS) corners.push([d[i], d[i + 1], d[i + 2]])
  const ys = corners.map(c => c[1]), zs = corners.map(c => c[2]), xs = corners.map(c => c[0])
  assert.equal(Math.max(...ys), ARCH.height, 'as tall as its height')
  assert.equal(Math.min(...ys), 0, 'standing on its floor')
  assert.equal(Math.max(...xs) - Math.min(...xs), ARCH.width, 'as wide as its width')
  assert.equal(Math.max(...zs), ARCH.distance, 'its upright back at its distance from the pool')
  // (The card keeps a corner to about six digits: 70.56 is held as 70.5599976.)
  assert.ok(Math.abs(Math.min(...zs) - (ARCH.distance - ARCH.reach)) < 1e-4, 'its top reaches toward the pool by its reach')
  // At the ground the front meets the back: the triangle comes to nothing there.
  for (const c of corners.filter(c => c[1] === 0)) assert.equal(c[2], ARCH.distance)
})

test('5 · each measure lies on the arch it measures', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9
  const len = m => Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1], m.to[2] - m.from[2])
  for (const k of ['height', 'width', 'thickness', 'reach', 'distance']) assert.ok(near(len(archMeasure(ARCH, k)), ARCH[k]), k)
  assert.ok(archMeasure(ARCH, 'distance').to[2] < 0, 'the arch stands at -z in the world, facing the pool at the origin')
})

for (const [file, text] of Object.entries(source).filter(([f]) => f.endsWith('.module.css'))) {
  const css = text.replace(/\/\*[\s\S]*?\*\//g, '')
  const values = [...css.matchAll(/:\s*([^;{}]+);/g)].map(m => m[1])
  test(`6 · ${file}: lengths and colours only from Eidos`, () => {
    for (const v of values) {
      for (const [n] of v.matchAll(/-?\d*\.?\d+(px|rem|em|vh|vw|pt)\b/g)) assert.ok(parseFloat(n) === 0, `raw length ${n} in "${v}"`)
      assert.doesNotMatch(v, /\b(white|black|grey|gray|lime)\b/i, `named colour in "${v}"`)
    }
    for (const [, name] of css.matchAll(/var\((--eio-[a-z0-9-]+)/g)) {
      assert.ok(defined.has(name), `${name} is not in @noi/eio-tokens`)
      assert.doesNotMatch(name, /^--eio-color-palette-/, 'roles, never palette colours')
    }
    assert.doesNotMatch(css, /@media[^{]*\b(width|min-width|max-width)\b/, 'no window widths of its own')
  })
}

// ——— the land, its circles and its edge (17 Nov) ———
import { circlesInRow, firstRow, landMeasure, landValue } from '../src/land/land.ts'
import { FRAG } from '../src/drawing/glsl.ts'
// The land as Mero holds it today (17 Nov).
const LAND = { radius: 128, band: 48, grain: 0.35, circleRadius: 4, place: 10, dash: 1, line: 0.14, poolRadius: 20, wallWidth: 1 }

test('4 · the ground painter carries the one edge rule and asks it, by place', () => {
  assert.ok(FRAG.includes(EDGE), 'the ground painter carries the edge rule')
  assert.match(FRAG, /float gone = goneAt\(p\);/)
})

test('the land has no grid lines (the user, 17 Nov)', () => {
  const main = FRAG.slice(FRAG.indexOf('void main(){'))
  assert.doesNotMatch(main, /\blines\(/, 'the ground painter draws no grid lines')
  assert.match(main, /field\(p, cell\)/, 'it draws the circles')
})

test('the circles\' sizes come from Eidos, not from the painter', () => {
  assert.doesNotMatch(source['glsl.ts'], /float width = 0\.14/, 'the line is Eidos\'s circles.line')
  assert.match(source['glsl.ts'], /uCircle\.y/, 'the line comes in from Eidos')
  assert.match(source['glsl.ts'], /rad\/max\(uCircle\.x/, 'the dashes come in from Eidos')
})

test('the circles keep their space, and none lies on the pool or its wall', () => {
  assert.ok(firstRow(LAND) - LAND.place / 2 > LAND.poolRadius + LAND.wallWidth, 'the first row clears the wall')
  for (let row = 0; row < 10; row++) {
    const { R, n } = circlesInRow(LAND, row)
    assert.ok(2 * Math.PI * R / n >= LAND.place - 1e-9, `row ${row}: circles at least a place apart`)
    assert.ok(LAND.circleRadius < LAND.place / 2, 'a circle is smaller than its place: space between (the user, 17 Nov)')
  }
})

test('each of the land\'s measures is as long as its number', () => {
  const len = m => Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1], m.to[2] - m.from[2])
  for (const k of ['radius', 'band', 'grain', 'circle-radius', 'place', 'line']) {
    assert.ok(Math.abs(len(landMeasure(LAND, k)) - landValue(LAND, k)) < 1e-9, k)
  }
  // a dash is drawn as the chord of its arc: within a few per cent of its length
  assert.ok(Math.abs(len(landMeasure(LAND, 'dash')) - LAND.dash) / LAND.dash < 0.05, 'dash')
})

// ——— the pool and its wall (17 Nov) ———
import { poolMeasure, poolValue, wallShape } from '../src/pool/pool.ts'
const WALL = { poolRadius: 20, height: 0.6, width: 1 }

test('3 · the wall is one block with no edge lines, standing on the water\'s edge', () => {
  const d = wallShape(WALL)
  let lo = Infinity, hi = 0, top = 0
  for (let i = 0; i < d.length; i += FLOATS) {
    assert.deepEqual([...d.slice(i + 10, i + 14)], [0, 0, 0, 0], 'a face of the wall asks for an edge line')
    const r = Math.hypot(d[i], d[i + 2]); lo = Math.min(lo, r); hi = Math.max(hi, r); top = Math.max(top, d[i + 1])
  }
  assert.ok(Math.abs(lo - WALL.poolRadius) < 1e-4, 'its inner side is the water\'s edge')
  assert.ok(Math.abs(hi - (WALL.poolRadius + WALL.width)) < 1e-4, 'as wide as its width')
  assert.ok(Math.abs(top - WALL.height) < 1e-6, 'as high as its height: 2 feet (agreed 17 Nov)')
})

test('the water is the ground painter\'s, and it mirrors and moves', () => {
  assert.match(FRAG, /uniform sampler2D uRefl;/, 'it shows the mirror picture')
  assert.match(FRAG, /t\*1\.3\)/, 'its waves move with time')
  assert.match(source['stage.ts'], /draw\(seconds = 0\)/, 'without a time, the stage draws the water still')
  assert.match(source['Stage3D.tsx'], /prefers-reduced-motion: reduce/, 'reduced motion keeps the water still')
})

test('each of the pool\'s measures is as long as its number', () => {
  const len = m => Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1], m.to[2] - m.from[2])
  for (const k of ['pool-radius', 'wall-height', 'wall-width']) assert.ok(Math.abs(len(poolMeasure(WALL, k)) - poolValue(WALL, k)) < 1e-9, k)
})

// ——— the steps (17 Nov) ———
import { stepCount, stepsList, stepsMeasure, stepsShape, stepsValue } from '../src/steps/steps.ts'
const STEPS = { start: 32, depth: 1.6, height: 0.3, top: 9.6, reach: 176 }

test('the steps rise one height at a time to the top step, which runs out to where nothing is left', () => {
  assert.equal(stepCount(STEPS), 32, 'the count is the top step\'s height over one step\'s')
  const list = stepsList(STEPS)
  assert.equal(list.length, 32)
  assert.equal(list[0][0], STEPS.start, 'the first step begins where the steps begin')
  list.forEach(([r0, r1, h], i) => {
    assert.ok(Math.abs(h - STEPS.height * (i + 1)) < 1e-9, `step ${i + 1} is one height above the one below`)
    if (i < list.length - 1) assert.ok(Math.abs(r1 - r0 - STEPS.depth) < 1e-9, `step ${i + 1} is one depth deep`)
  })
  assert.ok(Math.abs(list.at(-1)[2] - STEPS.top) < 1e-9, 'the top step is at its height')
  assert.equal(list.at(-1)[1], STEPS.reach, 'the top step runs out to where nothing of the land is left')
})

test('the steps are plain black: only each lip, the top step\'s back and the ends ask for a line', () => {
  const d = stepsShape(STEPS)
  for (let i = 0; i < d.length; i += FLOATS) {
    const up = d[i + 4] === 1, flags = [...d.slice(i + 10, i + 14)]
    if (up) assert.equal(flags[2], 1, 'what you step on has its lip line')
    assert.equal(flags[0] + flags[1], 0, 'no line runs across the steps')
  }
  assert.match(FRAG_S, /bool left = uSteps\.z > 0\.5 \? !\(c\.y < -rad && R - rad >= uSteps\.y\)/,
    'on the steps a circle is drawn only on the top step: the narrow steps carry none (the user, 17 Nov)')
})

test('each of the steps\' measures is as long as its number', () => {
  const len = m => Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1], m.to[2] - m.from[2])
  for (const k of ['start', 'depth', 'height', 'top']) assert.ok(Math.abs(len(stepsMeasure(STEPS, k)) - stepsValue(STEPS, k)) < 1e-9, k)
  assert.ok(stepsMeasure(STEPS, 'start').to[2] < 0, 'the steps rise behind the pool, toward -z, where the arches stand')
})

// ——— the gateway and its lime ripples (17 Nov) ———
import { gatewayShape, opening, rippleFronts, rippleSpacing } from '../src/gateway/gateway.ts'
const RIPPLES = { gap: 1, speed: 150, tail: 16, behind: 40, ahead: 200 }

test('the gateway carries on from its arch\'s opening: as wide, as tall, from its door, no lines', () => {
  const d = gatewayShape(ARCH, 160), o = opening(ARCH)
  const xs = [], ys = [], zs = []
  for (let i = 0; i < d.length; i += FLOATS) {
    xs.push(d[i]); ys.push(d[i + 1]); zs.push(d[i + 2])
    assert.deepEqual([...d.slice(i + 10, i + 14)], [0, 0, 0, 0], 'a face of the gateway asks for an edge line')
  }
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - o.width) < 1e-4, 'as wide as the opening: the arch less its two posts')
  assert.ok(Math.abs(Math.max(...ys) - o.height) < 1e-4, 'as tall as the opening: the arch less its beam')
  assert.equal(Math.min(...zs), ARCH.distance, 'it begins at the arch\'s door, its upright back')
  assert.ok(Math.abs(Math.max(...zs) - (ARCH.distance + 160)) < 1e-4, 'as deep as asked')
})

test('a gateway is not on the land: it dissolves by depth, not by the edge of the world', () => {
  assert.match(FRAG_S, /float gone = uDeep > 0\.5 \? 0\.0 : goneAt\(vWorld\.xz\);/)
  assert.match(FRAG_S, /float thin = clamp\(depth\/max\(uDeep, 1\.0\), 0\.0, 1\.0\);/, 'whole at the door, nothing left at its depth')
})

test('the lime ripples: one passes the character every gap; where they start comes from Eidos', () => {
  assert.equal(rippleSpacing(RIPPLES), 150, 'at 150 m/s past him, one every second is 150 metres apart')
  assert.doesNotMatch(source['glsl.ts'], /smoothstep\(-40\.0, -28\.0, r\)/, 'the 40 metres behind him is Eidos\'s ripples.behind')
  assert.match(source['glsl.ts'], /smoothstep\(-uWaveBehind, -uWaveBehind \+ 12\.0, r\)/)
  for (const run of [0, 37.5, 75, 149]) {
    const fronts = rippleFronts(RIPPLES, run)
    assert.ok(fronts.every(f => f > -RIPPLES.behind - 150 && f <= RIPPLES.ahead), 'only between behind and ahead')
    fronts.slice(1).forEach((f, i) => assert.ok(Math.abs(f - fronts[i] - 150) < 1e-9, 'one spacing apart'))
  }
  // they run ahead: a moment later every front is further on
  assert.ok(rippleFronts(RIPPLES, 10)[0] > rippleFronts(RIPPLES, 0)[0])
})

// ——— the arches follow Mero (decision 12) ———
import { archPlaces } from '../src/arch/arch.ts'

test('one arch for each system Mero holds: five at the world\'s places, a sixth with nothing new', () => {
  const five = ['noi.mer', 'noi.inv', 'noi.gov', 'noi.eio', 'noi.hyp']
  assert.deepEqual(archPlaces(five).map(p => p.degrees), [-72, -36, 0, 36, 72], 'five stand where the world has them')
  const six = archPlaces([...five, 'noi.new'])
  assert.equal(six.length, 6, 'a sixth system gets an arch')
  assert.ok(six.every(p => Math.abs(p.degrees) <= 72), 'all on the half circle')
  assert.deepEqual(archPlaces(['a', 'b', 'c']).map(p => p.degrees), [-36, 0, 36], 'fewer keep the gap, centred')
})

// ——— the characters (17 Nov) ———
import { characterLine, CHARACTER_MEASURES } from '../src/character-drawing/character-measures.ts'
const ASSETS = fileURLToPath(new URL('../assets/characters/', import.meta.url))
const glbJson = f => { const b = readFileSync(f); assert.equal(b.readUInt32LE(0), 0x46546c67, `${f} is a .glb`); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) }

test('three characters, small copies: no pictures packed in, their clips, the same joints', () => {
  const want = { clay: ['Walking', 'Running'], mannequin: ['Walking', 'Running'], 'fairy-bot': ['Walking', 'Running'] }
  for (const [name, clips] of Object.entries(want)) {
    const file = join(ASSETS, name, `${name}.glb`), j = glbJson(file)
    assert.ok(statSync(file).size < 6e6, `${name} is a small copy`)
    assert.ok(statSync(join(ASSETS, name, `${name}.jpg`)).size < 4e5, `${name}'s look is small`)
    assert.ok(!j.images?.length, `${name} has no pictures packed in: its look is put on`)
    assert.ok(!j.animations.some(a => /^Idle/i.test(a.name)), `${name} carries no idle clip: they stand plainly (the user, 17 Nov)`)
    for (const c of clips) assert.ok(j.animations.some(a => a.name === c), `${name} has ${c}`)
    for (const joint of ['mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:Spine2'])
      assert.ok(j.nodes.some(n => n.name === joint), `${name} has ${joint}, which standing and the wings use`)
  }
  assert.ok(statSync(join(ASSETS, 'fairy-bot', 'wings.glb')).size < 4e6, 'the Fairy Bot\'s wings')
  // Standing is no clip (the user, 17 Nov: not the resting idle with a bent leg, "just standing"): the pose the rig
  // was made in, legs straight, arms turned down to the sides.
  assert.doesNotMatch(source['characters.ts'].replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ''), /Idle_?\d/, 'no idle clip is asked for')
  assert.match(source['characters.ts'], /if \(motion === 'stand'\) \{ this\.stand\(c\); continue \}/, 'standing plays no clip')
  assert.match(source['characters.ts'], /sk\.skeleton\.pose\(\)/, 'standing starts from the pose the rig was made in')
  assert.match(source['characters.ts'], /new THREE\.Vector3\(side \* STANDING\.out, -1, 0\)/, 'and turns each arm down to the side')
})

test('three.js draws the characters and nothing else (decision 7)', () => {
  const users = Object.entries(source).filter(([, t]) => /from 'three'|import\('three'\)|import\('three\//.test(t)).map(([f]) => f)
  assert.deepEqual(users, ['characters.ts'], 'only the characters ask for three.js')
})

test('each character measure: a length is a line as long as its number; a speed or a time is words', () => {
  const V = { height: 1.8, stepUp: 0.45, walk: 1.4, run: 4, fly: 5, rise: 6, jump: 1.2, hover: 0.4, ceiling: 100, jumpHeight: 8, jumpTime: 0.6,
    topSpeed: 135, catchUp: 0.8, leastIn: 1.6, dark: 0.8, onFoot: 6, eyeJump: 3.8, chase: 3.6, eyeGateway: 3.4 }
  const len = m => Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1], m.to[2] - m.from[2])
  for (const [k, m] of Object.entries(CHARACTER_MEASURES)) {
    const line = characterLine(V, k)
    if (m.unit === 'm') { assert.ok(line && Math.abs(len(line) - V[k]) < 1e-9, k); if (m.group === 'eye') assert.ok(line.to[2] < 0, `${k}: the eye is behind him`) }
    else assert.equal(line, null, `${k} is a ${m.unit === 's' ? 'time' : 'speed'}: words, no line`)
  }
})
