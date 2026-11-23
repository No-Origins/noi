// The new 3D world's elements, as tests (21 to 23 Nov 2026; moved here from the Explorer's test/world.test.mjs
// with the elements on 23 Nov). Each test holds the user's words for an element as a rule on its data, and on how
// the shared drawing makes it. What a session picked (sizes read off a picture, every number of a state) is not
// held as a rule; it is a value of Eidos, and the user approves it there. What the page that shows the elements
// does (the gallery, the 3D view, the land) is tested with that page, in the Explorer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ASTROID, BASE_PLATFORM, BASE_PLATFORM_MEASURES, BASE_TILE, CAMERA_MODULE, CLAY, COLOURS_TO_TRY, DRONE, ELEMENTS, FAIRY_BOT, MANNEQUIN, MOBIUS_PLATFORM, STAGE, STUD_GRID, bent, bentFrame,
  bentLength, bentSize, borderWords, calledIn, coloursIn, covers, elementById, firstSight, fitsOn, holesOf, inBorder, inWords, outline, pieceOutline, pieceTurn, poseIn, reachIn, shapeWords, sizeWords, sizedBy,
  surfaceWords, value, withinBorder, withinPieceBorder,
} from '../src/index.ts'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
/** A file of the package, by its place under src/. */
const read = name => readFileSync(SRC + name, 'utf8')
const code = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const between = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
// the base platform: 21 tiles across and 60 long (210 m by 600 m)
const [HALF, LONG] = [BASE_PLATFORM_MEASURES.width / 2, BASE_PLATFORM_MEASURES.length]
const [TILES, ASTROIDS] = [21 * 60, 20 * 59]

// THE WORLD'S ELEMENTS (21 Nov 2026, issue 123 in noi-planning). The user: "the base tile element, where the
// tile, one tile is for 10 meters into 10 meters section, but with 1 meter border radius. The tile has to be
// matte black." And: "Every element should have a gallery, and when I click the element, show the element in a
// [modal] in 3D view so that I can inspect the element." How thick the tile is, the light it is looked at in
// and where the eye first stands are picks, and are not tested as rules.

const TOKENS = readFileSync(new URL('../../eio-tokens/tokens.css', import.meta.url), 'utf8')

test('the base tile is for one 10 m by 10 m section of the land', () => {
  assert.deepEqual([BASE_TILE.size.x, BASE_TILE.size.y], [10, 10])
  const points = outline(BASE_TILE)
  const [xs, ys] = [points.map(p => p.x), points.map(p => p.y)]
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(v => +v.toFixed(9)), [-5, 5, -5, 5], 'it reaches 5 m each way from its middle, and no further')
})

test('the base tile\'s corners are rounded by 1 m', () => {
  assert.equal(BASE_TILE.shape.cornerRadius, 1)
  const points = outline(BASE_TILE)
  for (const p of points) {
    const [ax, ay] = [Math.abs(p.x), Math.abs(p.y)]
    // in a corner: past the straight part of both sides
    if (ax > 4 + 1e-9 && ay > 4 + 1e-9) assert.ok(Math.abs(Math.hypot(ax - 4, ay - 4) - 1) < 1e-9, `the corner point x ${p.x}, y ${p.y} is 1 m from the middle of its corner's circle`)
    // on a side: the straight part runs from -4 to 4
    if (Math.abs(ax - 5) < 1e-9) assert.ok(ay <= 4 + 1e-9, 'the side along y is straight between -4 and 4 only')
    if (Math.abs(ay - 5) < 1e-9) assert.ok(ax <= 4 + 1e-9, 'the side along x is straight between -4 and 4 only')
  }
  for (const corner of [[5, 5], [5, -5], [-5, 5], [-5, -5]]) {
    assert.ok(!points.some(p => Math.hypot(p.x - corner[0], p.y - corner[1]) < 0.41), `no point reaches the sharp corner x ${corner[0]}, y ${corner[1]}`)
  }
  // the ground it covers: the square less what the four rounded corners leave open
  let area = 0
  points.forEach((p, i) => { const q = points[(i + 1) % points.length]; area += (p.x * q.y - q.x * p.y) / 2 })
  assert.ok(Math.abs(area - (100 - (4 - Math.PI))) < 0.01, `it covers ${area.toFixed(3)} of its 100 square metres`)
})

test('the base tile is matte black', () => {
  assert.equal(BASE_TILE.surface.finish, 'matte')
  const value = new RegExp(`${BASE_TILE.surface.colour}:\\s*#([0-9A-Fa-f]{6})`).exec(TOKENS)
  assert.ok(value, `${BASE_TILE.surface.colour} is a colour of Eidos`)
  const channels = [0, 2, 4].map(i => parseInt(value[1].slice(i, i + 2), 16))
  assert.ok(channels.every(c => c <= 0x10) && new Set(channels).size === 1, `#${value[1]} is black`)
  const made = code(read('drawing/make.ts'))
  assert.match(made, /roughness: 1\b/, 'matte: light is scattered evenly')
  assert.match(made, /metalness: 0\b/, 'matte: nothing shines back')
  assert.match(made, /matte\(element\.surface\.colour\)/, 'its colour is the one its data names')
  assert.match(made, /new THREE\.Color\(colourOf\(token\)/, 'as Eidos has it')
})

test('an element is made from its data and nothing else, standing by the middle of its base', () => {
  const made = code(read('drawing/make.ts'))
  assert.match(made, /const points = \(e: WorldElement\) => outline\(e\)/, 'its outline is the data\'s')
  assert.match(made, /points\(element\)/)
  assert.match(made, /depth: element\.size\.z\b/, 'it rises by the data\'s thickness, from z 0')
  assert.doesNotMatch(made, /\.(translate|rotate[XYZ]?|scale)\(/, 'it is not moved, turned or stretched after it is made')
  for (const element of ELEMENTS) {
    // (measured by how far the outline runs each way, since 22 Nov 2026: a thing whose front and back differ,
    // as the camera module's do, has an outline that is as far to low y as to high y without its points being
    // spread evenly)
    const points = outline(element)
    const middle = [(Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2, (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2]
    assert.ok(Math.hypot(...middle) < 1e-9, `the ${element.name}'s outline is round x 0, y 0: the middle of its base is its own middle point`)
    assert.ok(element.size.z > 0, `the ${element.name} has a thickness`)
  }
})

test('every element is data that code reads by its id', () => {
  assert.equal(new Set(ELEMENTS.map(e => e.id)).size, ELEMENTS.length, 'no two elements share an id')
  assert.equal(elementById('base-tile'), BASE_TILE)
  assert.equal(elementById('no-such-thing'), null)
  for (const e of ELEMENTS) assert.ok(e.name && e.says && e.size.x > 0 && e.size.y > 0, `${e.id} says what it is and how big`)
  assert.equal(`${sizeWords(BASE_TILE)}; ${shapeWords(BASE_TILE)}; ${surfaceWords(BASE_TILE)}`, '10 m along x, 10 m along y, 0.2 m thick; corners rounded by 1 m; matte black')
})

// AN ELEMENT'S STATES, AND ITS OWN CONTROLS (22 Nov 2026, issue 127). The user: "I also think each [element] also
// have their own set of controls that are specific to them. For example, the camera is used to view, so a
// drone is used to fly around and hover on the different states of it. So I think we should also cater for
// those states and features of an element." From their words: the drone hovers and flies around; the camera
// views; each element's controls are its own. What else a state can say, the other states (landed, resting),
// which state an element starts in, and every number, are a session's design and are not held as rules.
test('an element has states of its own, which a made thing acts out', () => {
  const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  // the drone: "fly around and hover"
  const drone = Object.fromEntries(DRONE.states.map(s => [s.id, s]))
  assert.ok(drone.hovering && drone.flying, 'the drone has a state in which it hovers and one in which it flies')
  for (const t of [0, 0.3, 1.1, 2.9, 7.7, 31]) {
    const hover = poseIn(drone.hovering, t)
    assert.deepEqual([hover.x, hover.y], [0, 0], 'hovering, it stays over its place')
    assert.ok(hover.z > 0 && hover.spin > 0, 'off the ground, its fans turning')
    const fly = poseIn(drone.flying, t)
    assert.ok(Math.abs(Math.hypot(fly.x, fly.y) - drone.flying.round.radius) < 1e-9, 'flying, it goes round its place')
    assert.ok(fly.z > 0 && fly.spin > 0, 'off the ground, its fans turning')
  }
  assert.ok(far(poseIn(drone.flying, 0), poseIn(drone.flying, 1)) > 0.5, 'it moves on')
  const [first, again] = [poseIn(drone.flying, 0), poseIn(drone.flying, drone.flying.round.every)]
  assert.ok(Math.hypot(first.x - again.x, first.y - again.y) < 1e-9, 'and comes round again, over the same place')
  // it flies front first: its front is toward low y, turned by its heading, and that is the way it is going
  for (const t of [0, 1.3, 4.2]) {
    const [was, is] = [poseIn(drone.flying, t), poseIn(drone.flying, t + 1e-4)]
    const step = Math.hypot(is.x - was.x, is.y - was.y) // along the ground: its rising and sinking is not its way
    const going = { x: (is.x - was.x) / step, y: (is.y - was.y) / step }
    const h = (was.heading * Math.PI) / 180
    assert.ok(going.x * Math.sin(h) + going.y * (0 - Math.cos(h)) > 0.999, 'its front points the way it goes')
  }
  assert.ok(reachIn(DRONE, drone.flying).x > DRONE.size.x && reachIn(DRONE, drone.flying).z > DRONE.size.z, 'flying, it reaches farther than it is large')
  // the camera: "used to view": a state in which a part of it turns from side to side, and the lenses are of that part
  const viewing = CAMERA_MODULE.states.find(s => s.sweep)
  assert.ok(viewing, 'the camera module has a state in which it looks round')
  const head = CAMERA_MODULE.shape.pieces.filter(p => p.part === viewing.sweep.part)
  assert.ok(head.some(p => p.shape.kind === 'ring'), 'what turns is the part its lenses are in')
  assert.ok(!head.some(p => p.name === 'base' || p.name === 'neck'), 'its base and neck stay')
  const turns = [0, 0.7, 1.9, 3.3, 4.6].map(t => poseIn(viewing, t).sweep.turn)
  assert.ok(turns.every(a => Math.abs(a) <= viewing.sweep.by + 1e-9) && new Set(turns.map(a => a.toFixed(3))).size > 3, 'to and fro, never farther than its data says')
  assert.ok(turns.some(a => a > 1) && turns.some(a => a < -1), 'to both sides')
  // with no state a thing is at rest on its place, its spinning pieces at their own speed
  assert.deepEqual(poseIn(undefined, 5), { x: 0, y: 0, z: 0, heading: 0, lean: 0, spin: 1, sweep: null })
  // every state is data with a name and a sentence, and an element's states differ by id
  for (const element of ELEMENTS.filter(e => e.states)) {
    assert.equal(new Set(element.states.map(s => s.id)).size, element.states.length, `the ${element.name}'s states differ`)
    for (const s of element.states) assert.ok(s.name && s.says, `${element.id} ${s.id} says what it is`)
  }
  // a made thing acts its state out, and goes over smoothly from one to another
  const made = code(read('drawing/make.ts'))
  assert.match(made, /const to = poseIn\(state, since\)/, 'each moment its state says where it should be')
  assert.match(made, /body\.position\.set\(is\.x, is\.y, is\.z\)/, 'and the whole of it goes there')
  assert.match(made, /const next = states\.find\(s => s\.id === id\)/, 'a state is chosen by its id')
  assert.match(made, /was = \{ \.\.\.is, swept: new Map\(swept\) \}\s+over = 0\s+state = next\s+since = 0/, 'and the thing goes over to it from where it is')
})

// THROUGH THE CAMERA (23 Nov 2026, issue 127). The user: "Also add Camera view, I mean, through the camera."
// Exactly where the eye is, how wide it sees, and the ground laid under the element meanwhile, are a session's
// picks.
test('one can look through the camera module, from where its lenses are, the way it looks', () => {
  const out = CAMERA_MODULE.lookOut
  assert.ok(out, 'the camera module says where one looks out of it')
  const lenses = CAMERA_MODULE.shape.pieces.filter(p => p.shape.kind === 'ring' && p.surface?.finish !== 'lit')
  // between its two lenses, at their height, before their fronts: nothing of the camera is in its own way
  assert.ok(Math.abs(out.at.x - (lenses[0].at.x + lenses[1].at.x) / 2) < 1e-9, 'mid-way between the two lenses')
  assert.equal(out.at.z, lenses[0].up, 'at their height')
  for (const piece of CAMERA_MODULE.shape.pieces.filter(p => p.faces === 'front')) {
    assert.ok(out.at.y < piece.at.y - piece.size.z, `before the ${piece.name}'s front`)
  }
  assert.equal(out.part, lenses[0].part, 'and it turns with the part the lenses are in: it looks the way the camera looks')
  assert.ok(out.sees > 0 && out.sees < 180)
  assert.equal(DRONE.lookOut, undefined, 'one does not look out of the drone')
  // the made thing carries that place with it, and the 3D view puts its eye there before every picture
  const made = code(read('drawing/make.ts'))
  assert.match(made, /lookOut\.position\.set\(element\.lookOut\.at\.x, element\.lookOut\.at\.y, element\.lookOut\.at\.z\)/, 'on the place its data says')
  assert.match(made, /\(element\.lookOut\.part \? partNamed\(element\.lookOut\.part\) : body\)\.add\(lookOut\)/, 'in the part it turns with')
})

test('the eye first stands where the whole element is in sight', () => {
  for (const element of ELEMENTS) {
    const sight = firstSight(element, 50)
    const reach = Math.hypot(element.size.x, element.size.y, element.size.z) / 2
    assert.ok(between(sight.from, sight.at) >= reach / Math.sin((25 * Math.PI) / 180), `the whole ${element.name} is within the eye's angle`)
    assert.deepEqual([sight.at.x, sight.at.y], [0, 0], 'it looks at the element, which stands at x 0, y 0')
    assert.ok(sight.from.z > element.size.z, 'from above it')
  }
})

// THE ASTROID (21 Nov 2026). The user: "when 4 of these tiles put together as 2 rows and 2 columns, the center
// forms a shape called [astroid]. So I want the [astroid] element, and it should be the secondary color". That
// it is matte is a pick, and is not tested as a rule.

// Four base tiles, two rows by two columns, round x 0, y 0: where each one's middle is.
const FOUR_TILES = [[5, 5], [-5, 5], [-5, -5], [5, -5]]
// Whether a point (x, y) is inside a base tile standing at (tx, ty): inside its square, and not in the part a
// rounded corner leaves open.
const inTile = (x, y, [tx, ty]) => {
  const [ax, ay] = [Math.abs(x - tx), Math.abs(y - ty)]
  if (ax > 5 || ay > 5) return false
  return !(ax > 4 && ay > 4 && Math.hypot(ax - 4, ay - 4) > 1)
}

test('the astroid is the shape four base tiles leave open in their middle, two rows by two columns', () => {
  const points = outline(ASTROID)
  // its four points are where two tiles' straight sides part: 1 m from the middle along x and along y
  for (const tip of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    assert.ok(points.some(p => Math.hypot(p.x - tip[0], p.y - tip[1]) < 1e-9), `it has a point at x ${tip[0]}, y ${tip[1]}`)
  }
  // every point of its outline lies on the rounded corner of one of the four tiles: neither inside a tile nor
  // away from it
  for (const p of points) {
    const fromCorners = FOUR_TILES.map(([tx, ty]) => Math.hypot(p.x - Math.sign(tx), p.y - Math.sign(ty)))
    assert.ok(Math.abs(Math.min(...fromCorners) - 1) < 1e-9, `x ${p.x.toFixed(3)}, y ${p.y.toFixed(3)} is on a tile's rounded corner`)
    assert.ok(fromCorners.every(d => d > 1 - 1e-9), `x ${p.x.toFixed(3)}, y ${p.y.toFixed(3)} is inside no tile`)
  }
  // it fills the opening and nothing else: the ground it covers is the 2 m square less four quarter circles
  let area = 0
  points.forEach((p, i) => { const q = points[(i + 1) % points.length]; area += (p.x * q.y - q.x * p.y) / 2 })
  assert.ok(Math.abs(area - (4 - Math.PI)) < 0.005, `it covers ${area.toFixed(4)} square metres; the opening is ${(4 - Math.PI).toFixed(4)}`)
  // and a check that does not use its outline: every spot of ground near the middle is in a tile or in the
  // astroid, never in both and never in neither
  const inAstroid = (x, y) => Math.abs(x) <= 1 && Math.abs(y) <= 1 && FOUR_TILES.every(([tx, ty]) => Math.hypot(x - Math.sign(tx), y - Math.sign(ty)) >= 1)
  for (let x = -1.975; x < 2; x += 0.05) {
    for (let y = -1.975; y < 2; y += 0.05) {
      const tiles = FOUR_TILES.filter(t => inTile(x, y, t)).length
      assert.equal(tiles + (inAstroid(x, y) ? 1 : 0), 1, `x ${x.toFixed(3)}, y ${y.toFixed(3)} is covered once`)
    }
  }
})

test('the astroid is worked out from the base tile, and is as thick', () => {
  assert.equal(ASTROID.shape.kind, 'astroid')
  assert.equal(ASTROID.shape.radius, BASE_TILE.shape.cornerRadius, 'its sides are the tiles\' corners')
  assert.deepEqual(ASTROID.size, { x: 2, y: 2, z: BASE_TILE.size.z }, 'it reaches 1 m each way, and its top is level with the tiles')
  const data = code(read('astroid/astroid.ts'))
  assert.match(data, /radius: BASE_TILE\.shape\.cornerRadius/, 'the radius is read from the tile, not written again')
  assert.match(data, /thickness: BASE_TILE\.size\.z/, 'and so is the thickness')
})

test('the astroid is the secondary colour', () => {
  assert.equal(ASTROID.surface.colour, '--eio-color-action-secondary')
  const values = [...TOKENS.matchAll(/--eio-color-action-secondary:\s*(#[0-9A-Fa-f]{6})/g)].map(m => m[1])
  assert.ok(values.length > 0, 'it is a colour of Eidos')
  assert.equal(new Set(values).size, 1, 'the same in light and in dark')
  assert.match(code(read('drawing/light.ts')), /Math\.max\(1, /, 'the light it is looked at in is never weaker than plain, so its top shows the colour itself')
})

// THE ASTROID GLOWS WHEN IT IS ACTIVE (23 Nov 2026, issue 132). In the intro that opens the world the astroids glow as
// the platform is built. The user: "the asteroids between the tiles should glow when they render, and they have to
// keep glowing till the camera reaches the end, and then they should go back to their normal state", and then:
// "Since we added glow animation for the asteroids, it should be a state, right?" On seeing the glow: "Glow is right".
test('the astroid has a default state and an active one, in which it glows all over, a soft light round it', () => {
  assert.deepEqual(ASTROID.states.map(s => s.name), ['Default', 'Active'], 'two states, named as the stage\'s are')
  const [plain, active] = ASTROID.states
  assert.equal(plain.glow, undefined, 'in the default state it does not glow')
  assert.deepEqual(poseIn(plain, 3), poseIn(active, 3), 'and in neither does it move')
  assert.equal(active.glow.colour, ASTROID.surface.colour, 'it glows in its own colour, the secondary')
  assert.deepEqual(active.glow.borders, [], 'it has no border to light: all of it is lit')
  const whole = active.glow.whole
  // its own numbers since 23 Nov (issue 131): the glow the user saw and said "Glow is right" of
  assert.equal(whole.bright, 1.5)
  assert.ok(whole.bright > 1, 'it gives off more than the colour itself')
  assert.deepEqual(whole.round, { across: 9, above: 0.05, bright: 0.5 })
  assert.ok(whole.round.across > ASTROID.size.x && whole.round.across < BASE_TILE.size.x, 'the light round it reaches beyond it, and not as far as the next astroid\'s')
  assert.ok(whole.round.above > 0, 'and lies over the tiles\' tops, never in them')
  // a made thing acts that out, alone or laid many times
  const made = code(read('drawing/make.ts'))
  assert.match(made, /matteWith\(element\.surface\.colour, light\.gives\.mul\(light\.lit\)/, 'the thing itself gives off the light, as lit as its state has it')
  assert.match(made, /name: `\$\{element\.id\} light`, shape: new THREE\.PlaneGeometry\(round\.across, round\.across\), surface, up: element\.size\.z \+ round\.above/, 'and the soft light lies round it, over its top')
  assert.match(made, /is = was \+ \(\(s\?\.glow\?\.whole \? 1 : 0\) - was\) \* share/, 'lit when the state lights it all over, dark when not, and smoothly from one to the other')
  assert.match(made, /for \(const thing of roundLights\) thing\.visible = is > 0/, 'the soft light is drawn only while it is lit')
  assert.match(made, /state\(id, atOnce = false\) \{\s+const next = states\.find\(s => s\.id === id\)\s+if \(!whole\.any \|\| !next\) return false/, 'laid many times, the astroids can be put in a state too')
  // the drone's body is the astroid's shape, not the astroid: the drone does not glow with it
  assert.equal(DRONE.states.some(s => s.glow?.whole), false)
})

// THE FOUR SOLIDS REMOVED (22 Nov 2026, issue 127). The user: "I want you to remove the diamond, [low-poly]
// sphere, octahedron, hexagon [tori] shapes from the world elements that we have built in the gallery."
// THE CHARACTERS JOINED (23 Nov 2026). The user: "bring in the characters into elements". They come after the rest.
test('the elements are the eleven the user has today, each in a folder of its own, and every one is in the list', async () => {
  assert.deepEqual(ELEMENTS.map(e => e.id), ['base-tile', 'astroid', 'base-platform', 'mobius-platform', 'wave-platform', 'drone', 'camera-module', 'stage', 'clay', 'mannequin', 'fairy-bot'], 'the diamond, the low-poly sphere, the octahedron and the hexagon tori are gone; the three characters are in')
  for (const gone of ['diamond', 'low-poly-sphere', 'octahedron', 'hexagon-tori']) assert.equal(elementById(gone), null, `there is no ${gone}`)
  assert.equal(elementById('astroid'), ASTROID)
  assert.equal(`${sizeWords(ASTROID)}; ${shapeWords(ASTROID)}; ${surfaceWords(ASTROID)}`, '2 m along x, 2 m along y, 0.2 m thick; four points 1 m from its middle, sides curved inward by 1 m; matte, in the secondary colour')
  // an element in a folder of its own is only shown once it is in the list: none is left out (till 23 Nov in the
  // Explorer, one file for each solid in its elements/ folder)
  const folders = readdirSync(SRC).filter(f => statSync(SRC + f).isDirectory() && !['drawing', 'character-drawing'].includes(f))
  assert.equal(folders.length, ELEMENTS.length)
  for (const folder of folders) {
    const made = Object.values(await import(`../src/${folder}/${folder}.ts`)).filter(v => v && typeof v === 'object' && 'id' in v && 'shape' in v)
    assert.equal(made.length, 1, `${folder}/ makes one element`)
    assert.ok(ELEMENTS.includes(made[0]), `the ${made[0].name.toLowerCase()} (${folder}/) is in the list`)
    assert.equal(folder, made[0].id, 'its folder is named by its id')
  }
})

// THE DRONE (22 Nov 2026, issue 127). After two tries the user did not like (a six-sided body with cuboids,
// then with four cubes), with a picture of a drone seen from above: "I did not like what we made. Let's use the
// following image as reference and use our [astroid] primitive". The picture: a body with four points and four
// sides curved inward; a round ring lying in each of the four curved sides; two short joins from each ring to
// the body. How large the rings and the joins are, how thick, and the white, are a session's picks read off
// the picture, and are not tested as rules.
test('the drone is our astroid with a round ring in each of its four curved sides, joined to it', () => {
  assert.equal(DRONE.shape.kind, 'pieces')
  const pieces = DRONE.shape.pieces
  const r = ASTROID.shape.radius
  // "use our astroid primitive": the body is the astroid's shape; at its Base size as large and as thick as the
  // astroid between four tiles (since 23 Nov, issue 131, it is sized from the drone's own Base size)
  const bodies = pieces.filter(p => p.shape.kind === 'astroid' && !p.spin)
  assert.equal(bodies.length, 1)
  assert.deepEqual(bodies[0].shape, ASTROID.shape, 'the body is our astroid primitive')
  assert.deepEqual(bodies[0].size, ASTROID.size, 'as large and as thick, at its Base size')
  assert.deepEqual(bodies[0].at, { x: 0, y: 0 }, 'in the middle')
  // a round ring lying in each of the four curved sides: each side is a quarter of a circle, and the ring's
  // middle is that circle's middle
  const rings = pieces.filter(p => p.shape.kind === 'ring')
  assert.equal(rings.length, 4)
  assert.deepEqual(new Set(rings.map(p => `${p.at.x}, ${p.at.y}`)), new Set([`${r}, ${r}`, `${-r}, ${r}`, `${-r}, ${-r}`, `${r}, ${-r}`]), 'one in each curved side')
  for (const ring of rings) {
    assert.ok(ring.shape.inner > 0 && ring.shape.inner < ring.shape.outer, `${ring.name} is a ring: open in its middle`)
    assert.ok(ring.shape.outer < r, `${ring.name} is smaller than the side it lies in: a gap is left between them, as in the picture`)
    assert.equal(holesOf(ring.shape).length, 1)
    // no point of the ring is under the body
    for (const p of pieceOutline(ring)) assert.ok(!covers(ASTROID, p.x, p.y), `${ring.name} does not touch the body`)
  }
  // CHANGED 23 Nov 2026 (piece 42). The user: "instead of two connectors, let's make it one, and it has to be like a
  // cylinder, smaller than the height of the body and wing circle." One round join for each ring, thinner than the
  // body and the ring are thick, lying inside both heights.
  const joins = pieces.filter(p => p.name.startsWith('join'))
  assert.equal(joins.length, 4)
  const body = bodies[0]
  for (const ring of rings) {
    const own = joins.filter(j => Math.hypot(j.at.x - ring.at.x, j.at.y - ring.at.y) < r)
    assert.equal(own.length, 1, `${ring.name} has one join`)
    const join = own[0]
    assert.equal(join.size.x, join.size.y, 'a cylinder: as wide as it is tall')
    assert.equal(join.shape.cornerRadius, join.size.x / 2, 'round across')
    assert.ok(join.size.x < body.size.z && join.size.x < ring.size.z, 'smaller than the height of the body and of the ring')
    assert.ok(join.up - join.size.x / 2 > 0 && join.up + join.size.x / 2 < Math.min(body.size.z, ring.size.z), 'lies inside both heights')
    assert.equal(join.faces, 'front', 'lying: round across, long along its way')
    // its axis runs from the ring's middle to the body's middle
    const way = ((join.turn - 90) * Math.PI) / 180
    const toMiddle = Math.atan2(0 - ring.at.y, 0 - ring.at.x)
    assert.ok(Math.abs(Math.cos(way) - Math.cos(toMiddle)) < 1e-9 && Math.abs(Math.sin(way) - Math.sin(toMiddle)) < 1e-9)
    const start = { x: join.at.x, y: join.at.y }
    const end = { x: start.x + join.size.z * Math.cos(way), y: start.y + join.size.z * Math.sin(way) }
    const out = e => Math.hypot(e.x - ring.at.x, e.y - ring.at.y)
    assert.ok(out(start) > ring.shape.inner && out(start) < ring.shape.outer, `${join.name} starts in ${ring.name}'s band`)
    assert.ok(covers(ASTROID, end.x, end.y), `${join.name} ends inside the body`)
  }
  // THE FANS. The user (22 Nov 2026): "I want you to figure out the fans for the drone." So the fans are a
  // session's design (a small astroid in each ring, turning; neighbours opposite ways), and only this much is
  // held as a rule: there is a fan in each ring, it fits in the ring's opening, and it turns.
  const fans = pieces.filter(p => p.spin)
  assert.equal(fans.length, 4)
  for (const ring of rings) {
    const own = fans.filter(f => f.at.x === ring.at.x && f.at.y === ring.at.y)
    assert.equal(own.length, 1, `${ring.name} has one fan, on the ring's middle`)
    const fan = own[0]
    const reach = Math.max(...pieceOutline(fan).map(p => Math.hypot(p.x - ring.at.x, p.y - ring.at.y)))
    assert.ok(reach < ring.shape.inner, `${fan.name} fits in the ring's opening, at every turn`)
    assert.ok(fan.size.z <= ring.size.z, 'and does not stand above the ring')
    assert.ok(fan.spin.turnEvery > 0)
    assert.equal(Math.abs(pieceTurn(fan, fan.spin.turnEvery) - pieceTurn(fan, 0)), 360, 'it turns: one whole turn in the time its data says')
    assert.notEqual(pieceTurn(fan, fan.spin.turnEvery / 8), pieceTurn(fan, 0))
  }
  assert.equal(pieceTurn(bodies[0], 5), 0, 'the body does not turn')
  // THE STUDS. The user (22 Nov 2026): "Now, drone is a primitive. So, what I want you to imagine the drone as a
  // Lego piece, and we will create more and more pieces over time that can attach to the drone. So what we can
  // do is we can create a Lego style attachment setup on top of the body." How many studs, where, the grid's
  // pitch and a stud's size are a session's design, and are not held as rules.
  // CHANGED, issue 127: "I'm not sure why you have decided 5 stunts. If you have a better explanation, please do
  // explain in simple terms. If not, I would have preferred 4 as a grid, and we can adapt that to other things
  // that we build in the future." Four studs, as a grid: two by two, in a square.
  const studs = DRONE.studs
  assert.ok(studs && studs.at.length > 0, 'the drone has places where another piece can be set on it')
  const pegs = pieces.filter(p => p.up && p.name.startsWith('stud'))
  assert.equal(pegs.length, studs.at.length, 'each of them is a peg drawn on the drone')
  for (const [n, stud] of studs.at.entries()) {
    const peg = pegs[n]
    assert.deepEqual([peg.at.x, peg.at.y, peg.up], [stud.x, stud.y, stud.z], `${peg.name} stands where the studs' data says`)
    assert.equal(stud.z, ASTROID.size.z, 'on top of the body')
    for (const p of pieceOutline(peg)) assert.ok(covers(ASTROID, p.x, p.y), `all of ${peg.name} is over the body`)
    // round: every point of its outline is as far from its middle
    for (const p of pieceOutline(peg)) assert.ok(Math.abs(Math.hypot(p.x - stud.x, p.y - stud.y) - studs.radius) < 1e-9, `${peg.name} is round`)
    assert.equal(peg.size.z, studs.height)
  }
  assert.equal(studs.at.length, 4, 'four studs')
  const xs = [...new Set(studs.at.map(t => t.x))], ys = [...new Set(studs.at.map(t => t.y))]
  assert.ok(xs.length === 2 && ys.length === 2, 'a square, two by two')
  assert.ok(Math.abs(Math.abs(xs[0] - xs[1]) - studs.pitch) < 1e-9 && Math.abs(Math.abs(ys[0] - ys[1]) - studs.pitch) < 1e-9, 'each pair is one pitch apart')
  for (const x of xs) for (const y of ys) assert.ok(studs.at.some(t => t.x === x && t.y === y), 'all four corners of the square are there')
  assert.ok(Math.abs(studs.at.reduce((a, t) => a + t.x, 0)) < 1e-9 && Math.abs(studs.at.reduce((a, t) => a + t.y, 0)) < 1e-9, 'the square is centred on the drone\'s middle')
  assert.ok(studs.pitch > 2 * studs.radius, 'studs side by side do not touch: a piece set on one leaves the next free')
  assert.equal(new Set(studs.at.map(s => `${s.x}, ${s.y}`)).size, studs.at.length, 'no two studs on one place')
  assert.equal(DRONE.size.z, ASTROID.size.z + studs.height, 'the drone is as tall as its body and a stud')
  assert.equal(pieces.length, 1 + 4 + 4 + 4 + studs.at.length, 'and nothing else')
  // the same from every side, as the picture is: turned a quarter, it lies on itself
  const where = new Set(pieces.map(p => `${p.shape.kind} ${p.at.x.toFixed(6)} ${p.at.y.toFixed(6)}`))
  for (const p of pieces) assert.ok(where.has(`${p.shape.kind} ${(0 - p.at.y).toFixed(6)} ${p.at.x.toFixed(6)}`.replace(/-0\.000000/g, '0.000000')) || where.has(`${p.shape.kind} ${(0 - p.at.y).toFixed(6)} ${p.at.x.toFixed(6)}`), `${p.name} has its like a quarter turn on`)
  // it is drawn from that data: each piece raised, turned and moved to its place, a ring with its hole
  assert.ok(ELEMENTS.includes(DRONE))
  const made = code(read('drawing/make.ts'))
  assert.match(made, /element\.shape\.pieces\.flatMap\(\(piece\): Part\[\] => \{/, 'every piece is drawn (as two parts when it has a border)')
  assert.match(made, /flatOf\(pieceOutline\(piece\), pieceHoles\(piece\)\)/, 'by its outline where it stands in the element, as the data says it')
  assert.match(made, /mesh\.position\.set\(part\.spins\.at\.x, part\.spins\.at\.y, part\.up \?\? 0\)/, 'a piece that spins is put on its own place')
  assert.match(made, /if \(part\.up\) mesh\.position\.z = part\.up/, 'a piece above the base stands as far up as its data says')
  assert.match(made, /put\.makeTranslation\(p\.x, p\.y, p\.z \+ \(part\.up \?\? 0\)\)/, 'also when the thing is laid many times')
  assert.match(made, /spinner\.spun \+= \(pieceTurn\(spinner\.piece, passed\) - pieceTurn\(spinner\.piece, 0\)\) \* is\.spin/, 'and turned on by what its data says for the time that passed (times what its state says)')
  assert.match(made, /depth: piece\.size\.z\b/, 'raised by its own thickness')
  assert.match(made, /for \(const hole of holes\) flat\.holes\.push\(/, 'a ring is open in its middle')
})

// THE CAMERA MODULE (22 Nov 2026, issue 127). The user: "I want to have drones in the world roaming around
// attached with cameras on top of it", and, with a picture: "Here is the inspiration for a camera that I have.
// Can you build the camera module element?" The picture: on the drone's body a round foot with small lights
// round it, a short neck, and a wide head with round ends that looks to the front, its dark face holding two
// lenses side by side. Every size, the number of lights and their colour are a session's picks.
// THE DRONE'S SCALE (23 Nov 2026, issue 131). The user: "a drone will have a scale"; "for drone, small, default,
// medium, large can be 0.5, 1, 1.5, and 2"; "Base" is the 1 step's name; "studs should have universally one single
// size", and a larger drone carries more of them ("I also would like to go with A"). How many studs fit each step
// is worked out from the room the user's four take at Base; one stud at Small is a session's pick.
test('the drone comes in four sizes, Small, Base, Medium and Large; its studs keep one size and grow in number', () => {
  const [scale] = DRONE.settings
  assert.deepEqual([scale.id, scale.group, scale.name, scale.sets], ['scale', 'Size', 'Scale', { what: 'scale' }], 'offered as the stage\'s sizes are')
  assert.deepEqual(scale.steps, [{ name: 'Small', value: 0.5 }, { name: 'Base', value: 1 }, { name: 'Medium', value: 1.5 }, { name: 'Large', value: 2 }])
  assert.equal(scale.value, 1, 'it is made at Base')
  assert.equal(sizedBy(DRONE, {}).size.x, DRONE.size.x, 'at Base it is the drone as it is')
  const body = d => d.shape.pieces.find(p => p.name === 'body')
  for (const [step, factor, side] of [['Small', 0.5, 1], ['Base', 1, 2], ['Medium', 1.5, 3], ['Large', 2, 4]]) {
    const d = sizedBy(DRONE, { scale: factor })
    assert.equal(d.settings[0].value, factor, `${step}: it says which step it is at`)
    for (const along of ['x', 'y']) assert.ok(Math.abs(d.size[along] - factor * DRONE.size[along]) < 1e-9, `${step}: ${factor} times as large`)
    assert.ok(Math.abs(body(d).size.z - factor * body(DRONE).size.z) < 1e-9, `${step}: its body ${factor} times as thick`)
    // the studs: one size at every step, as many a side as fit
    assert.deepEqual([d.studs.pitch, d.studs.radius, d.studs.height], [DRONE.studs.pitch, DRONE.studs.radius, DRONE.studs.height], `${step}: the studs are one size`)
    assert.equal(d.studs.at.length, side * side, `${step}: ${side} by ${side} studs`)
    assert.equal(d.shape.pieces.filter(p => p.name.startsWith('stud')).length, side * side)
    for (const peg of d.shape.pieces.filter(p => p.name.startsWith('stud'))) for (const p of pieceOutline(peg)) assert.ok(covers(body(d).shape.radius === ASTROID.shape.radius ? ASTROID : { ...ASTROID, shape: body(d).shape, size: body(d).size }, p.x, p.y), `${step}: ${peg.name} is over the body`)
    assert.ok(Math.abs(d.studs.at.reduce((a, t) => a + t.x, 0)) < 1e-9 && Math.abs(d.studs.at.reduce((a, t) => a + t.y, 0)) < 1e-9, `${step}: centred on its middle`)
    // how it moves grows with it; how often does not
    const flying = d.states.find(s => s.id === 'flying'), base = DRONE.states.find(s => s.id === 'flying')
    assert.ok(Math.abs(flying.lift - factor * base.lift) < 1e-9 && Math.abs(flying.round.radius - factor * base.round.radius) < 1e-9, `${step}: it flies as much higher and wider`)
    assert.deepEqual([flying.round.every, flying.round.lean, flying.bob.every, flying.spin], [base.round.every, base.round.lean, base.bob.every, base.spin])
    // the camera module goes on it at every step: on its middle when its studs allow, on its one stud at Small
    const on = fitsOn(CAMERA_MODULE, d)
    assert.ok(on, `${step}: the camera module fits on it`)
    assert.equal(on.z, body(d).size.z, `${step}: on top of the body`)
    const held = CAMERA_MODULE.sockets.at.filter(s => d.studs.at.some(t => Math.abs(t.x - s.x - on.x) < 1e-9 && Math.abs(t.y - s.y - on.y) < 1e-9))
    assert.equal(held.length, Math.min(4, side * side), `${step}: on as many studs as it can take`)
    if (side % 2 === 0) assert.deepEqual([on.x, on.y], [0, 0], `${step}: on the middle`)
  }
  // a stud under the camera's base that no socket takes would be in its way: it does not go there
  const holey = { ...CAMERA_MODULE, sockets: { ...CAMERA_MODULE.sockets, at: CAMERA_MODULE.sockets.at.slice(0, 3) } }
  const off = fitsOn(holey, DRONE)
  assert.ok(off && (off.x !== 0 || off.y !== 0), 'a stud with no socket over it is in the way: not on the middle')
  assert.equal(fitsOn(CAMERA_MODULE, DRONE.studs ? { ...DRONE, studs: { ...DRONE.studs, at: [] } } : DRONE), null, 'and with no stud to take, it goes on nothing')
})

test('the camera module is a square base with sockets, a neck, and a head that looks to the front with two lenses; it fits on the drone\'s studs', () => {
  assert.equal(CAMERA_MODULE.shape.kind, 'pieces')
  const pieces = CAMERA_MODULE.shape.pieces
  const named = name => pieces.find(p => p.name === name)
  // it goes on the drone by the studs: four sockets on the studs' own grid, and a place where all four meet
  assert.equal(CAMERA_MODULE.sockets.pitch, STUD_GRID.pitch)
  assert.equal(CAMERA_MODULE.sockets.at.length, DRONE.studs.at.length)
  assert.deepEqual(fitsOn(CAMERA_MODULE, DRONE), { x: 0, y: 0, z: ASTROID.size.z }, 'on the drone\'s middle, on top of the body')
  assert.equal(fitsOn(DRONE, CAMERA_MODULE), null, 'the drone has no sockets: it goes on nothing')
  assert.equal(fitsOn(CAMERA_MODULE, ASTROID), null, 'and the camera goes on nothing that has no studs')
  assert.equal(fitsOn({ ...CAMERA_MODULE, sockets: { ...CAMERA_MODULE.sockets, pitch: 0.5 } }, DRONE), null, 'nor on another grid')
  // THE BASE. The user (22 Nov 2026): "Basically the camera module as an element is supposed to fit on the drone
  // as a Lego. So what I want you to do is the base of the camera module should be a cuboid with all four sides
  // same, keeping the same height, but with border radius, and also the bottoms that can fit the studs." How
  // long its sides are, how round its corners, and that the round plate stays on it, are a session's picks.
  const [foot, top] = [named('base'), named('base top')]
  assert.deepEqual([foot.at.x, foot.at.y, foot.up ?? 0], [0, 0, 0], 'the base is the middle of the camera\'s base')
  for (const part of [foot, top]) {
    assert.equal(part.shape.kind, 'slab')
    assert.equal(part.size.x, part.size.y, 'all four sides the same')
    assert.ok(part.shape.cornerRadius > 0 && part.shape.cornerRadius < part.size.x / 2, 'its corners rounded: a border radius on a block, not a round foot')
  }
  assert.deepEqual([top.size.x, top.shape.cornerRadius, top.up], [foot.size.x, foot.shape.cornerRadius, foot.size.z], 'one block: its upper part lies on its lower part, as wide and as round')
  assert.ok(Math.abs(foot.size.z + top.size.z - 0.1) < 1e-9, 'keeping the same height: 0.1 m, as the round foot was')
  // "the bottoms that can fit the studs": underneath, a round hole over every stud, wide and deep enough for
  // it, wholly inside the base, and closed above
  assert.equal(foot.shape.holes.length, DRONE.studs.at.length)
  assert.equal(holesOf(foot.shape).length, DRONE.studs.at.length, 'the holes are drawn')
  const on = fitsOn(CAMERA_MODULE, DRONE)
  for (const stud of DRONE.studs.at) {
    const hole = foot.shape.holes.find(h => Math.abs(h.x + on.x - stud.x) < 1e-9 && Math.abs(h.y + on.y - stud.y) < 1e-9)
    assert.ok(hole, 'a hole over every stud')
    assert.ok(hole.radius >= DRONE.studs.radius - 1e-9, 'wide enough for the stud')
    assert.ok(Math.abs(hole.x) + hole.radius < foot.size.x / 2 && Math.abs(hole.y) + hole.radius < foot.size.y / 2, 'and wholly inside the base')
  }
  assert.ok(foot.size.z >= DRONE.studs.height - 1e-9, 'the holes are as deep as a stud is tall')
  assert.equal(top.shape.holes, undefined, 'and closed above: they are open underneath only')
  assert.deepEqual(CAMERA_MODULE.sockets.at.map(s => [s.x, s.y]), foot.shape.holes.map(h => [h.x, h.y]), 'the sockets\' data and the holes are the same places')
  // the round plate on the base, a neck on the plate, and the head on the neck: each stands on the one below
  const [plate, neck, head] = [named('plate'), named('neck'), named('head')]
  assert.equal(plate.up, foot.size.z + top.size.z)
  assert.equal(neck.up, plate.up + plate.size.z)
  assert.ok(neck.size.x < foot.size.x && head.size.x > foot.size.x, 'a thin neck, and a head wider than the base')
  // the head looks to the front: its outline stands upright, wider than tall, with round ends
  assert.equal(head.faces, 'front')
  assert.ok(head.size.x > head.size.y, 'wider than it is tall')
  assert.equal(head.shape.cornerRadius, head.size.y / 2, 'its ends are round')
  assert.ok(Math.abs(head.up - head.size.y / 2 - (neck.up + neck.size.z)) < 1e-9, 'its underside rests on the neck')
  // two lenses side by side on its front, each a ring with glass in it, in a dark face
  const lenses = pieces.filter(p => p.shape.kind === 'ring' && p.surface?.finish !== 'lit')
  assert.equal(lenses.length, 2)
  assert.ok(lenses.every(l => l.faces === 'front'), 'both look to the front')
  assert.ok(Math.abs(lenses[0].at.x + lenses[1].at.x) < 1e-9 && lenses[0].at.x !== lenses[1].at.x, 'side by side, as far either side of the middle')
  assert.deepEqual([lenses[0].up, lenses[0].at.y], [lenses[1].up, lenses[1].at.y], 'level with each other')
  const face = named('face')
  for (const lens of lenses) {
    assert.ok(Math.abs(lens.at.x) + lens.shape.outer < face.size.x / 2 && lens.shape.outer < face.size.y / 2, `${lens.name} lies within the face`)
    assert.ok(lens.at.y < head.at.y - head.size.z + 1e-9, `${lens.name} is on the head's front`)
    assert.ok(pieces.some(g => g.name.startsWith('glass') && g.at.x === lens.at.x && g.shape.cornerRadius === lens.shape.inner), `${lens.name} has glass in it`)
  }
  assert.ok(lenses[0].shape.outer * 2 < Math.abs(lenses[0].at.x - lenses[1].at.x), 'the two lenses do not touch')
  // the user (22 Nov 2026): "Can you also add subtle lime rings for the two camera rings?" A thin ring of light on each lens
  const litRings = pieces.filter(p => p.shape.kind === 'ring' && p.surface?.finish === 'lit')
  assert.equal(litRings.length, 2)
  for (const lens of lenses) {
    const mine = litRings.filter(r => r.at.x === lens.at.x && r.up === lens.up)
    assert.equal(mine.length, 1, `${lens.name} has one ring of light`)
    const ring = mine[0]
    assert.equal(ring.faces, 'front')
    assert.equal(ring.surface.colour, '--eio-color-action-primary')
    assert.ok(ring.at.y < lens.at.y, 'in front of the lens\'s base')
    assert.ok(ring.shape.outer - ring.shape.inner < lens.shape.outer - lens.shape.inner, 'subtle: narrower than the lens\'s own band')
    assert.ok(ring.shape.inner >= lens.shape.inner && ring.shape.outer <= lens.shape.outer, 'and on the lens\'s front')
  }
  // a piece may have a surface of its own: the glass is dark and glossy, the lights are lit, the rest is the element's
  assert.equal(face.surface.finish, 'glossy')
  assert.notEqual(face.surface.finish, CAMERA_MODULE.surface.finish) // the body is black too now (piece 41): the glass differs by its gloss
  assert.equal(head.surface, undefined)
  const lights = pieces.filter(p => p.surface?.finish === 'lit')
  assert.ok(lights.filter(l => l.name.startsWith('base light')).length > 0, 'small lights on the base\'s sides')
  assert.ok(lights.some(l => l.faces === 'front') && lights.some(l => (l.up ?? 0) >= head.up + head.size.y / 2 - 1e-9), 'a light between the lenses, and one along the head\'s top')
  // the element is as large as its pieces
  assert.equal(CAMERA_MODULE.size.x, head.size.x)
  assert.ok(CAMERA_MODULE.size.y >= foot.size.y && CAMERA_MODULE.size.y < foot.size.y + 0.1, 'along y, its base and the lights on the base\'s sides')
  assert.ok(ELEMENTS.includes(CAMERA_MODULE))
  // drawn from that data: a piece that faces the front is stood upright on its place, each piece in its surface
  const made = code(read('drawing/make.ts'))
  assert.match(made, /const surface = surfaceFor\(piece\.surface \?\? element\.surface\)/, 'a piece is in its own surface when it has one')
  assert.match(made, /mesh\.position\.set\(part\.front\.at\.x, part\.front\.at\.y, part\.front\.up \?\? 0\)/, 'a piece that faces the front is put on its place')
  assert.match(made, /mesh\.rotation\.set\(Math\.PI \/ 2, 0, \(\(part\.front\.turn \?\? 0\) \* Math\.PI\) \/ 180, 'ZXY'\)/, 'and stood upright there')
  assert.match(made, /s\.finish === 'lit' \? lit\(s\.colour\)/, 'a lit surface gives off its own colour')
})

// THE BASE PLATFORM (23 Nov 2026, issue 127). The user: "Let's add the base platform as element in the gallery
// too. So that I can select items to place on the platform just like we do in the drone." That it is the whole
// platform, where a thing is placed on it, that one thing is placed at a time, and that the eye goes near what
// is placed, are a session's picks.
test('the base platform is an element laid as the land is, and what stands by itself can be placed on it', () => {
  assert.ok(ELEMENTS.includes(BASE_PLATFORM), 'it is in the gallery')
  // it is the land: the land's size, and the land's own tiles and astroids, counted from its middle instead
  // of from the middle of its beginning's side
  assert.deepEqual([BASE_PLATFORM.size.x, BASE_PLATFORM.size.y, BASE_PLATFORM.size.z], [2 * HALF, LONG, BASE_TILE.size.z])
  const laid = BASE_PLATFORM.shape.things
  assert.equal(laid.length, TILES + ASTROIDS)
  assert.equal(laid.filter(t => t.element === BASE_TILE).length, TILES, 'a base tile on every section')
  assert.equal(laid.filter(t => t.element === ASTROID).length, ASTROIDS, 'and an astroid wherever four tiles meet')
  assert.match(shapeWords(BASE_PLATFORM), new RegExp(`^${TILES} base tiles, and ${ASTROIDS} astroids`))
  // "select items to place on the platform just like we do in the drone": worked out from the data, no list
  assert.deepEqual(ELEMENTS.filter(e => e !== BASE_PLATFORM && fitsOn(e, BASE_PLATFORM)).map(e => e.id), ['drone', 'stage', 'clay', 'mannequin', 'fairy-bot'], 'today: the drone, the stage and the three characters can be placed on it')
  assert.equal(fitsOn(CAMERA_MODULE, BASE_PLATFORM), null, 'the camera module goes on studs, not on the ground')
  assert.equal(fitsOn(BASE_TILE, BASE_PLATFORM), null, 'the tiles are what it is laid from')
  assert.equal(fitsOn(ASTROID, BASE_PLATFORM), null, 'and the astroids')
  assert.equal(fitsOn(BASE_PLATFORM, BASE_PLATFORM), null, 'and it is not placed on itself')
  assert.equal(fitsOn(BASE_PLATFORM, DRONE), null, 'nor on anything else')
  // where: on the top of a tile, on that tile's middle
  const place = fitsOn(STAGE, BASE_PLATFORM)
  assert.equal(place.z, BASE_TILE.size.z, 'on the tile\'s top, not inside the tile')
  assert.ok(BASE_PLATFORM.shape.things.some(t => t.element === BASE_TILE && t.at.x === place.x && t.at.y === place.y), 'on the middle of a tile')
  assert.deepEqual(fitsOn(DRONE, BASE_PLATFORM), place, 'the same place for whatever is placed')
  // drawn as the land is: each element it is laid from is made once, on all its places
  const made = code(read('drawing/make.ts'))
  assert.match(made, /if \(element\.shape\.kind === 'laid'\) return makeLaid\(world, element, element\.shape, colourOf\)/)
  assert.match(made, /const many = \[\.\.\.places\.values\(\)\]\.map\(\(\{ of, over, where \}\) => makeMany\(world, of, where, colourOf, over, frame\)\)/, 'as the land\'s things are (turned over only on a bent thing\'s face below)')
})

// THE STAGE (23 Nov 2026, issue 127). The user, with a picture: "The next element I want you to build is the
// stage. It's the image that I have provided. It's a stage". The picture: a low square block with rounded
// corners, and a thin dark sheet of frosted glass with the same outline floating above it. Then, shown it as
// a block of lime light: "I like what you did, but I want to [adopt] the base tile style. Texture and border
// for the block." Asked whether black or lime: "keep it black". That its outline is the base tile's is a
// session's pick and is not tested as a rule.
test('the stage is a block in the base tile\'s style, and a sheet of frosted glass floating above it', () => {
  const pieces = STAGE.shape.pieces
  assert.deepEqual(pieces.map(p => p.name).slice(0, 2), ['block', 'glass'], 'two parts, as in the picture (and the posts after them)')
  const [block, glass] = pieces
  // one outline for both, round the stage's middle
  assert.deepEqual(pieceOutline(glass), pieceOutline(block), 'the glass has the block\'s outline')
  assert.deepEqual([block.at, glass.at], [{ x: 0, y: 0 }, { x: 0, y: 0 }])
  assert.equal(block.shape.kind, 'slab')
  assert.ok(block.shape.cornerRadius > 0, 'its corners are rounded')
  assert.equal(block.size.x, block.size.y, 'it is square')
  assert.ok(block.size.z < block.size.x / 4, 'and low')
  // "the base tile style. Texture and border for the block": the tile's colour, finish and border, read from the tile
  const surface = block.surface ?? STAGE.surface
  assert.deepEqual([surface.colour, surface.finish], [BASE_TILE.surface.colour, BASE_TILE.surface.finish], 'the block has the base tile\'s colour and finish')
  assert.deepEqual(block.border, BASE_TILE.border, 'and the base tile\'s border')
  const stage = code(read('stage/stage.ts'))
  assert.match(stage, /surface: \{ \.\.\.BASE_TILE\.surface, shine: SHINE, says: /, 'taken from the tile, so a change to the tile changes the block')
  assert.match(stage, /const border = \{ \.\.\.BASE_TILE\.border, width: /, 'and so is its border')
  // the border is the outermost part of the block all the way round: what lies inside it is smaller by its width
  const within = withinPieceBorder(block)
  assert.deepEqual([within.size.x, within.size.y, within.size.z], [block.size.x - 2 * block.border.width, block.size.y - 2 * block.border.width, block.size.z])
  assert.equal(within.shape.cornerRadius, block.shape.cornerRadius - block.border.width)
  // the glass slab has a border too, as wide as the block's; it is glass like the rest of the slab
  assert.equal(glass.border.width, block.border.width)
  assert.equal(glass.border.surface, glass.surface, 'glass round glass: it shows as a border when it is lit')
  // the glass floats: air between the block's top and the glass
  assert.equal(block.up ?? 0, 0, 'the block stands on the stage\'s base')
  assert.ok(glass.up - block.size.z > 0, 'the glass floats above the block')
  assert.ok(glass.size.z < block.size.z / 10, 'the glass is a thin sheet')
  assert.equal(glass.surface.finish, 'frosted')
  assert.ok(Math.abs(STAGE.size.z - (glass.up + glass.size.z)) < 1e-9, 'the stage is as tall as the top of its glass')
  assert.ok(ELEMENTS.includes(STAGE))
  // drawn from that data
  const made = code(read('drawing/make.ts'))
  assert.match(made, /const within = withinPieceBorder\(piece\)/, 'a piece with a border is drawn as what lies inside it')
  assert.match(made, /const band = flatOf\(roundOf\(piece\), \[roundOf\(within\)\]\)/, 'and the border round it: the whole outline with the inside cut out')
  assert.match(made, /matteWith\(piece\.border\.colour, lightOf\(light\), shine\)/, 'in the colour its data names')
  assert.match(made, /const glassEdge = piece\.border\.surface\?\.finish === 'frosted'/)
  assert.match(made, /glassEdge \? frosted\(piece\.border\.surface, \{ light, middle \}\)/, 'or in its own surface, when it has one')
  assert.match(made, /s\.finish === 'frosted' \? frosted\(s\)/, 'frosted glass is drawn as frosted glass')
  assert.match(made, /surface\.transmission = 1 - \(s\.hides \?\? 0\)/, 'it lets through what it does not hide')
})

// THE STAGE'S STATES (23 Nov 2026, issue 127). The user: "keep it black, but let's have an active state and
// default state. The active state should have the top face border and the glass slab border glow as lime."
// Then: "The top face of the base cube block also should glow with lime." And then: "I think let's glow the
// sides too". That it starts in the default state and how wide the glass's border is are a session's picks.
test('the stage has a default state and an active one, in which its whole block and the border of its glass glow', () => {
  assert.deepEqual(STAGE.states.map(s => s.name), ['Default', 'Active'], 'two states')
  const [plain, active] = STAGE.states
  assert.equal(plain.glow, undefined, 'in the default state nothing glows')
  assert.deepEqual(poseIn(plain, 3), poseIn(active, 3), 'and in neither does the stage move')
  // "glow as lime": Eidos's primary colour
  assert.equal(active.glow.colour, '--eio-color-action-primary')
  // "the top face border and the glass slab border": two borders, each of a piece that has one
  // (and, since piece 44, the four posts, lit as the block's sides are, which have no border of their own)
  assert.deepEqual(active.glow.borders.map(b => b.piece).sort(), ['block', 'glass', 'post 1', 'post 2', 'post 3', 'post 4'])
  for (const lit of active.glow.borders.filter(b => !b.piece.startsWith('post'))) assert.ok(STAGE.shape.pieces.find(p => p.name === lit.piece).border, `the ${lit.piece} has a border to light`)
  // "let's glow the sides too": all of the block's border, which runs through its whole height, so its walls too
  assert.equal(active.glow.borders.find(b => b.piece === 'block').faces, undefined, 'of the block, all of its border: on its top face and down its sides')
  assert.equal(active.glow.borders.find(b => b.piece === 'glass').faces, undefined, 'of the glass slab, all of its border')
  // "The top face of the base cube block also should glow with lime": the block's whole top face, not the glass's
  assert.deepEqual(active.glow.tops.map(top => top.piece), ['block'])
  // a made thing acts that out: each border has its own light, lit when the state names it, going over smoothly
  const made = code(read('drawing/make.ts'))
  assert.match(made, /lights: \{ piece: piece\.name, \.\.\.light \}/, 'each border can be lit by itself')
  assert.match(made, /light\.is = between\(light\.was, state\?\.glow\?\.borders\.some\(b => b\.piece === light\.piece\) \? 1 : 0\)/, 'lit when the state names its piece, dark when it does not, and smoothly from one to the other')
  assert.match(made, /const colourFor = \(named: string \| undefined\) => colourOf\(\(named \? tried\.get\(named\) : undefined\) \?\? glow\.colour\)/, 'in the colour the state says, a role of Eidos')
  assert.match(made, /light\.upOnly\.value = border\.faces === 'up' \? 1 : 0/, 'on all of the border, or only where it looks up')
  assert.match(made, /TSL\.mix\(l\.colour, l\.side, looks\.x\.add\(looks\.y\)\)\.mul\(l\.lit\)/, 'a lit border gives off its colour, whatever light falls on it')
  assert.match(made, /light\.topIs = between\(light\.topWas, state\?\.glow\?\.tops\?\.some\(t => t\.piece === light\.piece\) \? 1 : 0\)/, 'a piece\'s whole top face is lit when the state names it, as smoothly')
  assert.match(made, /const topOf = \(l: Light\) => l\.topColour\.mul\(l\.top\)\.mul\(TSL\.step\(0\.5, TSL\.normalLocal\.z\)\)/, 'in its own colour')
})

// THE SETTINGS FIXED (23 Nov 2026, issue 127). Ten settings of the stage's material, light and glass were offered
// to try. The user, with a picture of the card as they had set it (Shine: Glossy. Top face: Half. Border: Full.
// Sides: Half. Sides, how pale: Not at all. Border's spill: None. Frost: Heavy. Hides: Nothing. Above the block:
// 1 m. The glass's border: Full. Colour: lime): "Now, these are the settings I want you to fix for the stage.
// Only controls we need are colour, width, breadth and height."
test('the stage is made with the settings the user fixed, and offers no control for them', () => {
  const [block, glass] = STAGE.shape.pieces
  const [, active] = STAGE.states
  const ofBlock = active.glow.borders.find(b => b.piece === 'block')
  // Material. Shine: Glossy
  assert.equal((block.surface ?? STAGE.surface).shine, 1, 'the block shines as glossy')
  // Light. Top face: Half. Border: Full. Sides: Half
  assert.deepEqual([active.glow.tops.find(top => top.piece === 'block').bright, ofBlock.bright, ofBlock.sidesBright], [0.5, 1, 0.5])
  // Sides, how pale: Not at all. Border's spill: None. Neither is said by the data any more, nor drawn
  assert.deepEqual(Object.keys(active.glow).sort(), ['borders', 'colour', 'tops'], 'no paler sides, no spill')
  const made = code(read('drawing/make.ts'))
  assert.doesNotMatch(made, /spillOf|SPILL|paleX|paleY|toneOf/, 'what drew them is gone')
  // Glass. Frost: Heavy. Hides: Nothing. Above the block: 1 m. Border: Full
  assert.deepEqual([glass.surface.frost, glass.surface.hides, active.glow.borders.find(b => b.piece === 'glass').bright], [0.85, 0, 1])
  assert.ok(Math.abs(glass.up - block.size.z - 1) < 1e-9, 'the glass floats 1 m above the block')
  // Colour: lime
  assert.equal(STAGE.colours[0].colour, '--eio-color-action-primary')
  // drawn from that data, by the same numbers the controls set
  assert.match(made, /roughness: 1 - shine \* \(1 - GLOSS\.roughness\)/, 'shine: smoother')
  assert.match(made, /surface\.envMapIntensity = shine \* GLOSS\.mirrors/, 'and mirroring the room')
  assert.match(made, /const shine = own\.finish === 'matte' \? own\.shine \?\? 0 : 0/, 'a piece\'s border shines as the piece does')
  assert.match(made, /roughness: s\.frost \?\? 0,/, 'frost')
  assert.match(made, /light\.colour\.value\.set\(colourFor\(border\.colour\)\)\.multiplyScalar\(border\.bright \?\? 1\)/, 'how brightly a border is lit')
  assert.match(made, /light\.side\.value\.set\(colourFor\(border\.colour\)\)\.multiplyScalar\(border\.sidesBright \?\? border\.bright \?\? 1\)/, 'and its sides: as the border unless the state says otherwise')
  assert.match(made, /if \(top\) light\.topColour\.value\.set\(colourFor\(top\.colour\)\)\.multiplyScalar\(top\.bright \?\? 1\)/, 'and a top face')
  // "Only controls we need are colour, width, breadth and height"
  assert.deepEqual([...STAGE.settings.map(s => s.name), ...STAGE.colours.map(c => c.name)], ['Width', 'Breadth', 'Height of the base', 'Colour'])
  assert.doesNotMatch(made, /\bset\(id, value\)/, 'a made thing takes no other number to try')
})

// A COLOUR TO CHOOSE (23 Nov 2026, issue 127). Four colours were offered first, one for each part; then: "I
// don't need individual color selection. One color applied to all parts of the stage." And, fixing the rest:
// "Only controls we need are colour, width, breadth and height." Which of Eidos's colours are offered is a
// session's pick.
test('the stage has one colour, which all its lit parts give off, and its card offers it among Eidos\'s colours', () => {
  // "One color applied to all parts of the stage": one colour of its own, lime to begin with
  assert.equal(STAGE.colours.length, 1)
  const [one] = STAGE.colours
  assert.equal(one.colour, '--eio-color-action-primary', 'it begins as lime: the active state is as the user fixed it')
  // every part the active state lights gives off that one: no part has a colour of its own
  const [plain, active] = STAGE.states
  const lit = [...active.glow.borders, ...active.glow.tops]
  assert.equal(lit.length, 7, 'the block\'s border (its top band and its walls), the block\'s top face, the glass\'s border, the four posts')
  for (const part of lit) assert.equal(part.colour, one.id, `the ${part.piece}'s lit part gives off the stage's one colour`)
  assert.deepEqual(coloursIn(STAGE, active), STAGE.colours, 'it is to be chosen in the active state')
  assert.deepEqual(coloursIn(STAGE, plain), [], 'and not in the default state, where nothing is lit')
  assert.deepEqual(coloursIn(DRONE, DRONE.states[1]), [], 'an element with no colours of its own offers none')
  // what is offered: colours of Eidos only, each once, the element's own among them
  assert.equal(new Set(COLOURS_TO_TRY.map(c => c.colour)).size, COLOURS_TO_TRY.length)
  for (const offered of COLOURS_TO_TRY) {
    assert.match(offered.colour, /^--eio-color-/, `${offered.name} is a role of Eidos`)
    assert.ok(TOKENS.includes(`${offered.colour}:`), `${offered.colour} is a token Eidos has`)
  }
  assert.ok(COLOURS_TO_TRY.some(c => c.colour === '--eio-color-action-primary'), 'lime is among them, to go back to')
  // a made thing takes the colour chosen, and what is lit shows it at once
  const made = code(read('drawing/make.ts'))
  assert.match(made, /const tried = new Map\(\(element\.colours \?\? \[\]\)\.map\(c => \[c\.id, c\.colour\]\)\)/, 'each colour is its own to begin with')
  assert.match(made, /colour\(id, token\) \{\s+if \(!tried\.has\(id\)\) return false\s+tried\.set\(id, token\)\s+lightUp\(state\)/, 'another can be chosen, and shows at once')
})

// A SIZE TO CHOOSE (23 Nov 2026, issue 127). The user: "Only controls we need are colour, width, breadth and
// height. The height is only for base. Sizes are steps of 10m." And of the base's height, which first offered
// 1.6 m and then tens: "Going straight away to 10 is also not feeling good. So probably we can have some
// numbers like starting with 2, then 4, then 8, and then 10." That width is along x and breadth along y, how
// far the width and breadth go, and that the base is made 2 m tall, are a session's picks.
test('the stage\'s width, its breadth and the height of its base can be chosen, in steps of 10 m', () => {
  assert.deepEqual(STAGE.settings.map(s => `${s.group}: ${s.name}`), ['Size: Width', 'Size: Breadth', 'Size: Height of the base'])
  const [width, breadth, height] = STAGE.settings
  const [block, glass] = STAGE.shape.pieces
  assert.deepEqual([width.sets, breadth.sets, height.sets], [{ what: 'size', along: 'x' }, { what: 'size', along: 'y' }, { what: 'size', along: 'z' }])
  // "Sizes are steps of 10m"
  for (const flat of [width, breadth]) {
    assert.ok(flat.steps.every((step, n) => step.value === 10 * (n + 1) && step.name === `${step.value} m`), `${flat.name} goes in steps of 10 m`)
    assert.ok(flat.steps.length >= 5)
  }
  // "starting with 2, then 4, then 8, and then 10"; and 6 m, asked whether the card should offer it: "Yeah, let's do it."
  assert.deepEqual(height.steps.map(step => step.name), ['2 m', '4 m', '6 m', '8 m', '10 m'], 'the base\'s heights are the user\'s own numbers')
  assert.deepEqual(height.steps.map(step => step.value), [2, 4, 6, 8, 10])
  // each starts on the step the stage is made with: nothing changes until a size is chosen
  assert.deepEqual([width.value, breadth.value, height.value], [block.size.x, block.size.y, block.size.z])
  for (const setting of STAGE.settings) assert.ok(setting.steps.some(step => step.value === setting.value), `${setting.name} starts on one of its steps`)
  // the stage in a size chosen: the same stage, wider and longer, its corners, its border and its look its own
  const wide = sizedBy(STAGE, { x: 30, y: 20 })
  const [wideBlock, wideGlass] = wide.shape.pieces
  assert.deepEqual([wide.id, wide.name], [STAGE.id, STAGE.name])
  assert.deepEqual([wideBlock.size, wideGlass.size], [{ x: 30, y: 20, z: block.size.z }, { x: 30, y: 20, z: glass.size.z }], 'block and glass are both that wide and that long')
  assert.deepEqual([wideBlock.shape, wideBlock.border], [block.shape, block.border], 'the base tile\'s corners and border still')
  assert.deepEqual(wide.states, STAGE.states, 'and the same states')
  assert.deepEqual(wide.settings.map(s => s.value), [30, 20, block.size.z], 'and it knows the size it is in')
  // "The height is only for base": what is chosen is the base's height, and the stage is no wider or longer for it
  const tall = sizedBy(STAGE, { z: 10 })
  const [tallBlock, tallGlass] = tall.shape.pieces
  assert.equal(tallBlock.size.z, 10)
  assert.deepEqual([tall.size.x, tall.size.y], [STAGE.size.x, STAGE.size.y])
  // "we should make the border relative to its height", then "reduce the relative constant of the border too":
  // the border grows with the base, but by less than the base does.
  // "the height of the glass slab should also be relative to the height of the base ... I meant the thickness of
  // it": the glass is the same share of the base's height thick at every height.
  // "I did not mean the gap between base and the glass. I think that relative value should be quite low": the gap
  // grows only a little. And the stage on its first base is as the user fixed it.
  for (const metres of height.steps.map(step => step.value)) {
    const grown = sizedBy(STAGE, { z: metres })
    const [grownBlock, grownGlass] = grown.shape.pieces
    const [gapNow, gapMade] = [grownGlass.up - grownBlock.size.z, glass.up - block.size.z]
    assert.ok(Math.abs(grownGlass.size.z / metres - glass.size.z / block.size.z) < 1e-9, `on a base ${metres} m tall the glass is the same share of that height thick`)
    assert.equal(grownBlock.border.colour, block.border.colour, 'the border is in the base tile\'s border colour still')
    assert.equal(grownGlass.border.width, grownBlock.border.width, 'and the glass\'s border is as wide as the block\'s')
    assert.ok(Math.abs(grown.size.z - (grownGlass.up + grownGlass.size.z)) < 1e-9, 'and the stage is as tall as the top of its glass')
    if (metres === block.size.z) continue
    const taller = metres / block.size.z
    assert.ok(grownBlock.border.width > block.border.width && grownBlock.border.width < taller * block.border.width, `on a base ${metres} m tall the border is wider, but by less than the base is taller`)
    assert.ok(gapNow > gapMade && gapNow / gapMade < grownBlock.border.width / block.border.width, 'and the gap is larger by less still')
    assert.ok(gapNow < 2 * gapMade, 'the gap\'s growth is quite low: never twice what it is on the first base')
  }
  assert.equal(sizedBy(CAMERA_MODULE, { x: 20 }), null, 'an element whose size cannot be chosen is not made in another')
  // on the base platform a stage covers whole tiles: an even number of tiles wide, it stands on the line between two
  const on = fitsOn(STAGE, BASE_PLATFORM)
  assert.deepEqual(fitsOn(sizedBy(STAGE, { x: 20 }), BASE_PLATFORM), { ...on, x: on.x + 5 })
  assert.deepEqual(fitsOn(sizedBy(STAGE, { x: 30, y: 20 }), BASE_PLATFORM), { ...on, y: on.y + 5 })
})

// THE TILE'S BORDER (21 Nov 2026). The user: "what I want to add to tiles is that ... to have a border. Let's
// keep the border size to be 0.1 meters." Its colour, and that the world is always seen in Eidos's dark roles,
// are picks, and are not tested as rules.

test('the base tile has a border 0.1 m wide, all the way round, inside its 10 m by 10 m', () => {
  assert.equal(BASE_TILE.border.width, 0.1)
  // the tile is no bigger for it
  assert.deepEqual([BASE_TILE.size.x, BASE_TILE.size.y], [10, 10])
  const within = withinBorder(BASE_TILE)
  assert.deepEqual([within.size.x, within.size.y, within.size.z].map(v => +v.toFixed(9)), [9.8, 9.8, BASE_TILE.size.z], 'what lies inside the border is 0.1 m smaller all round, and as thick')
  assert.ok(Math.abs(within.shape.cornerRadius - 0.9) < 1e-9, 'its corners are rounded by 0.1 m less, so the border is as wide round a corner as along a side')
  // along a side, and round a corner
  assert.ok(inBorder(BASE_TILE, 4.95, 0) && inBorder(BASE_TILE, 0, -4.95) && inBorder(BASE_TILE, -4.99, 3) && inBorder(BASE_TILE, 4.91, 0))
  assert.ok(!inBorder(BASE_TILE, 4.89, 0) && !inBorder(BASE_TILE, 0, 0), 'further in is the tile itself')
  assert.ok(!inBorder(BASE_TILE, 5.01, 0), 'further out is not the tile')
  const onDiagonal = d => [4 + d * Math.SQRT1_2, 4 + d * Math.SQRT1_2]
  assert.ok(inBorder(BASE_TILE, ...onDiagonal(0.95)) && !inBorder(BASE_TILE, ...onDiagonal(0.89)) && !inBorder(BASE_TILE, ...onDiagonal(1.01)), 'round a corner it is the outermost 0.1 m too')
  // everywhere: each point of the tile's outline is 0.1 m from the nearest point of what lies inside the border
  const inner = outline(within)
  for (const p of outline(BASE_TILE)) {
    const nearest = Math.min(...inner.map(q => Math.hypot(p.x - q.x, p.y - q.y)))
    assert.ok(Math.abs(nearest - 0.1) < 0.002, `at x ${p.x.toFixed(2)}, y ${p.y.toFixed(2)} the border is ${nearest.toFixed(4)} m wide`)
    assert.ok(inBorder(BASE_TILE, p.x * 0.9999, p.y * 0.9999), 'the border goes all the way round')
  }
  // the ground the border covers: the tile's, less what lies inside it
  const area = points => points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + (p.x * q.y - q.x * p.y) / 2 }, 0)
  const wanted = (100 - (4 - Math.PI) * 1) - (9.8 * 9.8 - (4 - Math.PI) * 0.81)
  assert.ok(Math.abs(area(outline(BASE_TILE)) - area(inner) - wanted) < 0.01, `the border covers ${wanted.toFixed(3)} square metres`)
})

test('the border is drawn from the tile\'s data, through its whole thickness, and the astroid has none', () => {
  const values = [...TOKENS.matchAll(new RegExp(`${BASE_TILE.border.colour}:\\s*(#[0-9A-Fa-f]{6})`, 'g'))].map(m => m[1])
  assert.ok(values.length > 0, `${BASE_TILE.border.colour} is a colour of Eidos`)
  const made = code(read('drawing/make.ts'))
  assert.match(made, /ring\.holes\.push\(new THREE\.Path\(points\(within\)\)\)/, 'the border is the whole outline with what lies inside it cut out')
  assert.match(made, /shape: raised\(ring\), surface: matte\(element\.border\.colour\)/, 'raised to the tile\'s thickness, in the colour its data names')
  assert.match(made, /shape: raised\(new THREE\.Shape\(points\(within\)\)\), surface: matte\(element\.surface\.colour\)/, 'and what lies inside it is the tile\'s own surface')
  assert.equal(ASTROID.border, undefined)
  assert.equal(withinBorder(ASTROID), null)
  assert.equal(borderWords(ASTROID), null)
  assert.ok(!inBorder(ASTROID, 0, 0))
  // a tile with a border still covers the same ground, so what is laid still covers the land once
  assert.ok(covers(BASE_TILE, 4.95, 0) && covers(BASE_TILE, 4.5, 0))
  assert.equal(inWords(BASE_TILE), '10 m along x, 10 m along y, 0.2 m thick; corners rounded by 1 m; matte black; a border 0.1 m wide')
  assert.equal(inWords(ASTROID), '2 m along x, 2 m along y, 0.2 m thick; four points 1 m from its middle, sides curved inward by 1 m; matte, in the secondary colour')
})

test('the drone and the camera module are recoloured (23 Nov 2026, piece 41)', () => {
  const by = (e, re) => e.shape.pieces.filter(p => re.test(p.name))
  // "the body to be red" (the nearest role of Eidos, which has no crimson)
  assert.equal(DRONE.surface.colour, '--eio-color-text-danger')
  // "the w- wings to be ... glossy black" (the four fans)
  for (const f of by(DRONE, /^fan/)) assert.deepEqual([f.surface.colour, f.surface.finish], [BASE_TILE.surface.colour, 'glossy'])
  // "the circles around the fans can be matte black" (the four rings)
  assert.equal(by(DRONE, /^ring/).length, 4)
  for (const r of by(DRONE, /^ring/)) assert.deepEqual([r.surface.colour, r.surface.finish], [BASE_TILE.surface.colour, BASE_TILE.surface.finish])
  // "I want rest of the body to be matte black" (the camera module, as the base tile)
  assert.deepEqual([CAMERA_MODULE.surface.colour, CAMERA_MODULE.surface.finish], [BASE_TILE.surface.colour, BASE_TILE.surface.finish])
})

// FOUR POSTS (23 Nov 2026, piece 43, issue 127). The user: "the border radius of the base is 1 meter, right? So
// at the center of that 1 meter border radius, that is like 0.5 meters from the corner, let's add cylinders
// connecting the glass and the base on all the four corners."
test('four posts join the glass to the block, one on each corner, 1 m in from its two sides, in the sides\' material and light', async () => {
  const posts = STAGE.shape.pieces.filter(p => p.name.startsWith('post'))
  assert.equal(posts.length, 4, 'four cylinders, one at each corner')
  const [block, glass] = STAGE.shape.pieces
  assert.deepEqual(posts.map(p => p.at).sort((a, b) => a.x - b.x || a.y - b.y), [{ x: -4, y: -4 }, { x: -4, y: 4 }, { x: 4, y: -4 }, { x: 4, y: 4 }], 'at the 10 m stage: x +-4, y +-4 (1 m in from two sides: the corner radius)')
  for (const post of posts) {
    assert.equal(post.up, block.size.z, 'each stands on the block')
    assert.ok(Math.abs(post.up + post.size.z - glass.up) < 1e-9, 'and reaches the underside of the glass')
  }
  // they follow the corners and the gap when the stage changes size
  const big = STAGE.sized({ x: 40, y: 20, z: 10 })
  const bigBlock = big.shape.pieces[0], bigGlass = big.shape.pieces[1]
  for (const post of big.shape.pieces.filter(p => p.name.startsWith('post'))) {
    assert.equal(Math.abs(post.at.x), 19)
    assert.equal(Math.abs(post.at.y), 9)
    assert.ok(Math.abs(post.up + post.size.z - bigGlass.up) < 1e-9 && post.up === bigBlock.size.z)
  }
  // PIECE 44. The user: "The posts should have the material and color of the sides, and I think we should push
  // the posts to 1 meter inside from left and right of the corner."
  assert.equal(Math.abs(posts[0].at.x), STAGE.size.x / 2 - BASE_TILE.shape.cornerRadius, '1 m in = the corner radius')
  for (const post of posts) {
    assert.equal(post.surface.colour, BASE_TILE.border.colour, 'the colour of the sides')
    assert.equal(post.surface.shine, STAGE.surface.shine, 'the shine of the sides')
  }
  const lit = STAGE.states.find(s => s.id === 'active').glow.borders
  const sides = lit.find(b => b.piece === 'block')
  for (const post of posts) {
    const g = lit.find(b => b.piece === post.name)
    assert.ok(g, 'lit in active')
    assert.equal(g.bright, sides.sidesBright, 'as bright as the sides')
    assert.equal(g.colour, sides.colour, 'the same one colour')
  }
})

// THE BASE PLATFORM AS A MÖBIUS STRIP (23 Nov 2026, issue 127, pieces 51 to 53). The user: "Now, what I want us
// to try is that to make the base platform of the world like a Mobius strip." Then: "I want the tiles to be always
// a square? I mean, without deforming the current base tile what we have". Then, of a 7 km loop: "the strip is
// too long and not as smooth as the previous version ... Most parts feel like a plane without any curve."
test('the base platform as a Möbius strip: 21 square tiles across, curving all the way, one side only', () => {
  const bend = MOBIUS_PLATFORM.shape.bend
  const L = bentLength(bend)
  assert.ok(ELEMENTS.includes(MOBIUS_PLATFORM), 'it is in the gallery')
  assert.equal(bend.across, 2 * HALF, '21 tiles across, as the land')
  assert.ok(L < 7100, 'shorter than the 7 km loop the user found too long')
  assert.equal(L % BASE_TILE.size.y, 0, 'whole rows of tiles all the way round')
  assert.equal(MOBIUS_PLATFORM.shape.things.filter(t => t.element === BASE_TILE).length, 2 * 21 * (L / 10), 'a tile on every section, on each face (my pick: both faces)')
  const near = (a, b, d = 0.01) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < d
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
  // a tile keeps its shape: it is only moved and turned (across, along and up stay square to each other)
  for (let y = 5; y < L; y += 37) for (const x of [-100, 0, 60]) {
    const f = bentFrame(bend, x, y)
    for (const [a, b] of [[f.across, f.along], [f.along, f.up], [f.up, f.across]]) assert.ok(Math.abs(dot(a, b)) < 1e-9, `at x ${x}, y ${y} the tile is turned, not stretched`)
    for (const v of [f.across, f.along, f.up]) assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9)
  }
  // neighbouring tiles meet: the gap between one tile's end and the next's start stays small (my pick: under 0.4 m)
  let widest = 0
  for (let y = 5; y < L - 10; y += 10) for (let x = -100; x <= 100; x += 10) {
    const [a, b] = [bentFrame(bend, x, y), bentFrame(bend, x, y + 10)]
    widest = Math.max(widest, Math.hypot(...['x', 'y', 'z'].map(k => (a.at[k] + 5 * a.along[k]) - (b.at[k] - 5 * b.along[k]))))
  }
  assert.ok(widest < 0.4, `the widest gap between tiles along the strip is ${widest.toFixed(3)} m`)
  // it curves all the way round: no stretch of 100 m runs straight and flat
  for (let y = 0; y < L; y += 50) {
    const [a, b] = [bentFrame(bend, 0, y), bentFrame(bend, 0, y + 100)]
    assert.ok(dot(a.along, b.along) < 0.99999 || dot(a.up, b.up) < 0.99999, `it curves or twists between y ${y} and y ${y + 100}`)
  }
  // it never comes near itself: far parts of it keep apart
  let nearest = Infinity
  for (let y1 = 0; y1 < L; y1 += 20) for (let y2 = y1 + 400; y2 < L && L - (y2 - y1) >= 400; y2 += 20) {
    for (const x1 of [-105, 0, 105]) for (const x2 of [-105, 0, 105]) {
      const [p, q] = [bent(bend, x1, y1, 0), bent(bend, x2, y2, 0)]
      nearest = Math.min(nearest, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z))
    }
  }
  assert.ok(nearest > 20, `far parts of the strip keep ${nearest.toFixed(0)} m apart`)
  // going once round comes back with x the other way and up turned down: the strip has one side
  for (const x of [-105, -40, 0, 55, 105]) assert.ok(near(bent(bend, x, L, 0), bent(bend, -x, 0, 0)), `x ${x} at the end of the loop is x ${-x} at its start`)
  assert.ok(near(bentFrame(bend, 0, L).up, { x: -bentFrame(bend, 0, 0).up.x, y: -bentFrame(bend, 0, 0).up.y, z: -bentFrame(bend, 0, 0).up.z }, 1e-4), 'and its face there is the face below at the start')
  // it stands by the middle of its base: lowest point on z 0
  let lowest = Infinity
  for (let y = 0; y <= L; y += 5) for (const x of [-105, 0, 105]) for (const z of [-0.2, 0.2]) lowest = Math.min(lowest, bent(bend, x, y, z).z)
  assert.ok(lowest > -1e-6 && lowest < 0.05, 'its lowest point is on z 0')
  assert.ok(Math.abs(MOBIUS_PLATFORM.size.z - bentSize(bend).z) < 0.06, 'its size is the room it takes')
  assert.equal(fitsOn(MOBIUS_PLATFORM, BASE_PLATFORM), null, 'a platform is not set on another')
})

// THE CHARACTERS AS ELEMENTS (23 Nov 2026). The user: "bring in the characters into elements". And on 17 Nov: characters
// of about 6 feet; standing is not the resting idle "with the right leg bent" but "just standing", legs straight, arms
// down; and "we should bring in Mannequin and Fairyboat too". That their states are these three, that they walk and
// run on the spot, the room they take up, how far the arms hang out and their sentences are a session's design and
// are not held as rules.
test('the three characters are elements: drawn from their files as tall as a character is, standing first, then walking and running', () => {
  for (const one of [CLAY, MANNEQUIN, FAIRY_BOT]) {
    assert.ok(ELEMENTS.includes(one), `${one.name} is in the gallery`)
    assert.equal(one.shape.kind, 'model', `${one.name} is drawn from its files`)
    assert.equal(one.size.z, value('noi.eio.world.character.height'), 'as tall as Eidos says a character is: one height for all')
    assert.match(sizeWords(one), / m tall$/, 'and said to be so tall')
    // standing first, and standing is no clip: the state says to stand, and the drawing plays nothing for it
    assert.deepEqual(one.states.map(s => s.name), ['Standing', 'Walking', 'Running'])
    assert.deepEqual(one.states.map(s => s.motion), ['stand', 'walk', 'run'])
    for (const s of one.states) assert.deepEqual(poseIn(s, 3), poseIn(undefined, 3), `${s.name.toLowerCase()}, it stays on its place`)
    // it stands by itself: on ground, not on studs
    assert.ok(fitsOn(one, BASE_PLATFORM), `${one.name} can be placed on the base platform`)
    assert.equal(fitsOn(one, DRONE), null)
  }
  assert.equal(calledIn(CLAY), 'Clay', 'Clay is called by his own name')
  assert.equal(calledIn(MANNEQUIN), 'the mannequin')
  assert.equal(calledIn(DRONE), 'the drone', 'and the rest as before')
  // the Fairy Bot has its wings, hung by its own numbers (the old project's)
  assert.match(code(read('fairy-bot/fairy-bot.ts')), /wings: \{\s+file: 'fairy-bot\/wings\.glb',\s+\.\.\.WINGS,/)
  assert.doesNotMatch(code(read('clay/clay.ts')) + code(read('mannequin/mannequin.ts')), /wings:/, 'and only the Fairy Bot')
  // drawn by the world's three.js into the element's body, which is in xyz: stood up, the mirror undone, as tall as
  // Eidos says, its feet on its place and its middle over it
  const drawing = code(read('character-drawing/characters.ts'))
  assert.match(drawing, /const THREE = world\.three/, 'with the world\'s own three.js')
  assert.match(drawing, /holder\.rotation\.x = Math\.PI \/ 2\s+holder\.scale\.x = -1/, 'a model\'s y up is the world\'s z up, and the mirror of xyz is undone')
  assert.match(drawing, /const k = CHARACTER_SIZE\.z \/ tall/, 'as tall as a character is')
  assert.match(drawing, /inner\.position\.set\(\(0 - k \* \(box\.min\.x \+ box\.max\.x\)\) \/ 2, 0 - k \* box\.min\.y, /, 'its feet on its place, its middle over it')
  const made = code(read('drawing/make.ts'))
  assert.match(made, /if \(drawn\) body\.add\(drawn\.thing\)/, 'into the body of the thing, which goes into xyz')
  assert.match(made, /drawn\?\.act\(next\)/, 'and acts out the state it is put in')
  // loaded when it is first shown, not when a page opens: nothing of three.js is imported but its types
  assert.doesNotMatch(drawing, /^\s*import\s+(?!type\b)[^\n]*from\s+'three/m)
  assert.match(drawing, /await import\('three\/examples\/jsm\/loaders\/GLTFLoader\.js'\)/, 'the loader for model files is asked for when a character is drawn')
})
