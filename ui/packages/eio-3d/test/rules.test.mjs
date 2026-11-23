// The rules of @noi/eio-3d, as tests (17 Nov 2026; the first world's own rules went with it on 23 Nov, and the new
// world's elements came in the same day).
// 1 · Colours come only from Eidos: no colour of its own anywhere in the package.
// 2 · An element's own numbers are its own, named in its own folder; only the shared measures (the tile, the stud)
//     and an element's registered size or steps come from Eidos (23 Nov 2026, the user's decision on issue 131;
//     until then "none of the new world's numbers is written in the code of its elements").
// 3 · three.js draws every element (23 Nov 2026; until then "three.js draws the characters and nothing else",
//     decision 7 of 17 Nov, which the user's "three.js for everything" of 21 Nov replaced): the package writes
//     no drawing code of its own, and an element takes three.js from the world it is drawn into.
// 4 · Everything of an element goes into the world's xyz, in the user's x, y, z; nothing is put in three.js's
//     own order.
// The characters (elements since 23 Nov) keep these rules too: small copies with their clips and the joints
// standing uses; every measure as long as its number.
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
/** The new world's files: the shared drawing, the elements and the character drawing (the characters joined on
 * 23 Nov). All but the characters' measures (character-measures.ts): their words and the lines a page may draw
 * beside a character are still the first world's (y up), kept as they were till a page shows them again. */
const world = Object.entries(source).filter(([file]) => file !== 'character-measures.ts')

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

// ——— 2 · what Eidos holds, and what an element keeps as its own (23 Nov, issue 131) ———
// THE USER'S DECISION (23 Nov 2026), after 165 numbers had been put to Mero one record each: "if we keep having
// individual values registered each time, then the registry just becomes bloated with numbers rather than creating
// reusable values"; "there is no point in saving individual part sizes of drone, right?"; "the stage might need
// individual steps with width, height, and length, but a drone will have a scale"; "studs should have universally
// one single size". So an element's part sizes, proportions, offsets and movements are its own numbers, named in
// its own folder and approved with its fingerprint; Eidos holds only what fits elements together or is the world's
// own (the tile, the stud, the one change of state), an element's registered size, and its steps.
import { tokens } from '../../eio-tokens/tokens.ts'

/** Where each of the world's groups in Eidos may be read: the shared measures by the element that stands for them
 * and the shared drawing (which every element uses, and which may not use an element); an element's own size and
 * steps in its own folder only. */
const READ_IN = {
  tile: ['base-tile', 'drawing'], // the world's grid unit: the base tile is one tile; the drawing lays strips in tiles
  stud: ['drawing'], // the one size of stud (drawing/studs.ts), whatever an element carries
  states: ['drawing'], // the world's one change of state
  character: ['character-drawing'],
  drone: ['drone'],
  stage: ['stage'],
  'base-platform': ['base-platform'],
  'mobius-platform': ['mobius-platform'],
}
const folderOf = file => files().find(f => basename(f) === file)?.slice(SRC.length).split('/')[0]
const PATH = /\bnoi\.eio\.world\.([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)\b/g

test('2 · Eidos holds the shared measures and each element\'s size and steps, and each is read where it belongs', () => {
  const read = new Set()
  for (const [file, text] of world) {
    for (const [path, group] of uncommented(text).matchAll(PATH)) {
      read.add(path)
      assert.ok(READ_IN[group], `${file} reads ${path}: Eidos holds no group ${group} for the world`)
      assert.ok(READ_IN[group].includes(folderOf(file)), `${file} reads ${path}, which belongs to ${READ_IN[group].join(' and ')}`)
    }
  }
  // every value Eidos holds for the world is read by the package: a record nothing reads is not kept
  const held = Object.entries(tokens.world).flatMap(([group, values]) => Object.keys(values).map(name => `noi${'.'}eio.world.${group}.${name}`))
  for (const path of held) assert.ok(read.has(path), `Eidos holds ${path}, but no element reads it`)
  for (const group of Object.keys(READ_IN)) assert.ok(group in tokens.world, `the rule names ${group}, which Eidos does not hold`)
})

test('2 · the stud\'s pitch, and an element\'s registered size, are never written as a number', () => {
  // The stud's pitch fits pieces together: a number of its size written in an element's code would drift from it
  // (the shared drawing, which reads it, has tuning of its own that may equal it by chance, a light's share of 0.3
  // for one). The tile's size is read only where it belongs (above): as a number, 10 is too common to refuse (a
  // wing's lean of 10 degrees). An element's own registered size (the drone's Base size, a platform's tiles) is
  // not written in its own folder either. Plain numbers (none, a half, one to four) and the code's own precision
  // (to the tenth or the thousandth) are not counted.
  const plain = new Set([0, 0.5, 1, 2, 3, 4])
  const everywhere = [tokens.world.stud.pitch].filter(n => !plain.has(n))
  const own = Object.fromEntries(Object.entries(READ_IN).map(([group, where]) => [group, where.length === 1 && group !== 'stud' && group !== 'states'
    ? Object.values(tokens.world[group]).filter(n => typeof n === 'number' && !plain.has(n)) : []]))
  const precision = /\* 10\) \/ 10|\* 1000\) \/ 1000/
  for (const [file, text] of world) {
    const folder = folderOf(file)
    const refused = new Set([...(folder === 'drawing' ? [] : everywhere), ...Object.entries(own).filter(([group]) => READ_IN[group][0] === folder).flatMap(([, ns]) => ns)])
    const lines = uncommented(text).replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "''").split('\n').filter(line => !precision.test(line))
    for (const line of lines) {
      for (const [literal] of line.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?:e-?\d+)?(?![\w.])/g)) {
        assert.ok(!refused.has(Number(literal)), `${file} writes ${literal}, a measure Eidos holds: "${line.trim()}"`)
      }
    }
  }
})

test('2 · an element\'s steps are read as one record of named steps', () => {
  // A scale or the sizes one may choose are one record of named steps in Eidos (the kind "steps", 23 Nov), not a
  // record a number: the drone's scale, the stage's width and breadth and the heights of its base.
  const sets = Object.entries(tokens.world).flatMap(([group, values]) => Object.entries(values).filter(([, v]) => Array.isArray(v)).map(([name]) => `${group}.${name}`))
  assert.deepEqual(sets.sort(), ['drone.scale', 'stage.base-height', 'stage.width-and-breadth'])
  assert.deepEqual(tokens.world.drone.scale.map(s => [s.name, s.share]), [['Small', 0.5], ['Base', 1], ['Medium', 1.5], ['Large', 2]], 'the user\'s four steps, "Base" the 1 step')
  for (const [file, text] of world) {
    for (const [, path] of uncommented(text).matchAll(/\bsteps\('noi\.eio\.world\.([a-z0-9.-]+)'\)/g)) assert.ok(sets.includes(path), `${file} reads ${path} as steps`)
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
  // world opens: its files import three.js's types only. The one thing of three.js the package asks for itself is
  // the loader for model files, which three.js keeps outside its core: the character drawing asks for it when a
  // character is first drawn, and it draws with the world's own three.js (one core for both).
  const loads = Object.entries(source).flatMap(([f, t]) => [...uncommented(t).matchAll(/^\s*import\s+(?!type\b)[^\n]*from\s+'(three[^']*)'|\bawait import\('(three[^']*)'\)/gm)].map(m => `${f} ${m[1] ?? m[2]}`))
  assert.deepEqual(loads, ['characters.ts three/examples/jsm/loaders/GLTFLoader.js'], 'only the loader for model files, and only when a character is drawn')
  assert.match(uncommented(source['characters.ts']), /const THREE = world\.three/, 'a character is drawn with the world\'s three.js')
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
  // was made in, legs straight, arms turned down to the sides; a walk or a run fades back to it.
  const drawing = uncommented(source['characters.ts'])
  assert.doesNotMatch(drawing, /Idle_?\d/, 'no idle clip is asked for')
  assert.match(drawing, /const CLIPS: Record<Motion, string \| null> = \{ stand: null, walk: 'Walking', run: 'Running' \}/, 'standing plays no clip')
  assert.match(drawing, /for \(const sk of skinned\) sk\.skeleton\.pose\(\)/, 'standing starts from the pose the rig was made in')
  assert.match(drawing, /new THREE\.Vector3\(side \* ARMS\.out, -1, 0\)\.transformDirection\(holder\.matrixWorld\)/, 'and turns each arm down to its own side, as it stands in the world')
  assert.match(drawing, /loaded\.playing\?\.fadeOut\(how\.change\)/, 'a clip fades back to the pose it started from')
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
