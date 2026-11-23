// The rules of @noi/eio-3d, as tests (17 Nov 2026; the first world's own rules went with it on 23 Nov, and the new
// world's elements came in the same day).
// 1 · Colours come only from Eidos: no colour of its own anywhere in the package.
// 2 · Numbers come only from Eidos: none of the new world's numbers is written in the code of its elements.
// 3 · three.js draws every element (23 Nov 2026; until then "three.js draws the characters and nothing else",
//     decision 7 of 17 Nov, which the user's "three.js for everything" of 21 Nov replaced): the package writes
//     no drawing code of its own, and an element takes three.js from the world it is drawn into.
// 4 · Everything of an element goes into the world's xyz, in the user's x, y, z; nothing is put in three.js's
//     own order.
// The characters: small copies with their clips and the joints standing uses; every measure as long as its
// number.
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
/** Code without its comments (a // after a colon or a backslash is part of an address or a pattern). */
const uncommented = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
/** The new world's files: the shared drawing and the eight elements; not the characters, which join it next. */
const world = Object.entries(source).filter(([file]) => !files().find(f => basename(f) === file)?.includes('/character-drawing/'))

test('1 · no colour of its own: colours come from Eidos', () => {
  for (const [file, text] of Object.entries(source)) {
    assert.doesNotMatch(text, /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i, `${file} writes a colour`)
    assert.doesNotMatch(text, /\b0x[0-9a-f]{6}\b/i, `${file} writes a colour`)
    assert.doesNotMatch(text, /\b(rgba?|hsla?|oklch)\(/i, `${file} writes a colour`)
  }
  // and every colour an element names is a role of Eidos, read by its path
  // (eidos.ts is the one place a role's path becomes the variable the page gives its colour by)
  for (const [file, text] of world.filter(([f]) => f !== 'eidos.ts')) assert.doesNotMatch(uncommented(text), /['"`]--eio-color-/, `${file} names a colour's variable by hand, not a role by its path`)
})

// ——— 2 · the new world's numbers (23 Nov) ———
import { tokens } from '../../eio-tokens/tokens.ts'

test('2 · none of the new world\'s numbers is written in the code: they come from Eidos', () => {
  const characters = new Set(['character', 'movement', 'flight', 'eye'])
  // Every number Eidos holds for the new world, but none, a half, one, two, three and four: the code counts the
  // corners of a square, halves a width, doubles a radius, with these.
  const numbers = new Set(Object.entries(tokens.world).filter(([group]) => !characters.has(group)).flatMap(([, values]) => Object.values(values)))
  for (const plain of [0, 0.5, 1, 2, 3, 4]) numbers.delete(plain)
  // What is not a number of the world though it may equal one: a way or a place (no kind of value holds them),
  // and the code's own precision. Each such line, by what it says.
  const own = [
    /const TOWARD = /, // the way the eye first stands from an element (element.ts)
    /sunFrom: /, // the way the sun shines from (light.ts)
    /at: \{ x: -?\d+, y: -?\d+, z: \d+ \} \}/, // where a lamp of the mirrored room is (make.ts)
    /const LONGEST_STEP = /, // the longest step one picture moves a thing on by (make.ts)
    /\(h \/ 6\)/, // how the Möbius strip's middle line is worked out, a metre at a time (bend.ts)
    /\* 10\) \/ 10/, // a size or a place said to the tenth of a metre
  ]
  for (const [file, text] of world) {
    const lines = uncommented(text).replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "''").split('\n').filter(line => !own.some(re => re.test(line)))
    for (const line of lines) {
      for (const [literal] of line.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?:e-?\d+)?(?![\w.])/g)) {
        assert.ok(!numbers.has(Number(literal)), `${file} writes ${literal}, a number Eidos holds: "${line.trim()}"`)
      }
    }
  }
})

// ——— 3 · three.js draws every element (23 Nov; decision 7 replaced) ———
test('3 · three.js draws every element: the package writes no drawing code of its own', () => {
  for (const [file, text] of Object.entries(source)) {
    const code = uncommented(text)
    assert.doesNotMatch(code, /getContext\(/, `${file} asks a canvas for a drawing context of its own`)
    assert.doesNotMatch(code, /\bgl\.(draw|bind|use|create|buffer|vertex)[A-Z]/, `${file} draws by hand`)
    assert.doesNotMatch(code, /\b(vertexShader|fragmentShader|gl_Position|gl_FragColor)\b/, `${file} writes a program for the graphics card by hand`)
  }
  // An element's drawing takes three.js from the world it is drawn into, so no page carries three.js before the
  // world opens: its files import three.js's types only. Only the characters' painter loads three.js itself,
  // until the characters join the new world.
  const loads = Object.entries(source).filter(([, t]) => /^\s*import\s+(?!type\b)[^\n]*from\s+'three[/']|\bawait import\('three[/']/m.test(uncommented(t))).map(([f]) => f)
  assert.deepEqual(loads, ['characters.ts'], 'only the characters\' painter loads three.js itself')
  assert.match(uncommented(source['make.ts']), /const THREE = world\.three/, 'an element is made with the world\'s three.js')
  assert.match(uncommented(source['light.ts']), /const THREE = world\.three/, 'and lit with it')
  for (const name of ['make.ts', 'space.ts']) assert.match(uncommented(source[name]), /from 'three\/webgpu'|import\('three\/webgpu'\)/, `${name}: the world is drawn by three.js's newer renderer, with WebGPU where the browser has it`)
})

// ——— 4 · everything goes into xyz (21 Nov, issue 117) ———
test('4 · everything of an element goes into the world\'s xyz: nothing is put in three.js\'s own order', () => {
  for (const [file, text] of world) {
    const code = uncommented(text)
    assert.doesNotMatch(code, /\bscene\.(add|attach)\(/, `${file} puts a thing straight into the scene, not into xyz`)
    assert.doesNotMatch(code, /\bcamera\.(position|quaternion|up|fov)\b/, `${file} moves the eye: the page that shows the world does`)
    assert.doesNotMatch(code, /\.lookAt\(/, `${file} aims a thing in three.js's order`)
    assert.doesNotMatch(code, /function (toThree|fromThree)\b/, `${file} has a crossing of its own`)
  }
  assert.match(uncommented(source['light.ts']), /world\.xyz\.add\(sky, sun\)/, 'the light is put into xyz, where the sun is said in the user\'s x, y, z')
  assert.match(uncommented(source['make.ts']), /turned\.quaternion\.copy\(world\.xyz\.quaternion\)/, 'and the mirrored room is turned as xyz is')
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
