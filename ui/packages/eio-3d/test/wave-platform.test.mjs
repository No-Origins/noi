// The base platform as a wave and a circular twist (issue 130): the user's rules for it, as tests (moved here from
// the Explorer with the element, 23 Nov 2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ASTROID, BASE_TILE, ELEMENTS, WAVE, WAVE_PLATFORM, waveFrame as frameOf, waveLength as lengthOf, waveSize as sizeOf } from '../src/index.ts'

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

test('the wave platform is in the gallery, beside the flat and the Möbius platforms', () => {
  assert.ok(ELEMENTS.includes(WAVE_PLATFORM))
  assert.ok(ELEMENTS.some(e => e.id === 'base-platform') && ELEMENTS.some(e => e.id === 'mobius-platform'))
  assert.equal(WAVE_PLATFORM.shape.kind, 'laid')
})

// the rules for the wave platform (its copy curling toward low x was removed at the user's word, 23 Nov 2026)
for (const [PLATFORM, SHAPE] of [[WAVE_PLATFORM, WAVE]]) {
  test(`${PLATFORM.id}: it is 21 tiles across and laid from the base tile and the astroid as they are, on both faces`, () => {
    assert.equal(SHAPE.across, 21 * BASE_TILE.size.x)
    const things = PLATFORM.shape.things
    assert.ok(things.every(t => t.element === BASE_TILE || t.element === ASTROID))
    const rows = lengthOf(SHAPE) / BASE_TILE.size.y
    assert.equal(things.filter(t => t.element === BASE_TILE).length, 2 * 21 * rows)
  })

  test(`${PLATFORM.id}: every tile keeps its square: the strip is never stretched, only bent`, () => {
    for (let y = 5; y < lengthOf(SHAPE); y += 10) for (let x = -100; x <= 100; x += 10) {
      const f = frameOf(SHAPE, x, y)
      for (const [a, b] of [[f.across, f.along], [f.along, f.up], [f.up, f.across]]) assert.ok(Math.abs(dot(a, b)) < 1e-9)
      for (const w of [f.across, f.along, f.up]) assert.ok(Math.abs(dot(w, w) - 1) < 1e-9)
      // the next tile across and along is one tile away, less the little a bend takes (the strip lies aslant, so both bend)
      if (x < 100) { const d = gap(f.at, frameOf(SHAPE, x + 10, y).at); assert.ok(d <= 10 + 1e-6 && d > 9.9, `across at x ${x}, y ${y}: ${d}`) }
      if (y + 10 < lengthOf(SHAPE)) { const d = gap(f.at, frameOf(SHAPE, x, y + 10).at); assert.ok(d <= 10 + 1e-6 && d > 9.9, `at x ${x}, y ${y}: ${d}`) }
    }
  })

  test(`${PLATFORM.id}: it begins just before it starts to curve: its first row flat, facing up, running along y`, () => {
    assert.equal(SHAPE.runway, 0, 'the 600 m flat start is chopped off')
    for (const y of [0]) for (const x of [-105, 0, 105]) {
      const f = frameOf(SHAPE, x, y)
      assert.ok(f.up.z > 1 - 1e-9 && f.along.y > 1 - 1e-9 && f.across.x > 1 - 1e-9)
      assert.ok(Math.abs(f.at.z - frameOf(SHAPE, 0, 0).at.z) < 1e-9)
    }
  })

  test(`${PLATFORM.id}: the circular twist passes beside itself, never through itself`, () => {
    const pts = []
    for (let y = 0; y <= lengthOf(SHAPE); y += 10) for (let x = -105; x <= 105; x += 15) pts.push({ y, p: frameOf(SHAPE, x, y).at })
    const cell = 40, grid = new Map()
    let nearest = Infinity
    for (const q of pts) {
      const k = [q.p.x, q.p.y, q.p.z].map(v => Math.floor(v / cell))
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++)
        for (const o of grid.get(`${k[0] + i},${k[1] + j},${k[2] + l}`) ?? []) if (Math.abs(o.y - q.y) > 150) nearest = Math.min(nearest, gap(o.p, q.p))
      const key = k.join()
      if (!grid.has(key)) grid.set(key, [])
      grid.get(key).push(q)
    }
    assert.ok(nearest > 30, `the nearest far parts are ${nearest} m apart`)
  })

  test(`${PLATFORM.id}: it stands by the middle of its base`, () => {
    const s = sizeOf(SHAPE)
    assert.deepEqual(PLATFORM.size, { x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, z: Math.round(s.z * 10) / 10 })
  })
}
