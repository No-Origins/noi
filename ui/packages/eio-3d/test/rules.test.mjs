// The rules of @noi/eio-3d, as tests (17 Nov 2026; the first world's own rules went with it on 23 Nov).
// 1 · Colours come only from Eidos: no colour of its own anywhere in the package.
// The characters: small copies with their clips and the joints standing uses; three.js asked for only where
// they are drawn; every measure as long as its number.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const files = (dir = SRC) => readdirSync(dir).flatMap(f => statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)])
// Each file by its name: every name in the package is its own, wherever its folder is.
const source = Object.fromEntries(files().map(f => [basename(f), readFileSync(f, 'utf8')]))
assert.equal(Object.keys(source).length, files().length, 'two files of the package share a name')

test('1 · no colour of its own: colours come from Eidos', () => {
  for (const [file, text] of Object.entries(source)) {
    assert.doesNotMatch(text, /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i, `${file} writes a colour`)
    assert.doesNotMatch(text, /\b0x[0-9a-f]{6}\b/i, `${file} writes a colour`)
    assert.doesNotMatch(text, /\b(rgba?|hsla?|oklch)\(/i, `${file} writes a colour`)
  }
})

// ——— the characters (17 Nov) ———
import { characterLine, CHARACTER_MEASURES, measureWords } from '../src/character-drawing/character-measures.ts'
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
  assert.equal(measureWords(V, 'walk'), 'Walk · 1.4 m/s', 'its words: name, number and unit')
  assert.equal(measureWords(V, 'height'), 'Character height · 1.8 m')
})
