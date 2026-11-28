// The Super Snail, a concept (27 Nov 2026). The user: "Create an animated concept art of a super hero Snail ...
// The snail can have a booster that travels with boost, as a booster equipment attached to the snail. The boost is
// generated as the shell rotates and based on its acceleration and speed. The snail travels on the platform that's
// built in noi." These are the rules of what the snail does (snail.ts) and of the page that shows it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BODY, BOOST, FASTEST, FASTEST_WIND_UP, SHELL, SHOTS, SHOW, SHOW_LASTS, TRAVEL, atRest, boostOf, later, shotFor, showDrive, spinShare } from '../app/hyperbase/world/snail/snail.ts'
import { BASE_TILE } from '@noi/eio-3d'

const SNAIL = fileURLToPath(new URL('../app/hyperbase/world/snail/', import.meta.url))
const read = name => readFileSync(SNAIL + name, 'utf8')
const code = text => text.replace(/\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm, '')
const near = (a, b, by = 1e-9) => Math.abs(a - b) <= by

/** The snail after so many seconds of one drive, a picture at a time. */
function after(snail, drive, seconds) {
  for (let left = seconds; left > 1e-9; left -= 1 / 60) snail = later(snail, drive, Math.min(left, 1 / 60))
  return snail
}

test('at rest the shell idles, the engines burn nothing, and the snail crawls', () => {
  const snail = atRest()
  assert.equal(snail.spin, SHELL.idle)
  assert.equal(snail.boost, 0)
  assert.equal(snail.speed, TRAVEL.crawl)
  const still = after(snail, 0, 10)
  assert.ok(near(still.spin, SHELL.idle) && still.boost === 0 && near(still.speed, TRAVEL.crawl), 'left alone it stays so')
  assert.ok(near(still.y, 10 * TRAVEL.crawl, 1e-6), 'and has crawled on')
})

test('the boost comes from how fast the shell turns', () => {
  assert.equal(boostOf(SHELL.idle, 0), 0, 'an idling shell gives none')
  assert.ok(near(boostOf(SHELL.top, 0), BOOST.fromSpeed), 'a shell at its top speed gives its share')
  const half = (SHELL.idle + SHELL.top) / 2
  assert.ok(near(boostOf(half, 0), BOOST.fromSpeed / 2), 'half-way there gives half of it')
  assert.ok(boostOf(3, 0) > boostOf(2, 0) && boostOf(2, 0) > boostOf(1, 0), 'the faster, the more')
})

test('and from how fast its turning grows: a shell that is gaining speed gives more, one that slows gives none for it', () => {
  const spin = 2
  assert.ok(boostOf(spin, FASTEST_WIND_UP) > boostOf(spin, FASTEST_WIND_UP / 2), 'gaining faster gives more')
  assert.ok(boostOf(spin, FASTEST_WIND_UP / 2) > boostOf(spin, 0), 'gaining at all gives more than turning steadily')
  assert.ok(near(boostOf(spin, FASTEST_WIND_UP) - boostOf(spin, 0), BOOST.fromSpeedingUp), 'at the most, its whole share')
  assert.equal(boostOf(spin, 0 - FASTEST_WIND_UP), boostOf(spin, 0), 'slowing adds nothing and takes nothing')
  assert.equal(boostOf(SHELL.top, FASTEST_WIND_UP), 1, 'and it is never more than all the engines can burn')
  assert.ok(BOOST.fromSpeed + BOOST.fromSpeedingUp > 1, 'so the engines burn fullest while the shell winds up')
})

test('driven, the shell winds up to its top speed in its own time, and the burst is strongest on the way', () => {
  let snail = atRest()
  let most = 0
  let fullAt = null
  for (let t = 0; t < SHELL.windUp + 2; t += 1 / 60) {
    const before = snail
    snail = later(snail, 1, 1 / 60)
    assert.ok(snail.spin >= before.spin, 'it never slows while driven')
    assert.ok(snail.speedingUp <= FASTEST_WIND_UP + 1e-9, 'it gains speed no faster than it can')
    most = Math.max(most, snail.boost)
    if (fullAt === null && snail.boost === 1) fullAt = t
  }
  assert.ok(near(snail.spin, SHELL.top, 0.01), `it turns ${snail.spin} turns a second in the end`)
  assert.equal(most, 1, 'the engines burn all they can during the wind-up')
  assert.ok(fullAt !== null && fullAt < SHELL.windUp, 'before the shell has reached its top speed')
  assert.ok(near(snail.boost, BOOST.fromSpeed, 0.01), 'and settle to what its speed alone gives')
  assert.ok(near(spinShare(snail.spin), 1, 0.01))
})

test('let go, the shell runs down slowly, as a flywheel does, and the boost goes with it', () => {
  let snail = after(atRest(), 1, 8)
  const top = snail
  snail = after(snail, 0, SHELL.runDown / 2)
  assert.ok(snail.spin < top.spin && snail.spin > SHELL.idle + 0.5, 'half-way down it still turns well')
  assert.ok(snail.boost > 0 && snail.boost < top.boost, 'and still gives some boost')
  assert.ok(snail.speedingUp < 0, 'its turning is slowing')
  snail = after(snail, 0, SHELL.runDown + 6)
  assert.ok(near(snail.spin, SHELL.idle, 0.01), 'in the end it idles')
  assert.ok(snail.boost < 0.01, 'with no boost')
  assert.ok(SHELL.runDown > SHELL.windUp, 'it runs down more slowly than it winds up')
})

test('the boost becomes speed: more boost, faster; and drag brings it back to a crawl', () => {
  const burst = after(atRest(), 1, 12)
  const steady = TRAVEL.crawl + (TRAVEL.thrust * BOOST.fromSpeed) / TRAVEL.drag
  assert.ok(near(burst.speed, steady, 0.5), `driven steadily it goes ${burst.speed} m/s`)
  assert.ok(burst.speed > 10 * TRAVEL.crawl, 'many times a crawl')
  assert.ok(burst.speed < FASTEST, 'and less than the fastest, which only full boost held for good would reach')
  assert.ok(near(FASTEST, TRAVEL.crawl + TRAVEL.thrust / TRAVEL.drag))
  const glided = after(burst, 0, 30)
  assert.ok(near(glided.speed, TRAVEL.crawl, 0.01), 'let go for long, it crawls again')
  // it never goes back along the platform
  let snail = atRest()
  for (let t = 0; t < SHOW_LASTS; t += 1 / 60) {
    const next = later(snail, showDrive(t), 1 / 60)
    assert.ok(next.y > snail.y, 'it goes on')
    snail = next
  }
})

test('a long pause moves nothing far: one picture is a tenth of a second at the most', () => {
  const [a, b] = [later(atRest(), 1, 0.1), later(atRest(), 1, 60)]
  assert.deepEqual(a, b)
  assert.deepEqual(later(atRest(), 1, 0), atRest(), 'and no time moves nothing')
})

test('the show it plays by itself: a crawl, a burst, a glide, a shorter burst, a glide; then again', () => {
  assert.deepEqual(SHOW.map(part => part.drive), [0, 1, 0, 1, 0])
  assert.ok(near(SHOW_LASTS, SHOW.reduce((sum, part) => sum + part.for, 0)))
  assert.equal(showDrive(0), 0, 'it begins with the crawl')
  assert.equal(showDrive(SHOW[0].for + 0.01), 1, 'then the shell is driven')
  assert.equal(showDrive(SHOW_LASTS + 0.5), showDrive(0.5), 'and it starts again')
  assert.ok(SHOW[1].for > SHOW[3].for, 'the second burst is the shorter')
  // by the end of the show it has all but stopped burning, so the next crawl begins as one
  let snail = atRest()
  for (let t = 0; t < SHOW_LASTS; t += 1 / 60) snail = later(snail, showDrive(t), 1 / 60)
  assert.ok(snail.boost < 0.2, `it ends with ${snail.boost} of its boost`)
})

test('the eye takes its face while it crawls, its side as a burst begins, and follows from behind at speed', () => {
  assert.equal(shotFor(atRest(), 0), 'hero')
  const lit = after(atRest(), 1, 1)
  assert.equal(shotFor(lit, 1), 'side', 'the shell is seen to wind up and the engines to light')
  const away = after(atRest(), 1, 6)
  assert.equal(shotFor(away, 6), 'chase')
  // gliding fast with the engines out, it is still followed
  assert.equal(shotFor({ ...away, boost: 0 }, 0), 'chase')
  for (const [name, shot] of Object.entries(SHOTS)) {
    assert.ok(shot.from[2] > 0, `${name}: the eye is above the platform`)
    assert.ok(shot.sees > 10 && shot.sees < 60, `${name} sees ${shot.sees} degrees`)
  }
  assert.ok(SHOTS.hero.from[1] > 0 && SHOTS.chase.from[1] < 0, 'before it for its face, behind it for the chase')
})

test('it is half a tile long, and its shell stands over its back', () => {
  assert.ok(BODY.long > BASE_TILE.size.y * 0.4 && BODY.long < BASE_TILE.size.y * 0.6, `${BODY.long} m on a ${BASE_TILE.size.y} m tile`)
  assert.ok(BODY.shell > BODY.tall, 'the shell is the larger part of it')
  assert.ok(BODY.sunk < BODY.shell)
})

test('a concept, not an element: the world\'s platform and Eidos\'s own shapes, colours only from Eidos\'s roles', () => {
  const view = code(read('SnailView.tsx'))
  const drawing = code(read('drawSnail.ts'))
  assert.match(view, /makeElement\(w, WAVE_PLATFORM, colour\)/, 'it travels on the world\'s own wave platform, as Eidos draws it')
  assert.match(view, /stripOf\(WAVE_PLATFORM\)/, 'along the strip the platform is laid on')
  assert.match(view, /import \{ Badge \} from '@noi\/eio-react'/, 'its words are Eidos\'s Badge')
  assert.match(drawing, /kind: 'astroid'/, 'its fans and emblems are Eidos\'s astroid')
  assert.match(drawing, /kind: 'ring'/, 'and its intakes Eidos\'s ring')
  assert.match(drawing, /makeElement\(world, element, colourOf\)/, 'made by Eidos\'s own drawing')
  for (const name of readdirSync(SNAIL).filter(f => /\.tsx?$/.test(f))) {
    const text = code(read(name))
    assert.doesNotMatch(text, /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|\b0x[0-9a-f]{6}\b|\b(rgba?|hsla?|oklch)\(/i, `${name} writes a colour of its own`)
    assert.doesNotMatch(text, /['"`]--eio-color-/, `${name} names a colour's variable by hand, not a role by its path`)
    assert.doesNotMatch(text, /getContext\(|\b(vertexShader|fragmentShader)\b/, `${name} draws by hand: three.js draws all of it`)
    assert.doesNotMatch(text, /\bscene\.(add|attach)\(/, `${name} puts a thing straight into the scene, not into xyz`)
    assert.doesNotMatch(text, /camera\.position\.set\((?!\.\.\.toThree\()/, `${name} places the eye in three.js's order`)
    assert.doesNotMatch(text, /\.lookAt\(/, `${name} aims a thing in three.js's order`)
  }
  assert.doesNotMatch(code(read('snail.ts')), /from 'three|@noi\/eio-3d/, 'what the snail is and does knows nothing of how it is drawn')
  assert.doesNotMatch(readFileSync(fileURLToPath(new URL('../../../packages/eio-3d/src/index.ts', import.meta.url)), 'utf8'), /snail/i, 'Eidos does not hold it: it is not an element')
})
