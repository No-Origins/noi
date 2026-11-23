// The new 3D world (21 Nov 2026), from the user's three answers of that day: three.js draws all of it, no
// panels unless asked for, and nothing of the first world is assumed. While it is an empty stage these are its
// rules: the picture's size is bounded, the world's own code draws with three.js alone, and the page lays
// nothing over the world.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MOST_DOTS, pictureSize } from '../app/hyperbase/world/world.ts'
import { bent, bentSize, frameOf, lengthOf } from '../app/hyperbase/world/bend.ts'
import { at, between, fromThree, readPlace, readSpan, standsOn, toThree, writePlace, writeSpan } from '../app/hyperbase/world/place.ts'
import {
  EVERY, HALF, ISOMETRIC, LAID_BY_THE_USER, LONG, SHOWN, SIDES, USERS_MARKERS, WAYS, astroidsBetween, changed, covering, edgeNumbers, edges, highestTop, inPicture, isometricOver, markerBox, markers,
  markersShown, marks, middleOf, onLand, openLand, pictureHolds, pointerWords, runs, sideMiddle, sideNames, slid, startOfLand, elementOf, thingWords, thingsOver, topAt, travelled, wayInPicture, wordsShown,
} from '../app/hyperbase/world/land.ts'
import {
  ASTROID, BASE_PLATFORM, BASE_TILE, MOBIUS_PLATFORM, CAMERA_MODULE, COLOURS_TO_TRY, DRONE, ELEMENTS, STAGE, STUD_GRID, coloursIn, fitsOn, sizedBy, borderWords, covers, elementById, firstSight, holesOf, inBorder, inWords, outline, pieceOutline, pieceTurn, poseIn, reachIn, shapeWords, sizeWords, withinPieceBorder,
  surfaceWords, withinBorder,
} from '../app/hyperbase/world/elements.ts'

const WORLD = fileURLToPath(new URL('../app/hyperbase/world/', import.meta.url))

// Each solid has a test file of its own in test/world-elements/, so that several can be made at once without
// two hands in this file. They run with this one.
// (There is none while no solid is an element: the user had the four removed on 22 Nov 2026.)
const OWN_TESTS = new URL('./world-elements/', import.meta.url)
for (const file of (existsSync(OWN_TESTS) ? readdirSync(OWN_TESTS) : []).filter(f => f.endsWith('.test.mjs')).sort()) {
  await import(`./world-elements/${file}`)
}
const read = name => readFileSync(WORLD + name, 'utf8')

// How many tiles and astroids cover the land: it is 21 tiles across and 60 long (210 m by 600 m).
// The user, 23 Nov 2026: "if there are only 21 tiles in a row, so that becomes odd ... our x0 and y0 can always pass through the center of the center column."
const [TILES, ASTROIDS] = [21 * 60, 20 * 59]
const code = text => text.replace(/\/\*[\s\S]*?\*\/|^[ \t]*\/\/.*$/gm, '')

test('the picture is as fine as the screen, up to a bound', () => {
  assert.deepEqual(pictureSize(800, 600, 1), { width: 800, height: 600, dots: 1 })
  assert.deepEqual(pictureSize(800, 600, 2), { width: 1600, height: 1200, dots: 2 })
  assert.equal(pictureSize(800, 600, 3).dots, MOST_DOTS, 'a finer screen does not make a costlier picture')
  assert.equal(pictureSize(800, 600, 0.5).dots, 1, 'never coarser than the page')
  assert.equal(pictureSize(800, 600, undefined).dots, 1, 'a browser that does not say counts as one')
})

test('a stage that is not laid out yet still asks for a picture of something', () => {
  assert.deepEqual(pictureSize(0, 0, 2), { width: 1, height: 1, dots: 2 })
})

test('three.js draws all of it: the world writes no drawing code of its own', () => {
  for (const name of readdirSync(WORLD).filter(f => /\.tsx?$/.test(f))) {
    const text = code(read(name))
    assert.doesNotMatch(text, /getContext\(/, `${name} asks the canvas for a drawing context of its own`)
    assert.doesNotMatch(text, /\bgl\.(draw|bind|use|create)[A-Z]/, `${name} draws by hand`)
    assert.doesNotMatch(text, /@noi\/eio-3d/, `${name} takes from the first world's elements`)
  }
  assert.match(code(read('world.ts')), /import\('three\/webgpu'\)/, 'three.js is asked for only when the world opens')
})

// THIS RULE CHANGED AT THE USER'S WORD (21 Nov 2026). It was "nothing lies over the world: no panel, no
// control". Then the user: "currently I want you to add toggle to turn off the markers that we currently have
// on the world." So: over the world lies only what the user asked for, and so far that is one toggle.
// AND (22 Nov 2026) the user, of the names of the land's four sides: "anything that you're adding, any element,
// you have to first check if it's existing in the design system. So I think the marker that you added, I think
// you can use the existing elements from our design system." And of the land's other words: "Yes, those too".
// So the words on the land (LandWords.tsx) are Eidos's own Badge, which is no control: there is still one
// control, the toggle.
test('over the world lies only what the user asked for: one toggle, for the markers', () => {
  const view = code(read('WorldView.tsx'))
  assert.doesNotMatch(view, /<(button|input|select|textarea|dialog|aside|nav|form)\b/i, 'the page puts a hand-made control over the world')
  assert.deepEqual([...view.matchAll(/from '@noi\/eio-react'/g)].length, 1)
  // the toggle is Eidos's own Toggle (22 Nov 2026: the user agreed a Toggle for the design system, and that the
  // Markers control becomes one; till then it was a Checkbox, since Eidos had no toggle)
  assert.match(view, /import \{ Toggle \} from '@noi\/eio-react'/, 'the one part of Eidos this page puts over the world is the toggle')
  // a part on the page is a "<Name" that no word runs into (which leaves out types such as useRef<...>)
  const parts = text => [...text.matchAll(/(?<![\w.])<([A-Z]\w*)/g)].map(m => m[1])
  assert.deepEqual(parts(view), ['LandWords', 'Toggle'], 'the words on the land, one control, and no other part')
  // the words on the land are Eidos's Badge and nothing else: no control is among them
  const words = code(read('LandWords.tsx'))
  assert.doesNotMatch(words, /<(button|input|select|textarea|dialog|aside|nav|form|a)\b/i, 'no word on the land can be pressed')
  assert.deepEqual([...words.matchAll(/from '@noi\/eio-react'/g)].length, 1)
  assert.match(words, /import \{ Badge \} from '@noi\/eio-react'/, 'the one part of Eidos the words are drawn with is its Badge')
  assert.deepEqual([...new Set(parts(words))].sort(), ['Badge', 'PointerPlace'], 'and no other part of Eidos')
  assert.match(view, /<Toggle checked=\{markers\} onChange=\{e => land\.change\(\{ what: 'markers', on: e\.target\.checked \}\)\}>Markers<\/Toggle>/, 'it turns the markers off and on by naming a change to the land')
  assert.match(view, /opened\.watch\(now => setMarkers\(markersShown\(now\)\)\)/, 'and shows what the land says, also when code changes it')
})

// WHAT THE TOGGLE SWITCHES CHANGED AT THE USER'S WORD (21 Nov 2026). First built to switch the upright markers
// at the crossings (my reading of "the markers"). Then the user: "By markers, I meant x and y axis, and at the
// same time, all the numbers on x and y axis." And, asked whether the upright markers go off with them: "I
// mean, along with the previous markers which you also added to the toggle." And then: "along with all the
// 1 meter X and Y lines too." And, asked whether the 10 m lines go off too: "Those markers too". So all of
// these by the user's word. That the line round the land's edge goes with them is my reading, and is not
// tested as a rule.
test('the markers are the x and y axes, the numbers on them, the upright markers, and the 1 m and 10 m lines, switched together', () => {
  for (const part of ['axes', 'edgeNumbers', 'markers', 'metreLines', 'lines']) assert.ok(USERS_MARKERS.includes(part), `"${part}" is one of the markers`)
  assert.ok(!USERS_MARKERS.includes('pointer'), 'the place under the pointer is not')
  assert.ok(USERS_MARKERS.includes('metreLines'), 'the lines every metre')
  assert.ok(USERS_MARKERS.includes('lines'), 'the lines every 10 m: every line on the ground')
  assert.ok(USERS_MARKERS.includes('axes'), 'the x axis and the y axis')
  assert.ok(USERS_MARKERS.includes('edgeNumbers'), 'the numbers along them')
  assert.ok(USERS_MARKERS.includes('markers'), 'and the upright markers at the crossings, with their words')
  const land = openLand()
  assert.equal(markersShown(land.state), true, 'they are shown from the start')

  land.change({ what: 'markers', on: false })
  assert.equal(land.state.seen.axes, false, 'the two axes go')
  assert.equal(land.state.seen.edgeNumbers, false, 'and the numbers along the edges, at the same time')
  assert.equal(land.state.seen.markers, false, 'and the upright markers with their words')
  assert.equal(land.state.seen.metreLines, false, 'and the lines every metre')
  assert.equal(markersShown(land.state), false)
  assert.equal(land.state.seen.lines, false, 'and the lines every 10 m: every line on the ground')
  assert.equal(land.state.seen.pointer, true, 'so does the place under the pointer')
  assert.equal(land.state.things.length, TILES + ASTROIDS, 'and what is laid')
  const off = land.state
  land.change({ what: 'markers', on: false })
  assert.equal(land.state, off, 'turning off what is off changes nothing')

  land.change({ what: 'markers', on: true })
  assert.deepEqual(land.state.seen, startOfLand().seen, 'turned on, all is as it started')

  // one of them alone can still be switched by its own name, and the toggle then says "shown"
  land.change({ what: 'markers', on: false })
  land.change({ what: 'show', way: 'edgeNumbers', on: true })
  assert.equal(markersShown(land.state), true)
  assert.throws(() => land.change({ what: 'markers', on: 'no' }))

  const picture = code(read('drawLand.ts'))
  assert.match(picture, /axesOn\.value = s\.seen\.axes \? 1 : 0/, 'the picture takes the axes\' colour away by the land\'s data')
  assert.match(picture, /lineAt\(here\.y\)\.mul\(axesOn\)/, 'the x axis')
  assert.match(picture, /lineAt\(here\.x\)\.mul\(axesOn\)/, 'the y axis')
  assert.match(picture, /numbers\.visible = s\.seen\.edgeNumbers/, 'and the numbers along the edges')
  assert.match(picture, /uprights\.visible = s\.seen\.markers/, 'and the upright markers')
  assert.match(picture, /for \(const o of standingWords\) uprights\.add\(o\)/, 'whose words go with them')
  assert.doesNotMatch(picture, /lines\(EVERY\)[^\n]*axesOn/, 'the 10 m lines, also the ones along x 0 and y 0, do not go with the axes')
  assert.match(picture, /metreOn\.value = s\.seen\.metreLines \? 1 : 0/, 'the picture takes the 1 m lines away by the land\'s data')
  assert.match(picture, /const everyMetre = lines\(1\)\.mul\(metreOn\)/, 'the lines every metre')
  assert.doesNotMatch(picture, /lines\(EVERY\)[^\n]*metreOn/, 'the lines every 10 m do not go with the 1 m ones alone')
  assert.match(picture, /linesOn\.value = s\.seen\.lines \? 1 : 0/, 'every line on the ground goes by the land\'s data')
  assert.match(picture, /\.mul\(float\(1\)\.sub\(smoothstep\(0\.2, 0\.5, max\(w\.x, w\.y\)\)\)\)\.mul\(linesOn\)/, 'the 1 m and the 10 m lines alike')
})

// THE NAMES OF THE LAND'S FOUR SIDES (22 Nov 2026, issue 127). The user: "I want us to have pointers for the
// platform, the world base that we built, like the beginning, the end, the left and right of the beginning. So
// these are just markers. These are not part of the world. These are just markers, part of the markers, so
// that I can also point out where to put things." How far out a name stands is a session's pick, and is not
// tested as a rule. Which side is which was a session's reading until 22 Nov 2026, when the user chose the
// numbers ("Both": see the crossing's test below): the beginning is the side along y 0, the end the side along
// y 200, and the left side is on the left of the picture, along x -105.
test('the land\'s four sides have names: the beginning, the end, the left and the right of the beginning, and they are markers', () => {
  assert.deepEqual(SIDES.map(s => s.name), ['Beginning', 'End', 'Left', 'Right'])
  const land = openLand()
  const names = sideNames(land.state)
  const by = Object.fromEntries(names.map(n => [n.id, n]))
  assert.deepEqual(names.map(n => n.words), ['Beginning', 'End', 'Left', 'Right'])
  for (const n of names) {
    assert.ok(!onLand(n.place), `"${n.words}" stands outside the land: it is not part of the world`)
    assert.equal(n.place.z, 0)
    assert.equal(between(n.side.from, n.side.to), n.side.from.y === n.side.to.y ? 2 * HALF : LONG, `"${n.words}" names one whole side`)
    assert.ok(edges().some(e => [writeSpan(e), writeSpan({ from: e.to, to: e.from })].includes(writeSpan(n.side))), 'which is one of the land\'s own four edges')
    assert.deepEqual(n.middle, at((n.side.from.x + n.side.to.x) / 2, (n.side.from.y + n.side.to.y) / 2), 'its middle is the middle of that side')
    assert.ok(between(n.place, n.middle) < between(n.place, middleOf()), 'and the name stands off that middle, away from the land')
  }
  assert.equal(new Set(names.map(n => writeSpan(n.side))).size, 4, 'each side has one name')
  // the end is across from the beginning; the numbers start at the beginning and grow toward the end
  assert.equal(between(by.beginning.middle, by.end.middle), LONG, 'the end is the side across from the beginning')
  assert.deepEqual(by.beginning.middle, at(0, 0), 'x 0, y 0 is the middle of the beginning\'s side')
  assert.deepEqual(by.end.middle, at(0, 600), 'and the end\'s side is along y 600')
  // "Left on the left": the left side is the one toward low x, and it is on the left of the picture
  assert.deepEqual([by.left.middle, by.right.middle], [at(-105, 300), at(105, 300)], 'the left side along x -105, the right side along x 105')
  const seen = place => inPicture(land.state.eye, place)
  assert.ok(seen(by.left.middle).right < seen(by.right.middle).right, 'in the picture the left side is to the left of the right side')

  // "just markers, part of the markers": they go off and on with the markers, and are no thing laid on the land
  assert.ok(USERS_MARKERS.includes('sideNames'))
  assert.equal(land.state.seen.sideNames, true, 'shown from the start')
  land.change({ what: 'markers', on: false })
  assert.equal(land.state.seen.sideNames, false, 'off with the markers')
  assert.equal(land.state.things.length, TILES + ASTROIDS, 'and nothing laid has changed')
  land.change({ what: 'markers', on: true })
  assert.equal(land.state.seen.sideNames, true, 'and on with them')
  assert.ok(land.state.things.every(t => !SIDES.some(s => s.id === t.element)), 'no name is a thing of the world')

  // they follow the edge when it moves, and are drawn from the land's data
  const wider = sideNames(changed(land.state, { what: 'edge', half: 155, long: 800 }))
  assert.deepEqual(wider.map(n => writePlace(n.middle)), ['x 0, y 0', 'x 0, y 800', 'x -155, y 400', 'x 155, y 400'], 'the beginning stays; the other three move out')
  const picture = code(read('drawLand.ts'))
  assert.match(picture, /const named = sideNames\(s\)\.map\(n => \(\{ n, kept: spotAt\(n\.place\) \}\)\)/, 'the picture keeps a spot for each name from the land\'s data, over the name\'s place')
  assert.match(picture, /for \(const \{ kept \} of named\) names\.add\(kept\)/)
  assert.match(picture, /names\.visible = s\.seen\.sideNames/, 'and shows and hides them by it')
  // the user (22 Nov): "anything that you're adding, any element, you have to first check if it's existing in
  // the design system ... the marker that you added, I think you can use the existing elements from our design
  // system": a name is drawn with Eidos's own Badge, and has no hand-made look
  const words = code(read('LandWords.tsx'))
  assert.match(picture, /kind: 'sideName', id: `side \$\{n\.id\}`, words: n\.words, spot: kept\.element/, 'the page is told each name\'s spot')
  assert.match(words, /createPortal\(<Badge>\{s\.words\}<\/Badge>, s\.spot, s\.id\)/, 'each name is Eidos\'s Badge, drawn into its spot')
  assert.doesNotMatch(read('world.module.css'), /sideName/i, 'the page has no look of its own for a name')
  assert.doesNotMatch(picture, /classes\.sideName/)
})

// THE VIEW (22 Nov 2026, issue 127). The user: "The next change is fix the default view to isometric view, and
// the scroll should basically move the world from beginning to end direction." And, shown the way running up
// the picture and running down it as on the site they gave as inspiration, and asked which: "Down, like
// reference". How far back the eye stands, how much the picture holds, how far a scroll goes and how the eye
// glides are a session's picks, and are not tested as rules.
test('the land is seen in an isometric view from the start, and the hand does not turn it', () => {
  const land = startOfLand()
  const way = { x: land.eye.from.x - land.eye.at.x, y: land.eye.from.y - land.eye.at.y, z: land.eye.from.z - land.eye.at.z }
  assert.ok(way.z > 0, 'the eye is above what it looks at')
  assert.equal(Math.abs(way.x), way.z, 'it looks along as many metres of x as of height')
  assert.equal(Math.abs(way.y), way.z, 'and as many of y: the three directions are drawn equally long')
  assert.equal(land.eye.at.z, 0, 'it looks at the ground')
  assert.ok(onLand(land.eye.at, land), 'on the land')
  // the same sight over any other place
  const over = isometricOver(at(30, 40))
  assert.deepEqual(over.at, at(30, 40))
  assert.deepEqual([over.from.x - 30, over.from.y - 40, over.from.z], [way.x, way.y, way.z])
  assert.equal(ISOMETRIC.away, way.z)
  // "Down, like reference": the way from the beginning to the end runs down the picture, the beginning at the
  // upper right
  const names = Object.fromEntries(sideNames(land).map(n => [n.id, n.middle]))
  const seen = place => inPicture(land.eye, place)
  assert.ok(seen(names.beginning).up > seen(names.end).up, 'the beginning is above the end in the picture: the way runs down')
  assert.ok(seen(names.beginning).right > seen(names.end).right, 'and to the right of it: from the upper right to the lower left')
  // and with the numbers the user chose, x grows toward the right of the picture and y down it
  assert.ok(seen(at(10, 100)).right > seen(at(0, 100)).right, 'x grows toward the right of the picture')
  assert.ok(seen(at(0, 110)).up < seen(at(0, 100)).up, 'y grows down the picture')
  // isometric needs an eye for which a thing is as large far as near
  assert.match(code(read('WorldView.tsx')), /openWorld\(canvas, \{ background: css\.backgroundColor \}, 'orthographic'\)/, 'the land\'s stage is opened with an orthographic eye')
  const stage = code(read('world.ts'))
  assert.match(stage, /sees === 'orthographic' \? new THREE\.OrthographicCamera\(/, 'which three.js has')
  assert.match(stage, /sees: Seeing = 'perspective'/, 'one element alone is still seen in perspective')
  // "fix": the view is held; the hand does not turn it or bring it near
  const picture = code(read('drawLand.ts'))
  assert.match(picture, /openEye\(world, EYE_REACH\[0\], EYE_REACH\[1\], true\)/, 'the land\'s eye is held')
  assert.match(code(read('eye.ts')), /mover\.enabled = !held/, 'a held eye is not moved by the hand')
  assert.doesNotMatch(picture, /what: 'look', \.\.\.eye\.now\(\) \}\) \}\)\)/, 'and the hand writes no sight into the land')
})

test('scrolling moves the eye from the beginning toward the end, and no farther than either', () => {
  const land = openLand()
  const names = Object.fromEntries(sideNames(land.state).map(n => [n.id, n]))
  const start = land.state.eye
  assert.equal(travelled(land.state), 0, 'it starts at the beginning')
  assert.deepEqual(start.at, names.beginning.middle, 'looking at the middle of the beginning\'s side')

  land.change({ what: 'travel', by: 30 })
  assert.equal(travelled(land.state), 30)
  assert.equal(between(land.state.eye.at, names.beginning.middle), 30, 'on, 30 m from the beginning')
  assert.equal(between(land.state.eye.at, names.end.middle), LONG - 30, 'toward the end')
  assert.ok(slid(start, land.state.eye), 'looking the same way from as far: the view stays isometric')

  land.change({ what: 'travel', by: -10 })
  assert.equal(travelled(land.state), 20, 'and back toward the beginning')

  land.change({ what: 'travel', by: 1000 })
  assert.equal(travelled(land.state), LONG, 'no farther than the end')
  assert.deepEqual(land.state.eye.at, names.end.middle)
  const atEnd = land.state
  land.change({ what: 'travel', by: 5 })
  assert.equal(land.state, atEnd, 'travelling on at the end changes nothing')
  land.change({ what: 'travel', by: -1000 })
  assert.equal(travelled(land.state), 0, 'no farther back than the beginning')
  assert.deepEqual(land.state.eye, start, 'and there it is as it started')
  assert.throws(() => land.change({ what: 'travel', by: 'far' }))

  // the scroll names that change, and the eye follows the land
  const picture = code(read('drawLand.ts'))
  assert.match(picture, /canvas\.addEventListener\('wheel', onScroll, \{ passive: false \}\)/)
  assert.match(picture, /land\.change\(\{ what: 'travel', by: \(dots \* land\.state\.picks\.scrollGain\) \/ dotsAMetre \}\)/, 'scrolling on travels toward the end')
  assert.match(picture, /if \(slid\(before\.eye, now\.eye\)\) eye\.glide\(now\.eye\)/, 'the eye glides to where the land says it is')
  assert.ok(!slid(start, { from: at(0, -30, 1.6), at: at(0, -20, 1.4) }), 'a new way of looking is no slide')
})

// SEEING BOTH SIDE EDGES (22 Nov 2026, issue 127). The user: "I think we should also zoom out a bit because we
// are unable to see the edge of left and right. So in that case, maybe we can make y up to 600." That the
// picture fits itself to the window's shape, how many metres more it holds beyond each edge, and that the
// scroll moves the world as far as was scrolled, are a session's picks.
test('the picture holds the land from its left edge to its right edge', () => {
  const land = startOfLand()
  const names = Object.fromEntries(sideNames(land).map(n => [n.id, n]))
  for (const widthToHeight of [21 / 9, 16 / 9, 16 / 10, 4 / 3, 1, 0.6]) {
    const tall = pictureHolds(land, widthToHeight)
    const wide = tall * widthToHeight
    // the two ends of the beginning's side are on the left edge and on the right edge, beside the place the eye starts at
    for (const corner of [names.beginning.side.from, names.beginning.side.to]) {
      const seen = inPicture(land.eye, corner)
      assert.ok(Math.abs(seen.right) < wide / 2 && Math.abs(seen.up) < tall / 2, `in a window ${widthToHeight.toFixed(2)} times as wide as tall, ${writePlace(corner)} is in the picture`)
    }
  }
  assert.ok(pictureHolds(land, 1) > pictureHolds(land, 16 / 9), 'a narrower window holds more metres from bottom to top, to hold as many across')
  const wider = changed(land, { what: 'edge', half: 155 })
  assert.ok(pictureHolds(wider, 16 / 9) > pictureHolds(land, 16 / 9), 'a wider land is seen from farther')
  const picture = code(read('drawLand.ts'))
  assert.match(picture, /holds = pictureHolds\(land\.state, \(host\.clientWidth \|\| 1\) \/ \(host\.clientHeight \|\| 1\)\)/, 'the picture asks the land\'s data how much to hold, for its own shape')
  assert.match(picture, /world\.shows\(holds\)/)
  // an isometric eye draws a metre on the ground as the square root of two thirds of a metre
  assert.ok(Math.abs(wayInPicture(land) - Math.sqrt(2 / 3)) < 1e-9)
  assert.match(picture, /const dotsAMetre = \(\(canvas\.clientHeight \|\| 1\) \/ holds\) \* wayInPicture\(land\.state\)/)
})

// THE LAND'S OTHER WORDS (22 Nov 2026, issue 127). Asked "Should the land's other words (edge numbers, marker
// places, pointer place) use Eidos's parts too?", the user: "Yes, those too". So no word on the land has a
// look made by this page: a marker's place and the place under the pointer are Eidos's Badge, and a number
// along an edge is plain words in a text style of Eidos. That the numbers are plain words and not Badges too
// (84 pills along the edges cover each other from the start) is a session's pick, asked of the user.
test('every word on the land is drawn with what the design system has, and none has a look of this page\'s', () => {
  const picture = code(read('drawLand.ts'))
  const words = code(read('LandWords.tsx'))
  const view = code(read('WorldView.tsx'))
  const css = read('world.module.css')
  // an upright marker's place: a spot kept over the marker, Eidos's Badge drawn into it
  assert.match(picture, /standingWords = standing\.map\(m => spotAt\(m\.wordsAt\)\)/, 'the picture keeps a spot over each marker')
  assert.match(picture, /kind: 'markerPlace', id: `marker \$\{m\.words\}`, words: m\.words, spot: standingWords\[i\]!\.element/, 'and the page is told it, with the marker\'s place in words')
  // the place under the pointer: a spot kept by the pointer, Eidos's Badge with what the land's data says
  assert.match(picture, /const pointerSpot: WordSpot = \{ kind: 'pointerPlace', id: 'pointer', words: '', spot: readout\.element \}/)
  assert.match(words, /useState\(\(\) => pointerWords\(land\.state\)\)/, 'the pointer\'s words are what the land says')
  assert.match(words, /land\.watch\(now => setWords\(pointerWords\(now\)\)\)/, 'and follow it')
  assert.match(words, /createPortal\(<Badge>\{words\}<\/Badge>, spot\)/, 'in Eidos\'s Badge')
  assert.doesNotMatch(picture, /textContent = said/, 'the picture writes no words of its own by the pointer')
  assert.match(picture, /look\.spots\(\[\.\.\.marked, pointerSpot\]\)/, 'the page is told every spot')
  // a number along an edge: plain words, in a text style that is Eidos's own
  assert.match(view, /edgeNumber: `eio-type-style-caption \$\{styles\.edgeNumber \?\? ''\}`/, 'a number along an edge is in Eidos\'s caption style')
  assert.match(picture, /numbers\.add\(word\(n\.words, look\.classes\.edgeNumber, n\.place\)\)/)
  // and the page's own styles make no look for a word: no type, no plate, no line round it
  assert.doesNotMatch(css, /\.(word|markerWords|pointerWords|sideName)\s*\{/, 'the hand-made looks are gone')
  const numberStyle = /\.edgeNumber\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  assert.doesNotMatch(numberStyle, /font-family|font-size|font-weight|line-height|background|border|padding/, 'a number\'s type is Eidos\'s; the page gives only its colour')
})

// THE LAND AND ITS COORDINATES, as the user decided them on 21 Nov 2026 (issue 117 in noi-planning), each rule
// in the user's own choice. What the user has not chosen (the try's numbers, colours, the eye's start) is not a
// rule and is not tested as one.

// Every dash a keyboard or a dictation writes for "minus", by its number: hyphen-minus, hyphen, non-breaking
// hyphen, figure dash, en dash, em dash, bar, minus sign, small and wide hyphen-minus.
const DASHES = [0x2d, 0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212, 0xfe63, 0xff0d].map(c => String.fromCodePoint(c))

test('a place is written "x 10, y 15", and "x 10, y 15, z 3" off the ground', () => {
  assert.equal(writePlace(at(10, 15)), 'x 10, y 15')
  assert.equal(writePlace(at(10, 15, 3)), 'x 10, y 15, z 3')
  assert.equal(writePlace(at(10, 15, 0)), 'x 10, y 15', 'on the ground, the height is left out')
  assert.equal(writePlace(at(-10, -0.5, 2.25)), 'x -10, y -0.5, z 2.25')
  assert.equal(writePlace(at(-0, 0)), 'x 0, y 0', 'never "-0"')
  assert.equal(writePlace(at(0.1 + 0.2, 1 / 3)), 'x 0.3, y 0.333', 'sums leave no long tails')
  assert.equal(writePlace(at(12.34, -45.67), 1), 'x 12.3, y -45.7', 'fewer decimals when asked')
})

test('whatever reads a place takes the written form in any order, and bare numbers with x first', () => {
  assert.deepEqual(readPlace('x 10, y 15'), at(10, 15))
  assert.deepEqual(readPlace('x 10, y 15, z 3'), at(10, 15, 3))
  assert.deepEqual(readPlace('y 15, x 10'), at(10, 15), 'the order is free when each number has its letter')
  assert.deepEqual(readPlace('z 3, y 15, x 10'), at(10, 15, 3))
  assert.deepEqual(readPlace('10, 15'), at(10, 15), 'bare: x first')
  assert.deepEqual(readPlace('10, 15, 3'), at(10, 15, 3))
  assert.equal(readPlace('x 10, y 15').z, 0, 'height left out: on the ground')
  for (const kindly of ['X 10, Y 15', 'x10 y15', 'x=10, y=15', 'x: 10; y: 15', '(10, 15)', '10 15', 'x 10 and y 15', 'x 10, y 15.', 'x 10 m, y 15 m']) {
    assert.deepEqual(readPlace(kindly), at(10, 15), `"${kindly}" is the same place`)
  }
  assert.deepEqual(readPlace('x 10.5, y .25'), at(10.5, 0.25))
})

test('"minus" is read in any spelling', () => {
  for (const dash of DASHES) {
    assert.deepEqual(readPlace(`x ${dash}10, y 15`), at(-10, 15), `the dash U+${dash.codePointAt(0).toString(16)} is a minus`)
    assert.deepEqual(readPlace(`${dash}10, ${dash}15`), at(-10, -15))
  }
  for (const said of ['minus 10', 'Minus 10', 'MINUS10', 'minus10', 'negative 10', 'neg 10', '- 10']) {
    assert.deepEqual(readPlace(`x ${said}, y 15`), at(-10, 15), `"${said}" is minus 10`)
    assert.deepEqual(readPlace(`${said}, 15`), at(-10, 15))
  }
  assert.deepEqual(readPlace('x 10, y minus 15, z minus 2'), at(10, -15, -2))
  assert.deepEqual(readPlace('x minus 0, y 0'), at(0, 0), 'minus nothing is nothing')
})

test('what is read is answered in the written form', () => {
  const answer = text => writePlace(readPlace(text))
  assert.equal(answer('10, 15'), 'x 10, y 15')
  assert.equal(answer('minus 10, 15, 3'), 'x -10, y 15, z 3')
  assert.equal(answer('Y 15 X 10'), 'x 10, y 15')
  assert.equal(answer(`${DASHES[7]}40, ${DASHES[4]}7.5`), 'x -40, y -7.5')
})

test('words that are not one place are refused, never guessed', () => {
  for (const not of ['', 'x 10', '10', 'x 10, x 15', 'x 10, 15', '10, y 15', '10, 15, 3, 4', 'x 10, y 15, z 3, z 4',
    'ten, fifteen', 'over there', 'x 10, y', 'x ten, y 15', '1.2.3, 4', 'x 10 - y 15', 'put it at x 10, y 15']) {
    assert.equal(readPlace(not), null, `"${not}" is not a place`)
  }
})

// THE NUMBERS CHANGED AT THE USER'S WORD (22 Nov 2026, issue 127). They were: 0, 0 in the middle of the land,
// and the crossing x, z, -y. Then the land got an isometric view with the way from the beginning running down
// the picture, and the user: "Now that we have updated beginning and end, I also think we should update the
// axis and numbers." Shown a drawing of two ways ("y counts 0 at the beginning to 200 at the end", and "x is
// turned round so it grows toward the right of the picture: Left on the left") and asked which, they chose
// "Both". Turning x round is done in the one crossing, which is now -x, z, -y.
test('the user\'s x, y, z become three.js\'s -x, z, -y in one function, and come back by one', () => {
  assert.deepEqual(toThree(at(10, 15, 3)), [-10, 3, -15])
  assert.deepEqual(fromThree(-10, 3, -15), at(10, 15, 3))
  assert.deepEqual(toThree(at(0, 0, 0)), [0, 0, 0], 'x 0, y 0 is three.js\'s middle, with no "-0"')
  assert.deepEqual(toThree(at(0, 0, 1)), [0, 1, 0], 'z is up')
  for (const p of [at(0, 0), at(-100, 100), at(37.5, -62.25, 4), at(100, -100, 0.001)]) {
    assert.deepEqual(fromThree(...toThree(p)), p, `${writePlace(p)} comes back as it went`)
  }
})

test('one step is one metre: the crossing changes no length', () => {
  const [a, b] = [at(10, 15, 3), at(-4, 20, 0.5)]
  const [ta, tb] = [toThree(a), toThree(b)]
  assert.equal(Math.hypot(ta[0] - tb[0], ta[1] - tb[1], ta[2] - tb[2]), between(a, b))
  assert.equal(between(at(0, 0), at(1, 0)), 1)
})

test('nothing else puts a place in three.js\'s order', () => {
  for (const name of readdirSync(WORLD).filter(f => /\.tsx?$/.test(f))) {
    const text = code(read(name))
    if (name !== 'world.ts') assert.doesNotMatch(text, /\bscene\.(add|attach)\(/, `${name} puts a thing straight into the scene, not into xyz`)
    assert.doesNotMatch(text, /camera\.position\.set\((?!\.\.\.toThree\()/, `${name} places the eye in three.js's order`)
    assert.doesNotMatch(text, /\.target\.set\((?!\.\.\.toThree\()/, `${name} aims the eye in three.js's order`)
    assert.doesNotMatch(text, /\.lookAt\(/, `${name} aims a thing in three.js's order`)
    if (name !== 'place.ts') assert.doesNotMatch(text, /function (toThree|fromThree)\b/, `${name} has a crossing of its own`)
  }
  assert.match(code(read('world.ts')), /makeBasis\(along\(1, 0, 0\), along\(0, 1, 0\), along\(0, 0, 1\)\)/, 'xyz is turned by the crossing itself')
})

// (Till 22 Nov 2026: "a square 200 m across, from -100 to 100 each way, with 0, 0 in the middle". The 200 m
// across are as the user decided them on 21 Nov; on 23 Nov 2026 it became 21 tiles across, 210 m, x -105 to 105.
// The user, 23 Nov 2026: "if there are only 21 tiles in a row, so that becomes odd ... our x0 and y0 can always
// pass through the center of the center column."; where the numbers start is their choice of 22 Nov; and how
// long the land is, their word of the same day: "maybe we can make y up to 600.")
test('the land is 210 m across and 600 m long: x from -105 to 105, y from 0 at the beginning to 600 at the end', () => {
  const land = startOfLand()
  assert.deepEqual([HALF, LONG], [105, 600])
  assert.deepEqual([land.half, land.long], [105, 600])
  assert.deepEqual(runs(land), { x: [-105, 105], y: [0, 600] })
  for (const on of ['x 0, y 0', 'x 105, y 600', 'x -105, y 0', 'x 105, y 0', 'x -37.5, y 599.9', 'x 0, y 300']) assert.ok(onLand(readPlace(on), land), `${on} is on the land`)
  for (const off of ['x 105.1, y 50', 'x 0, y -0.1', 'x 0, y 600.1', 'x -105.1, y 50', 'x 150, y 150']) assert.ok(!onLand(readPlace(off), land), `${off} is past the edge`)
  const corners = edges(land).map(e => e.from)
  assert.deepEqual(corners.map(c => writePlace(c)), ['x -105, y 0', 'x 105, y 0', 'x 105, y 600', 'x -105, y 600'])
  assert.deepEqual([corners.reduce((sum, c) => sum + c.x, 0) / 4, corners.reduce((sum, c) => sum + c.y, 0) / 4], [0, 300], 'the middle of the four corners is x 0, y 300')
  assert.deepEqual(middleOf(land), at(0, 300))
  assert.deepEqual(sideMiddle('beginning', land), at(0, 0), 'x 0, y 0 is the middle of the beginning\'s side')
  assert.deepEqual(edges(land).map(e => between(e.from, e.to)), [210, 600, 210, 600], 'the beginning\'s side and the end\'s are 210 m, the two others 600 m')
})

test('the edge can move out without changing any address', () => {
  const land = startOfLand()
  const wider = changed(land, { what: 'edge', half: 155 })
  assert.equal(wider.half, 155)
  const places = list => new Set(list.map(m => m.words))
  const [now, then] = [places(markers(wider)), places(markers(land))]
  assert.ok([...then].every(words => now.has(words)), 'every crossing keeps its place')
  assert.ok(now.has('x 150, y 300') && !then.has('x 150, y 300'), 'and new ones lie beyond')
  assert.ok(onLand(at(0, 0), wider) && !onLand(at(0, -10), wider), 'the beginning stays at y 0: the land grows to the sides and toward the end')
  const longer = changed(land, { what: 'edge', long: 800 })
  assert.deepEqual([longer.half, longer.long], [105, 800], 'the end moves out by itself')
  assert.ok(onLand(at(0, 700), longer) && !onLand(at(0, 700), land))
  assert.throws(() => changed(land, { what: 'edge' }), /how far the land runs/)
  assert.throws(() => changed(land, { what: 'edge', long: 605 }), /whole number of tiles long/)
  assert.deepEqual(toThree(readPlace('x 10, y 15')), [-10, 0, -15], 'a place does not depend on where the edge is')
  assert.throws(() => changed(land, { what: 'edge', half: 110 }), /odd number of tiles across/, 'the edge stays an odd number of whole 10 m tiles across')
  assert.throws(() => changed(land, { what: 'edge', half: 0 }))
})

test('a thing stands on its place by the middle of its base', () => {
  // the user's own example: a box 4 m by 2 m at x 10, y 15
  const box = standsOn(at(10, 15), { x: 4, y: 2, z: 3 })
  assert.equal(writeSpan({ from: box.low, to: box.high }), 'from x 8, y 14 to x 12, y 16, z 3', 'it spreads evenly round its place and rises from it')
  assert.equal(writePlace(box.middle), 'x 10, y 15, z 1.5')
  assert.equal(standsOn(at(10, 15, 3), { x: 1, y: 1, z: 1 }).low.z, 3, 'off the ground, its base is at its height')
  // every upright marker stands so
  for (const marker of markers(startOfLand())) {
    const b = markerBox(marker)
    assert.equal(b.low.z, 0, `the marker at ${marker.words} stands on the ground`)
    assert.deepEqual([(b.low.x + b.high.x) / 2, (b.low.y + b.high.y) / 2], [marker.place.x, marker.place.y], `the marker at ${marker.words} is centred on its crossing`)
  }
})

test('a long thing is said by its two ends', () => {
  const span = { from: at(0, 10), to: at(20, 10) }
  assert.equal(writeSpan(span), 'from x 0, y 10 to x 20, y 10')
  assert.deepEqual(readSpan('from x 0, y 10 to x 20, y 10'), span)
  assert.deepEqual(readSpan('0, 10 to 20, 10'), span, '"from" may be left out, and the ends may be bare')
  assert.deepEqual(readSpan('from x 0, y 10, z 2 to x minus 20, y 10'), { from: at(0, 10, 2), to: at(-20, 10) })
  assert.equal(readSpan('from x 0, y 10'), null, 'one end is not a long thing')
  assert.equal(readSpan('from here to x 20, y 10'), null)
  assert.deepEqual(edges().map(e => writeSpan(e)), [
    'from x -105, y 0 to x 105, y 0', 'from x 105, y 0 to x 105, y 600',
    'from x 105, y 600 to x -105, y 600', 'from x -105, y 600 to x -105, y 0',
  ], 'the land\'s own four edges are said so')
})

test('the coordinates are seen in four ways, all kept, each drawn from the land\'s data', () => {
  assert.deepEqual([...WAYS], ['lines', 'edgeNumbers', 'markers', 'pointer'])
  const land = startOfLand()
  assert.deepEqual(land.seen, { lines: true, edgeNumbers: true, markers: true, pointer: true, axes: true, metreLines: true, edgeLine: true, sideNames: true }, 'all four are shown from the start, with every part of the lines, and the names of the four sides')
  assert.deepEqual([...SHOWN], [...WAYS, 'axes', 'metreLines', 'edgeLine', 'sideNames'], 'each of the four can be shown and hidden, and so can three parts of the lines by themselves, and the names of the four sides')
  const picture = code(read('drawLand.ts'))
  for (const way of WAYS) assert.match(picture, new RegExp(`seen\\.${way}\\b`), `the picture shows and hides "${way}" by the land's data`)
  // lines: every metre faint, every 10 m stronger, the two axes
  assert.equal(EVERY, 10)
  assert.match(picture, /lines\(1\)/, 'a line every metre')
  assert.match(picture, /lines\(EVERY\)/, 'a stronger line every 10 m')
  assert.match(picture, /lineAt\(here\.y\)/, 'the x axis, where y is 0')
  assert.match(picture, /lineAt\(here\.x\)/, 'the y axis, where x is 0')
})

test('numbers stand along the four edges every 10 m', () => {
  const land = startOfLand()
  assert.deepEqual(marks(-100, 100), [-100, -90, -80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 'along x')
  const alongY = marks(0, 600)
  assert.deepEqual([alongY.length, alongY[0], alongY[1], alongY.at(-1)], [61, 0, 10, 600], 'along y, from the beginning')
  const numbers = edgeNumbers(land)
  assert.equal(numbers.length, 2 * 21 + 2 * 61)
  for (const n of numbers) {
    const [axis, value] = n.words.split(' ')
    assert.equal(n.place[axis], Number(value), `"${n.words}" stands at its own number`)
    assert.ok(!onLand(n.place, land), `"${n.words}" stands outside the land`)
    assert.equal(n.place.z, 0)
  }
  for (const [side, many] of [[n => n.place.y < 0, 21], [n => n.place.y > 600, 21], [n => n.place.x < -100, 61], [n => n.place.x > 100, 61]]) {
    assert.equal(numbers.filter(side).length, many, 'each of the four edges has all its numbers')
  }
  assert.deepEqual(new Set(numbers.filter(n => n.place.y < 0).map(n => n.words)).size, 21)
  assert.ok(numbers.some(n => n.words === 'y 0') && numbers.some(n => n.words === 'y 600') && !numbers.some(n => n.words === 'y -10'), 'the numbers on y run from 0 to 600')
})

test('an upright marker stands at every 10 m crossing, with its place in words when the eye is near', () => {
  const land = startOfLand()
  const all = markers(land)
  assert.equal(all.length, 21 * 61)
  assert.equal(new Set(all.map(m => m.words)).size, all.length, 'no two markers say the same place')
  for (const m of all) {
    assert.ok(m.place.x % 10 === 0 && m.place.y % 10 === 0 && m.place.z === 0, `${m.words} is a 10 m crossing`)
    assert.deepEqual(readPlace(m.words), m.place, 'a marker says the place it stands on')
    assert.ok(m.size.z > m.size.x && m.size.z > m.size.y, 'it is upright')
    assert.deepEqual([m.wordsAt.x, m.wordsAt.y], [m.place.x, m.place.y], 'its words are over it')
  }
  const walker = changed(land, { what: 'look', from: 'x 0, y 30, z 1.6', at: 'x 0, y 40, z 1.4' })
  const near = all.filter(m => wordsShown(m, walker)).map(m => m.words)
  assert.ok(near.includes('x 0, y 30') && near.includes('x 10, y 40'), 'the markers round the eye say their places')
  assert.ok(!near.includes('x 100, y 200'), 'the far ones do not')
  assert.ok(all.some(m => m.words === 'x 0, y 0') && all.some(m => m.words === 'x -100, y 600') && !all.some(m => m.place.y < 0), 'they stand from the beginning\'s side to the end\'s')
  // "near" is near the place the eye looks at (a session's pick since the view is isometric, 22 Nov)
  const shown = all.filter(m => wordsShown(m, land))
  assert.ok(shown.length > 0 && shown.length < all.length, 'from the start, only the markers round the place the eye looks at say theirs')
  assert.ok(shown.every(m => between(m.wordsAt, land.eye.at) < land.picks.wordsWithin))
})

test('the place under the pointer is said in words', () => {
  const land = startOfLand()
  assert.equal(pointerWords(land), null, 'no pointer, no words')
  assert.equal(pointerWords(changed(land, { what: 'point', at: at(-12.34, 45.67) })), 'x -12.3, y 45.7')
  assert.equal(changed(land, { what: 'point', at: at(12.34, -45.67) }).pointer, null, 'before the beginning there is no place under it')
  assert.equal(pointerWords(changed(land, { what: 'point', at: 'x 10, y 15, z 3' })), 'x 10, y 15', 'the pointer is on the ground')
  assert.equal(changed(land, { what: 'point', at: at(105.5, 0) }).pointer, null, 'past the edge there is no place under it')
  const pointed = changed(land, { what: 'point', at: at(10, 15) })
  assert.equal(changed(pointed, { what: 'point', at: null }).pointer, null)
})

test('the land is data that code reads, and changes only by naming a change', () => {
  const land = openLand()
  const seen = []
  const stop = land.watch((now, before) => seen.push([before, now]))
  const start = land.state
  assert.throws(() => { land.state.half = 5 }, TypeError, 'the data cannot be written to directly')
  assert.throws(() => { land.state.seen.lines = false }, TypeError)
  assert.throws(() => { land.state.eye.from.x = 1 }, TypeError)

  land.change({ what: 'show', way: 'markers', on: false })
  assert.equal(land.state.seen.markers, false)
  assert.equal(start.seen.markers, true, 'the land as it was is not touched')
  assert.equal(seen.length, 1, 'whoever watches is told')
  assert.deepEqual(seen[0], [start, land.state], 'with the land as it was and as it is')

  land.change({ what: 'show', way: 'markers', on: false })
  assert.equal(seen.length, 1, 'a change that changes nothing tells no one')

  land.change({ what: 'look', from: 'x 0, y -30, z 1.6', at: '0, minus 20, 1.4' })
  assert.deepEqual(land.state.eye, { from: at(0, -30, 1.6), at: at(0, -20, 1.4) }, 'a place may be given in words')
  assert.equal(seen.length, 2)

  const before = land.state
  assert.throws(() => land.change({ what: 'look', from: 'over there', at: 'x 0, y 0' }), /is not a place/)
  assert.throws(() => land.change({ what: 'look', from: 'x 1, y 1', at: 'x 1, y 1' }))
  assert.throws(() => land.change({ what: 'show', way: 'fog', on: true }), /no way of seeing/)
  assert.throws(() => land.change({ what: 'fly' }), /no change called/)
  assert.throws(() => land.change({ what: 'pick', name: 'markerHeight', value: -1 }))
  assert.equal(land.state, before, 'a change that cannot be made leaves the land as it was')
  assert.equal(seen.length, 2)

  stop()
  land.change({ what: 'show', way: 'markers', on: true })
  assert.equal(seen.length, 2, 'whoever stopped watching is told no more')
})

test('a change made while the watchers are told waits its turn', () => {
  const land = openLand()
  const order = []
  land.watch(now => {
    order.push(`${now.seen.lines} ${now.seen.markers}`)
    // the picture answering a change with one of its own
    if (!now.seen.lines && now.seen.markers) land.change({ what: 'show', way: 'markers', on: false })
  })
  land.watch(now => order.push(`second ${now.seen.lines} ${now.seen.markers}`))
  land.change({ what: 'show', way: 'lines', on: false })
  assert.deepEqual(order, ['false true', 'second false true', 'false false', 'second false false'], 'every watcher sees every state once, in order')
})

// THE WORLD'S ELEMENTS (21 Nov 2026, issue 123 in noi-planning). The user: "the base tile element, where the
// tile, one tile is for 10 meters into 10 meters section, but with 1 meter border radius. The tile has to be
// matte black." And: "Every element should have a gallery, and when I click the element, show the element in a
// [modal] in 3D view so that I can inspect the element." How thick the tile is, the light it is looked at in
// and where the eye first stands are picks, and are not tested as rules.

const TOKENS = readFileSync(new URL('../../../packages/eio-tokens/tokens.css', import.meta.url), 'utf8')
const GALLERY = name => readFileSync(WORLD + 'gallery/' + name, 'utf8')

test('the base tile is for one 10 m by 10 m section of the land', () => {
  assert.deepEqual([BASE_TILE.size.x, BASE_TILE.size.y], [10, 10])
  assert.deepEqual([BASE_TILE.size.x, BASE_TILE.size.y], [EVERY, EVERY], 'one tile fills one square of the stronger lines')
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
  const made = code(read('makeElement.ts'))
  assert.match(made, /roughness: 1\b/, 'matte: light is scattered evenly')
  assert.match(made, /metalness: 0\b/, 'matte: nothing shines back')
  assert.match(made, /matte\(element\.surface\.colour\)/, 'its colour is the one its data names')
  assert.match(made, /new THREE\.Color\(colourOf\(token\)/, 'as Eidos has it')
})

test('an element is made from its data and nothing else, standing by the middle of its base', () => {
  const made = code(read('makeElement.ts'))
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

test('the gallery shows every element, and a click opens it in a 3D view', () => {
  const gallery = code(GALLERY('Gallery.tsx'))
  assert.match(gallery, /\bELEMENTS\.map\(/, 'every element in the list is shown, none by hand')
  assert.match(gallery, /picturesOf\(ELEMENTS,/, 'each with a picture taken by three.js')
  assert.match(gallery, /<Card[^>]*onClick=\{\(\) => inspect\(element\)\}/, 'a click on the element opens it')
  assert.match(gallery, /<Button[^>]*onClick=\{\(\) => inspect\(element\)\}/, 'and so does a real button, for a keyboard')
  assert.match(gallery, /<Drawer\b[\s\S]*<ElementView element=\{shown\}/, 'it opens over the page, in a 3D view')
  assert.match(gallery, /<Button[^>]*onClick=\{\(\) => setOpen\(false\)\}/, 'with a way out')
  const view = code(GALLERY('ElementView.tsx'))
  assert.match(view, /showElement\(/, 'the 3D view puts the element on a stage of its own')
  const stage = code(read('inspect.ts'))
  assert.match(stage, /openEye\(/, 'with an eye the hand can move, to look from every side')
  // THE USER (22 Nov 2026): "I'm unable to rotate the element in all the angles. I mean, basically, I cannot see
  // the bottom of the element now. Can you fix that?" So the eye of the 3D view may go under the element (the
  // land's eye still may not), and the underside is lit so that it is seen. How strongly is a session's pick.
  assert.match(stage, /openEye\(world, nearest, farthest, false, true\)/, 'the 3D view\'s eye may go under the element')
  assert.match(code(read('eye.ts')), /mover\.maxPolarAngle = under \? Math\.PI : Math\.PI \/ 2 - 0\.01/, 'right under it; an eye that may not, stays above the ground')
  assert.doesNotMatch(code(read('drawLand.ts')), /openEye\([^)]*, true, true\)/, 'the land\'s eye may not')
  assert.match(stage, /light\(world, lightFor\(world, look\.colour\(element\.surface\.colour\)\), true\)/, 'and the underside is lit')
  // THE USER (22 Nov 2026): "probably we can give options in the drone element to select things that can attach
  // to the drone, and then once they select that, then we can show a preview of how it looks like when it's
  // attached." So the 3D view of an element offers every element that fits on it, worked out from the data,
  // and shows the chosen one set on it. That the choice is radios with "Nothing" first is a session's pick.
  assert.match(gallery, /const fits = shown \? ELEMENTS\.filter\(e => e !== shown && fitsOn\(e, shown\)\) : \[\]/, 'what can be set on an element is every element whose sockets meet its studs: no list kept by hand')
  assert.match(gallery, /\{of === 'it' && fits\.length > 0 && \(\s*<Choices legend="Set on it" across>/, 'offered only where something fits, as a choice of Eidos\'s, in the card of the element it is set on')
  assert.match(gallery, /<Radio key=\{piece\.id\} name=\{`\$\{where\}-set-on`\} checked=\{on === piece\} onChange=\{\(\) => setOn\(piece\.id\)\}>\{piece\.name\}<\/Radio>/, 'one choice for each, by its name')
  assert.match(gallery, /<ElementView element=\{shown\} on=\{on\} state=\{state\?\.id \?\? null\} onState=\{onState\?\.id \?\? null\} through=\{through\} colours=\{colours\} onColours=\{onColours\} settings=\{settings\} onSettings=\{onSettings\} ride=\{riding\} onRide=\{setRideY\} \/>/, 'and the chosen one goes to the 3D view')
  assert.match(view, /useEffect\(\(\) => \{ opened\?\.setOn\(on\) \}, \[opened, on\]\)/, 'which sets it on, and takes it off again')
  assert.match(stage, /const place = piece \? fitsOn\(piece, shownAs\) : null/, 'where its sockets meet the studs')
  assert.match(stage, /on\.thing\.position\.set\(place\.x, place\.y, place\.z\)/, 'the middle of its base on that place')
  assert.deepEqual(ELEMENTS.filter(e => e !== DRONE && fitsOn(e, DRONE)).map(e => e.id), ['camera-module'], 'today: the camera module goes on the drone')
  assert.deepEqual(ELEMENTS.filter(e => e !== CAMERA_MODULE && fitsOn(e, CAMERA_MODULE)), [], 'and nothing goes on the camera module')
  for (const name of ['Gallery.tsx', 'ElementView.tsx']) {
    const text = code(GALLERY(name))
    assert.doesNotMatch(text, /getContext\(/, `${name} asks the canvas for a drawing context of its own`)
    assert.doesNotMatch(text, /@noi\/eio-3d/, `${name} takes from the first world's elements`)
  }
})

// AN ELEMENT'S STATES, AND ITS OWN CONTROLS (22 Nov 2026, issue 127). The user: "I also think each [element] also
// have their own set of controls that are specific to them. For example, the camera is used to view, so a
// drone is used to fly around and hover on the different states of it. So I think we should also cater for
// those states and features of an element." From their words: the drone hovers and flies around; the camera
// views; each element's controls are its own. What else a state can say, the other states (landed, resting),
// which state an element starts in, and every number, are a session's design and are not held as rules.
test('an element has states of its own, and the gallery offers them as that element\'s own control', () => {
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
  const made = code(read('makeElement.ts'))
  assert.match(made, /const to = poseIn\(state, since\)/, 'each moment its state says where it should be')
  assert.match(made, /body\.position\.set\(is\.x, is\.y, is\.z\)/, 'and the whole of it goes there')
  assert.match(made, /const next = states\.find\(s => s\.id === id\)/, 'a state is chosen by its id')
  assert.match(made, /was = \{ \.\.\.is, swept: new Map\(swept\) \}\s+over = 0\s+state = next\s+since = 0/, 'and the thing goes over to it from where it is')
  // the gallery: each element's own control, made from its data; what is set on it has its own, and goes with it
  const gallery = code(GALLERY('Gallery.tsx'))
  assert.match(gallery, /<Choices legend=\{`The \$\{of\.name\.toLowerCase\(\)\} is`\} across note=\{chosen\.says\}>/, 'the control is the element\'s own question, a choice of Eidos\'s, with what the chosen state does under it')
  assert.match(gallery, /<Radio key=\{state\.id\} name=\{name\} checked=\{state === chosen\} onChange=\{\(\) => choose\(state\.id\)\}>\{state\.name\}<\/Radio>/, 'one choice for each state, from the data')
  assert.match(gallery, /\{chosen && <States of=\{element\} chosen=\{chosen\} choose=\{choose\} name=\{`\$\{where\}-state-of-\$\{of\}`\} \/>\}/, 'in the element\'s own card')
  assert.match(gallery, /\{card\('it', shown, state, setStateId, where\)\}/, 'for the element shown')
  assert.match(gallery, /\{on && card\('on', on, onState, setOnStateId, where\)\}/, 'and for what is set on it')
  assert.doesNotMatch(gallery, /['"`](drone|camera-module|hovering|flying|viewing)['"`]/, 'the gallery names no element and no state: a new one shows by itself')
  const stage = code(read('inspect.ts'))
  assert.match(stage, /made\.body\.add\(on\.thing\)/, 'what is set on an element goes where the element goes')
  assert.match(stage, /const done = on\?\.state\(id\) \?\? false/, 'and is put in its own states')
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
  const made = code(read('makeElement.ts'))
  assert.match(made, /lookOut\.position\.set\(element\.lookOut\.at\.x, element\.lookOut\.at\.y, element\.lookOut\.at\.z\)/, 'on the place its data says')
  assert.match(made, /\(element\.lookOut\.part \? partNamed\(element\.lookOut\.part\) : body\)\.add\(lookOut\)/, 'in the part it turns with')
  const stage = code(read('inspect.ts'))
  assert.match(stage, /if \(lookOut\) eye\.put\(sightFrom\(lookOut\)\)/, 'the eye is put where one looks out, each picture anew: it goes with the element')
  assert.match(stage, /lookOut\.localToWorld\(ahead\.set\(0, -1, 0\)\)/, 'and looks toward its front, low y')
  assert.match(stage, /world\.xyz\.worldToLocal\(/, 'said in the user\'s x, y, z')
  assert.match(stage, /if \(outside\) \{ sees\(outside\.sees\); eye\.put\(outside\.sight\) \}/, 'and goes back where it was when one looks from outside again')
  // the gallery offers it wherever the data says one can look out, of the element shown or of what is set on it
  const gallery = code(GALLERY('Gallery.tsx'))
  assert.match(gallery, /const lookOuts = \(\[\['it', shown\], \['on', on\]\] as const\)\.filter\(\(\[, element\]\) => element\?\.lookOut\)/, 'from the data: no element is named')
  assert.match(gallery, /\{element\.lookOut && <Toggle checked=\{through === of\} onChange=\{e => setThroughWhat\(e\.target\.checked \? of : null\)\}>Look through it<\/Toggle>\}/, 'as a toggle of Eidos\'s in that element\'s own card, only where one can look out: on is through it, off is from outside')
})

// THE VIEWER'S LAYOUT (23 Nov 2026, issue 127). The user, with a picture of a bar on the left and the 3D view
// large on the right: "I think it's better if you arrange the states and options in a card. Use the layout
// inspiration I have provided, and on the left bar, each control set has to be a card. I mean, the controls
// related to drone has to be in the drone card, and similarly organize the settings with our elements from the
// design system." And, shown it: "The layout is only taking less width and height. Let it take full width and
// height." That the viewer is in dark roles, how wide the bar is, and what a card says besides its controls,
// are a session's picks.
test('the viewer fills the window: a bar with a card for each element\'s own controls, and the 3D view in all the rest', () => {
  const gallery = code(GALLERY('Gallery.tsx'))
  // the bar beside the view where the window has two panes, above it where it has one: Eidos says which
  assert.match(gallery, /<WhenTwoPanes><div className=\{styles\.beside\}>\{bar\('beside'\)\}<\/div><\/WhenTwoPanes>/, 'the bar is beside the view')
  assert.match(gallery, /<WhenOnePane>\{bar\('above'\)\}<\/WhenOnePane>\s*<ElementView /, 'and above it where the window has one pane')
  // "Let it take full width and height": nothing stops the viewer at a page's width, it takes the drawer's
  // whole height, and the view takes all the room that is left
  assert.doesNotMatch(gallery, /<Panes\b/, 'not Eidos\'s Panes, which stops at the page\'s width')
  const css = readFileSync(fileURLToPath(new URL('../app/hyperbase/world/gallery/gallery.module.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = name => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
  assert.match(rule('layout'), /flex:\s*1 1 auto/, 'the viewer takes all the height the drawer has')
  assert.doesNotMatch(rule('layout') + rule('main'), /max-width/, 'and all its width')
  assert.match(rule('main'), /flex:\s*2 1 0/, 'the view\'s side takes the rest of the width')
  assert.match(rule('view'), /flex:\s*1 1 auto/, 'and the view all its height')
  assert.doesNotMatch(rule('view'), /aspect-ratio/, 'whatever the window\'s shape')
  // each control set is a card of Eidos's: one for each element in the view
  const card = /const card = \([\s\S]*?\n  \)\n/.exec(gallery)?.[0] ?? ''
  assert.match(card, /^const card = \(of: 'it' \| 'on', element: WorldElement,/, 'a card is made for one element')
  assert.match(card, /<Card data-card=\{element\.id\}>[\s\S]*<\/Card>/, 'it is Eidos\'s Card')
  assert.match(card, /<h2 className="eio-type-style-heading">\{element\.name\}<\/h2>/, 'with the element\'s name')
  for (const control of [/<States of=\{element\}/, /<Settings of=\{element\}/, /<Colours of=\{element\}/, /<Choices legend="Set on it"/, /<Toggle checked=\{through === of\}/]) assert.match(card, control, 'its controls are inside its card')
  const bar = /const bar = \([\s\S]*?\n  \)\n/.exec(gallery)?.[0] ?? ''
  assert.doesNotMatch(bar, /<(Choices|Radio|Toggle|States|Settings|Colours|Select|Swatch)\b/, 'and no control stands in the bar outside a card')
  assert.doesNotMatch(gallery.slice(gallery.indexOf('<Drawer')), /<(Choices|Radio|Toggle|States|Settings|Colours|Select|Swatch)\b/, 'nor anywhere else in the viewer')
  // the 3D view stays in sight while a long card scrolls past: never taller than the window, and held at the top
  assert.match(rule('view'), /position:\s*sticky/, 'the view holds its place while the cards scroll')
  assert.match(rule('view'), /max-height:\s*calc\(100dvh - var\(--eio-space-gap-group\) \* 1\.5\)/, 'and is never taller than the window less the drawer\'s margins')
  // only parts of the design system: no hand-made control
  assert.doesNotMatch(gallery, /<(button|input|select|textarea|fieldset)\b/, 'the gallery draws no control of its own')
  assert.match(gallery, /import \{ Button, Card, Choices, Drawer, Radio, Select, Swatch, Toggle, WhenOnePane, WhenTwoPanes \} from '@noi\/eio-react'/)
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
  const data = code(read('elements.ts'))
  assert.match(data, /radius: BASE_TILE\.shape\.cornerRadius/, 'the radius is read from the tile, not written again')
  assert.match(data, /z: BASE_TILE\.size\.z/, 'and so is the thickness')
})

test('the astroid is the secondary colour', () => {
  assert.equal(ASTROID.surface.colour, '--eio-color-action-secondary')
  const values = [...TOKENS.matchAll(/--eio-color-action-secondary:\s*(#[0-9A-Fa-f]{6})/g)].map(m => m[1])
  assert.ok(values.length > 0, 'it is a colour of Eidos')
  assert.equal(new Set(values).size, 1, 'the same in light and in dark')
  assert.match(code(read('light.ts')), /Math\.max\(1, /, 'the light it is looked at in is never weaker than plain, so its top shows the colour itself')
})

// THE FOUR SOLIDS REMOVED (22 Nov 2026, issue 127). The user: "I want you to remove the diamond, [low-poly]
// sphere, octahedron, hexagon [tori] shapes from the world elements that we have built in the gallery."
test('the gallery holds the base tile and the astroid, and every solid that has a file', async () => {
  assert.deepEqual(ELEMENTS.map(e => e.id), ['base-tile', 'astroid', 'base-platform', 'mobius-platform', 'wave-platform', 'drone', 'camera-module', 'stage'], 'the diamond, the low-poly sphere, the octahedron and the hexagon tori are gone')
  for (const gone of ['diamond', 'low-poly-sphere', 'octahedron', 'hexagon-tori']) assert.equal(elementById(gone), null, `there is no ${gone}`)
  assert.equal(elementById('astroid'), ASTROID)
  assert.equal(`${sizeWords(ASTROID)}; ${shapeWords(ASTROID)}; ${surfaceWords(ASTROID)}`, '2 m along x, 2 m along y, 0.2 m thick; four points 1 m from its middle, sides curved inward by 1 m; matte, in the secondary colour')
  // an element made in its own file (elements/) is only in the gallery once it is in the list: none is left out
  const files = readdirSync(WORLD + 'elements/').filter(f => f.endsWith('.ts') && f !== 'look.ts')
  for (const file of files) {
    const made = Object.values(await import(`../app/hyperbase/world/elements/${file}`)).filter(v => v && typeof v === 'object' && 'id' in v && 'shape' in v)
    assert.equal(made.length, 1, `${file} makes one element`)
    assert.ok(ELEMENTS.includes(made[0]), `the ${made[0].name.toLowerCase()} (${file}) is in the list the gallery shows`)
    assert.equal(file, `${made[0].id}.ts`, 'its file is named by its id')
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
  // "use our astroid primitive": the body is the astroid itself, not a copy of its numbers
  const bodies = pieces.filter(p => p.shape.kind === 'astroid' && !p.spin)
  assert.equal(bodies.length, 1)
  assert.equal(bodies[0].shape, ASTROID.shape, 'the body is our astroid primitive itself')
  assert.equal(bodies[0].size, ASTROID.size, 'as large and as thick')
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
  const made = code(read('makeElement.ts'))
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
  const made = code(read('makeElement.ts'))
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
  const laid = BASE_PLATFORM.shape.things.map(t => `${t.element.id} at x ${t.at.x}, y ${t.at.y + LONG / 2}`).sort()
  const land = covering().map(t => `${t.element} at x ${t.at.x}, y ${t.at.y}`).sort()
  assert.equal(laid.length, TILES + ASTROIDS)
  assert.deepEqual(laid, land, 'a base tile on every section and an astroid wherever four tiles meet, exactly as the land is covered')
  assert.match(shapeWords(BASE_PLATFORM), new RegExp(`^${TILES} base tiles, and ${ASTROIDS} astroids`))
  // "select items to place on the platform just like we do in the drone": worked out from the data, no list
  assert.deepEqual(ELEMENTS.filter(e => e !== BASE_PLATFORM && fitsOn(e, BASE_PLATFORM)).map(e => e.id), ['drone', 'stage'], 'today: the drone and the stage can be placed on it')
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
  const made = code(read('makeElement.ts'))
  assert.match(made, /if \(element\.shape\.kind === 'laid'\) return makeLaid\(world, element, element\.shape, colourOf\)/)
  assert.match(made, /const many = \[\.\.\.places\.values\(\)\]\.map\(\(\{ of, over, where \}\) => makeMany\(world, of, where, colourOf, over, frame\)\)/, 'as the land\'s things are (turned over only on a bent thing\'s face below)')
  // the 3D view: the same choice as on the drone; the eye may come near, and goes to what is placed
  const stage = code(read('inspect.ts'))
  assert.match(stage, /const nearest = \(element\.ground \? Math\.min\(reach, BASE_TILE\.size\.x \/ 2\) : reach\) \* 0\.1/, 'the hand may come as near to ground as to one tile')
  assert.match(stage, /if \(element\.ground\) lookAtPlaced\(piece, place\)/, 'the eye goes to what is placed')
  assert.match(stage, /if \(element\.ground && had\) eye\.glide\(firstSight\(element, narrowerAngle\(world\)\)\)/, 'and back to the whole platform when it is taken off')
  assert.match(stage, /if \(done && element\.ground && onAs\) standBack\(onAs, id\)/, 'and stands back for what the placed thing does in its state')
  assert.doesNotMatch(code(GALLERY('Gallery.tsx')), /['"`]base-platform['"`]/, 'the gallery does not name it: the choice comes from the data')
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
  const stage = code(read('elements.ts'))
  assert.match(stage, /surface: \{ \.\.\.BASE_TILE\.surface, shine: 1, says: /, 'taken from the tile, so a change to the tile changes the block')
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
  const made = code(read('makeElement.ts'))
  assert.match(made, /const within = withinPieceBorder\(piece\)/, 'a piece with a border is drawn as what lies inside it')
  assert.match(made, /const band = flatOf\(roundOf\(piece\), \[roundOf\(within\)\]\)/, 'and the border round it: the whole outline with the inside cut out')
  assert.match(made, /matteWith\(piece\.border\.colour, lightOf\(light\), shine\)/, 'in the colour its data names')
  assert.match(made, /const glassEdge = piece\.border\.surface\?\.finish === 'frosted'/)
  assert.match(made, /glassEdge \? frosted\(piece\.border\.surface, \{ light, middle \}\)/, 'or in its own surface, when it has one')
  assert.match(made, /s\.finish === 'frosted' \? frosted\(s\)/, 'frosted glass is drawn as frosted glass')
  assert.match(made, /surface\.transmission = 1 - \(s\.hides \?\? 0\.15\)/, 'it lets through what it does not hide')
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
  const made = code(read('makeElement.ts'))
  assert.match(made, /lights: \{ piece: piece\.name, \.\.\.light \}/, 'each border can be lit by itself')
  assert.match(made, /light\.is = between\(light\.was, state\?\.glow\?\.borders\.some\(b => b\.piece === light\.piece\) \? 1 : 0\)/, 'lit when the state names its piece, dark when it does not, and smoothly from one to the other')
  assert.match(made, /const colourFor = \(named: string \| undefined\) => colourOf\(\(named \? tried\.get\(named\) : undefined\) \?\? glow\.colour\) \|\| '#808080'/, 'in the colour the state says, a role of Eidos')
  assert.match(made, /light\.upOnly\.value = border\.faces === 'up' \? 1 : 0/, 'on all of the border, or only where it looks up')
  assert.match(made, /TSL\.mix\(l\.colour, l\.side, looks\.x\.add\(looks\.y\)\)\.mul\(l\.lit\)/, 'a lit border gives off its colour, whatever light falls on it')
  assert.match(made, /light\.topIs = between\(light\.topWas, state\?\.glow\?\.tops\?\.some\(t => t\.piece === light\.piece\) \? 1 : 0\)/, 'a piece\'s whole top face is lit when the state names it, as smoothly')
  assert.match(made, /const topOf = \(l: Light\) => l\.topColour\.mul\(l\.top\)\.mul\(TSL\.step\(0\.5, TSL\.normalLocal\.z\)\)/, 'in its own colour')
  // the gallery offers the two states as the stage's own control, with no word about the stage in the gallery's code
  assert.doesNotMatch(code(GALLERY('Gallery.tsx')), /['"`](stage|default|active)['"`]/)
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
  const made = code(read('makeElement.ts'))
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
  assert.match(made, /roughness: s\.frost \?\? FROST\.roughness/, 'frost')
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
  const made = code(read('makeElement.ts'))
  assert.match(made, /const tried = new Map\(\(element\.colours \?\? \[\]\)\.map\(c => \[c\.id, c\.colour\]\)\)/, 'each colour is its own to begin with')
  assert.match(made, /colour\(id, token\) \{\s+if \(!tried\.has\(id\)\) return false\s+tried\.set\(id, token\)\s+lightUp\(state\)/, 'another can be chosen, and shows at once')
  // the gallery: the element's own control, in its card, made of Eidos's Select and Swatch; nothing is named
  const gallery = code(GALLERY('Gallery.tsx'))
  assert.match(gallery, /\{coloursIn\(element, chosen\)\.length > 0 && \(\s+<Colours of=\{element\} lit=\{coloursIn\(element, chosen\)\}/, 'offered for the colours the chosen state lights with')
  assert.match(gallery, /<Swatch color=\{`var\(\$\{now\}\)`\} \/>/, 'the colour as it is now, shown by Eidos\'s Swatch')
  assert.match(gallery, /<Select wide label=\{`The colour of the \$\{of\.name\.toLowerCase\(\)\}'s \$\{own\.name\.toLowerCase\(\)\}`\} value=\{now\} onChange=\{e => tryOut\(own\.id, e\.target\.value\)\}>/, 'chosen with Eidos\'s Select')
  assert.match(gallery, /\{COLOURS_TO_TRY\.map\(offered => <option key=\{offered\.colour\} value=\{offered\.colour\}>\{offered\.name\}<\/option>\)\}/, 'among Eidos\'s colours, from the data')
  assert.doesNotMatch(gallery, /['"`](light|Colour)['"`]/, 'the gallery does not name the stage\'s colour: another element\'s show by themselves')
  assert.match(code(GALLERY('ElementView.tsx')), /for \(const \[id, token\] of Object\.entries\(colours\)\) opened\.colour\(id, token, 'it'\)/, 'and the 3D view follows the choice')
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
  assert.equal(sizedBy(DRONE, { x: 20 }), null, 'an element whose size cannot be chosen is not made in another')
  // on the base platform a stage covers whole tiles: an even number of tiles wide, it stands on the line between two
  const on = fitsOn(STAGE, BASE_PLATFORM)
  assert.deepEqual(fitsOn(sizedBy(STAGE, { x: 20 }), BASE_PLATFORM), { ...on, x: on.x + 5 })
  assert.deepEqual(fitsOn(sizedBy(STAGE, { x: 30, y: 20 }), BASE_PLATFORM), { ...on, y: on.y + 5 })
  // the 3D view makes the thing again in the size chosen, in the state and the colour it was in
  const view = code(read('inspect.ts'))
  const gallery0 = code(GALLERY('Gallery.tsx'))
  assert.match(view, /const resized = sizedBy\(base, sizes\)/)
  assert.match(view, /remake\(of, resized\)/, 'it is made again in that size')
  assert.match(view, /if \(chosen\[of\]\.state\) next\.state\(chosen\[of\]\.state, true\)/, 'at once in the state it was in')
  assert.match(view, /for \(const \[id, token\] of chosen\[of\]\.colours\) next\.colour\(id, token\)/, 'and in the colour chosen')
  assert.match(view, /eye\.glide\(\{ from: \{ x: sight\.at\.x \+ \(way\.x \* need\) \/ far,/, 'and the eye goes to where all of it is in sight: farther from a larger one, nearer to a smaller one')
  assert.match(gallery0, /\{inWords\(inSize\(element, of === 'it' \? settings : onSettings\)\)\}/, 'the card says the size it is shown in')
  // the gallery: the element's own controls, in its card, each Eidos's Select; nothing is named
  const gallery = code(GALLERY('Gallery.tsx'))
  assert.match(gallery, /<Settings of=\{element\} offered=\{element\.settings \?\? \[\]\}/, 'offered from the element\'s data')
  assert.match(gallery, /<Choices key=\{group\} legend=\{group\} data-settings=\{group\}>/, 'under the group\'s name')
  assert.match(gallery, /\{setting\.steps\.map\(step => <option key=\{step\.value\} value=\{String\(step\.value\)\}>\{step\.name\}<\/option>\)\}/, 'its steps, from the data')
  assert.doesNotMatch(gallery, /['"`](Size|Width|Breadth|width|breadth|height)['"`]/, 'the gallery names no setting: another element\'s show by themselves')
  assert.match(code(GALLERY('ElementView.tsx')), /for \(const \[id, value\] of Object\.entries\(settings\)\) opened\.set\(id, value, 'it'\)/, 'and the 3D view follows the choice')
})

// LAID ON THE LAND (21 Nov 2026). The user, asked "Shall I lay the tiles and astroids on the land next?":
// "Lay them on the land". A base tile on every 10 m by 10 m section, an astroid wherever four tiles meet. The
// openings along the edge, where only two tiles meet, stay open: the user, asked, "Let's leave them open."
// That the lines are drawn on the tiles' tops, and the light, are picks.

test('a base tile lies on every 10 m by 10 m section of the land', () => {
  const tiles = covering().filter(t => t.element === 'base-tile')
  assert.equal(tiles.length, TILES)
  const [across, along] = [marks(-100, 100), Array.from({ length: 60 }, (_, i) => 5 + 10 * i)]
  assert.deepEqual(across, [-100, -90, -80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 'the tile middles: x 0 is the middle of the middle column')
  assert.deepEqual([along.length, along[0], along[1], along.at(-1)], [60, 5, 15, 595])
  const lying = new Set(tiles.map(t => writePlace(t.at)))
  for (const x of across) for (const y of along) assert.ok(lying.has(writePlace(at(x, y))), `a tile lies at ${writePlace(at(x, y))}`)
  for (const tile of tiles) {
    const reach = standsOn(tile.at, BASE_TILE.size)
    assert.ok([reach.low.x, reach.high.x].every(v => Math.abs(v % 10) === 5) && [reach.low.y, reach.high.y].every(v => v % 10 === 0), `the ${thingWords(tile)} is 10 m by 10 m, centred on its column and from one row line to the next`)
    assert.equal(tile.at.z, 0, 'it lies on the ground')
  }
})

test('an astroid lies wherever four tiles meet, two rows by two columns', () => {
  const things = covering()
  const astroids = things.filter(t => t.element === 'astroid')
  assert.equal(astroids.length, ASTROIDS)
  const tiles = new Set(things.filter(t => t.element === 'base-tile').map(t => writePlace(t.at)))
  for (const a of astroids) {
    assert.ok(Math.abs(a.at.x % 10) === 5 && a.at.y % 10 === 0, `the ${thingWords(a)} is where four tiles' corners meet`)
    for (const [dx, dy] of [[5, 5], [-5, 5], [-5, -5], [5, -5]]) assert.ok(tiles.has(writePlace(at(a.at.x + dx, a.at.y + dy))), `a tile lies beside the ${thingWords(a)}`)
  }
  assert.ok(!astroids.some(a => Math.abs(a.at.x) === 105 || a.at.y === 0 || a.at.y === 600), 'along the edge only two tiles meet: no astroid there')
  // the rule by itself, on tiles laid by hand
  const tile = (x, y) => ({ element: 'base-tile', at: at(x, y) })
  assert.deepEqual(astroidsBetween([tile(5, 5), tile(-5, 5), tile(-5, -5), tile(5, -5)]), [{ element: 'astroid', at: at(0, 0) }])
  assert.deepEqual(astroidsBetween([tile(5, 5), tile(-5, 5), tile(-5, -5)]), [], 'three tiles leave no astroid')
  assert.deepEqual(astroidsBetween([tile(5, 5), tile(15, 5)]), [], 'nor do two side by side')
})

test('what is laid covers the ground once: no thing lies on another, and nothing is left open but the edge', () => {
  const land = startOfLand()
  for (let x = -103.9; x < 104; x += 2.3) {
    for (let y = 1.1; y < 599; y += 6.9) {
      const over = thingsOver(land, x, y)
      assert.equal(over.length, 1, `x ${x.toFixed(1)}, y ${y.toFixed(1)} is under ${over.map(thingWords).join(' and ') || 'nothing'}`)
    }
  }
  // round an astroid, finely
  for (let x = 13.5; x < 16.5; x += 0.07) {
    for (let y = 18.5; y < 21.5; y += 0.07) assert.equal(thingsOver(land, x, y).length, 1, `x ${x.toFixed(2)}, y ${y.toFixed(2)} is covered once`)
  }
  assert.deepEqual(thingsOver(land, 15, 20).map(thingWords), ['astroid at x 15, y 20'])
  assert.deepEqual(thingsOver(land, 14, 26).map(thingWords), ['base tile at x 10, y 25'])
  assert.deepEqual(thingsOver(land, 104.8, 89.9), [], 'where two tiles meet at the edge, the opening is left open')
  // the two ways of knowing what an element covers agree: its outline, and the question asked of one spot
  for (const element of ELEMENTS) {
    for (const p of outline(element)) {
      assert.ok(covers(element, p.x * 0.999, p.y * 0.999), `just inside the ${element.name}'s outline is under it`)
      assert.ok(!covers(element, p.x * 1.001 + Math.sign(p.x) * 1e-6, p.y * 1.001 + Math.sign(p.y) * 1e-6), `just outside the ${element.name}'s outline is not`)
    }
  }
})

test('the land starts laid, and what is laid is data changed only by naming a change', () => {
  const land = openLand()
  assert.deepEqual(land.state.things, covering(), 'the land starts with every tile and every astroid')
  assert.equal(land.state.things.length, TILES + ASTROIDS)
  assert.throws(() => { land.state.things.push({ element: 'astroid', at: at(0, 0) }) }, TypeError, 'the list cannot be written to directly')

  land.change({ what: 'lift', at: 'x 5, y 100' })
  assert.deepEqual(thingsOver(land.state, 5, 100), [], 'the astroid at x 5, y 100 is taken away')
  assert.equal(land.state.things.length, TILES + ASTROIDS - 1)
  const before = land.state
  land.change({ what: 'lift', at: 'x 5, y 100' })
  assert.equal(land.state, before, 'taking away what is not there changes nothing')

  land.change({ what: 'lay', element: 'astroid', at: '5, 100' })
  assert.deepEqual(thingsOver(land.state, 5, 100).map(thingWords), ['astroid at x 5, y 100'])
  const laid = land.state
  land.change({ what: 'lay', element: 'astroid', at: 'x 5, y 100' })
  assert.equal(land.state, laid, 'the same element is not laid twice on one place')

  land.change({ what: 'lift', at: 'x 0, y 5', element: 'astroid' })
  assert.equal(land.state, laid, 'a lift that names an element leaves the others')
  land.change({ what: 'lift', at: 'x 0, y 5', element: 'base-tile' })
  assert.deepEqual(thingsOver(land.state, 1, 6), [])

  assert.throws(() => land.change({ what: 'lay', element: 'pond', at: 'x 0, y 0' }), /no element called "pond"/)
  assert.throws(() => land.change({ what: 'lay', element: 'base-tile', at: 'x 103, y 50' }), /past the edge of the land/)
  assert.throws(() => land.change({ what: 'lay', element: 'base-tile', at: 'x 0, y 0' }), /past the edge of the land/, 'a tile on the beginning\'s side itself would reach before it')
  assert.throws(() => land.change({ what: 'lay', element: 'base-tile', at: 'somewhere' }), /is not a place/)
  assert.throws(() => land.change({ what: 'edge', half: 55 }), /would reach past it/, 'the edge does not come in over what is laid')

  land.change({ what: 'clear' })
  assert.deepEqual(land.state.things, [])
  assert.equal(highestTop(land.state), 0)
  land.change({ what: 'cover' })
  assert.deepEqual(new Set(land.state.things.map(thingWords)), new Set(covering().map(thingWords)), 'covering the land lays all of it again')
  const covered = land.state
  land.change({ what: 'cover' })
  assert.equal(land.state, covered, 'covering a covered land changes nothing')
})

test('the coordinates stay seen on what is laid: the lines and the pointer are on its tops', () => {
  const land = startOfLand()
  assert.equal(highestTop(land), BASE_TILE.size.z)
  assert.equal(topAt(land, 4, 6), 0.2, 'on a tile, the top is the tile\'s')
  assert.equal(topAt(land, 15, 20), 0.2, 'on an astroid, the astroid\'s: level with the tiles')
  assert.equal(topAt(land, 104.8, 89.9), 0, 'in an opening at the edge, the ground')
  assert.equal(topAt(changed(land, { what: 'clear' }), 4, 6), 0, 'on a bare land, the ground everywhere')
  const picture = code(read('drawLand.ts'))
  assert.match(picture, /marksOnTops\.position\.set\(0, 0, top\)/, 'the sheet of marks lies on the highest top')
  assert.match(picture, /marksOnTops\.visible = top > 0/, 'and is not there on a bare land')
  assert.match(picture, /topAt\(s, met\.x, met\.y\) >= top/, 'the pointer is on the top of what lies under it')
  assert.match(picture, /makeMany\(world, element, where, look\.colour(, false, onStrip)?\)/, 'each thing is drawn from its element, on its place (on a strip, turned as the strip is there)')
  assert.match(picture, /for \(const thing of s\.things\)/, 'and only what the land\'s data holds is drawn')
  assert.match(picture, /light\(world\)/, 'in plain light, the same as in the gallery')
  assert.match(code(read('inspect.ts')), /light\(world, lightFor\(/, 'which lights by the same file')
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
  const made = code(read('makeElement.ts'))
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
  assert.match(code(GALLERY('Gallery.tsx')), /\{inWords\(element\)\}/, 'the gallery says all of it')
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

test('the user laid stages in the world: three 6 m tall a tile apart, two in front of the gaps, between y 10 and y 30', () => {
  // the user, 23 Nov 2026 (issue 127, piece 45): "place 4 stages from x-20 to x20, and their height should be 8
  // meters, and then place another 2 from x-10 to x10"; "the first four should be on Y10 and the next two should be on Y20"
  const s = LAID_BY_THE_USER.reduce(changed, startOfLand())
  const stages = s.things.filter(t => t.element === 'stage').map(t => ({ t, e: elementOf(t) }))
  assert.equal(stages.length, 5)
  const row = y => stages.filter(({ t }) => t.at.y === y)
  // then: "we'll put 3 between y10 and y20 row with 1 base style gap between each"
  assert.equal(row(15).length, 3)
  const xs = row(15).map(({ t }) => t.at.x).sort((a, b) => a - b)
  for (let i = 1; i < xs.length; i++) assert.equal(xs[i] - xs[i - 1] - 10, 10, 'one base tile between each')
  for (const { t, e } of row(15)) { assert.equal(t.size.z, 6, 'then: "Let us make the height of the first row to 6 meters." (the base, as the card Height)'); assert.ok(e.size.z > 6, 'the glass stands above the base') }
  // "in the y20 to y30 row we will place the two stages in front of the empty tiles"
  assert.equal(row(25).length, 2)
  assert.deepEqual(row(25).map(({ t }) => t.at.x).sort((a, b) => a - b), [(xs[0] + xs[1]) / 2, (xs[1] + xs[2]) / 2])
  // then: "these two rows have to be between y10 and y30"
  assert.deepEqual([Math.min(...stages.map(({ t, e }) => t.at.y - e.size.y / 2)), Math.max(...stages.map(({ t, e }) => t.at.y + e.size.y / 2))], [10, 30])
  assert.throws(() => changed(s, { what: 'lay', element: 'drone', at: 'x 0, y 50', size: { z: 8 } }), /cannot be chosen/)
})

// THE BASE PLATFORM AS A MÖBIUS STRIP (23 Nov 2026, issue 127, pieces 51 to 53). The user: "Now, what I want us
// to try is that to make the base platform of the world like a Mobius strip." Then: "I want the tiles to be always
// a square? I mean, without deforming the current base tile what we have". Then, of a 7 km loop: "the strip is
// too long and not as smooth as the previous version ... Most parts feel like a plane without any curve."
test('the base platform as a Möbius strip: 21 square tiles across, curving all the way, one side only', () => {
  const bend = MOBIUS_PLATFORM.shape.bend
  const L = lengthOf(bend)
  assert.ok(ELEMENTS.includes(MOBIUS_PLATFORM), 'it is in the gallery')
  assert.equal(bend.across, 2 * HALF, '21 tiles across, as the land')
  assert.ok(L < 7100, 'shorter than the 7 km loop the user found too long')
  assert.equal(L % BASE_TILE.size.y, 0, 'whole rows of tiles all the way round')
  assert.equal(MOBIUS_PLATFORM.shape.things.filter(t => t.element === BASE_TILE).length, 2 * 21 * (L / 10), 'a tile on every section, on each face (my pick: both faces)')
  const near = (a, b, d = 0.01) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < d
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
  // a tile keeps its shape: it is only moved and turned (across, along and up stay square to each other)
  for (let y = 5; y < L; y += 37) for (const x of [-100, 0, 60]) {
    const f = frameOf(bend, x, y)
    for (const [a, b] of [[f.across, f.along], [f.along, f.up], [f.up, f.across]]) assert.ok(Math.abs(dot(a, b)) < 1e-9, `at x ${x}, y ${y} the tile is turned, not stretched`)
    for (const v of [f.across, f.along, f.up]) assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9)
  }
  // neighbouring tiles meet: the gap between one tile's end and the next's start stays small (my pick: under 0.4 m)
  let widest = 0
  for (let y = 5; y < L - 10; y += 10) for (let x = -100; x <= 100; x += 10) {
    const [a, b] = [frameOf(bend, x, y), frameOf(bend, x, y + 10)]
    widest = Math.max(widest, Math.hypot(...['x', 'y', 'z'].map(k => (a.at[k] + 5 * a.along[k]) - (b.at[k] - 5 * b.along[k]))))
  }
  assert.ok(widest < 0.4, `the widest gap between tiles along the strip is ${widest.toFixed(3)} m`)
  // it curves all the way round: no stretch of 100 m runs straight and flat
  for (let y = 0; y < L; y += 50) {
    const [a, b] = [frameOf(bend, 0, y), frameOf(bend, 0, y + 100)]
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
  assert.ok(near(frameOf(bend, 0, L).up, { x: -frameOf(bend, 0, 0).up.x, y: -frameOf(bend, 0, 0).up.y, z: -frameOf(bend, 0, 0).up.z }, 1e-4), 'and its face there is the face below at the start')
  // it stands by the middle of its base: lowest point on z 0
  let lowest = Infinity
  for (let y = 0; y <= L; y += 5) for (const x of [-105, 0, 105]) for (const z of [-0.2, 0.2]) lowest = Math.min(lowest, bent(bend, x, y, z).z)
  assert.ok(lowest > -1e-6 && lowest < 0.05, 'its lowest point is on z 0')
  assert.ok(Math.abs(MOBIUS_PLATFORM.size.z - bentSize(bend).z) < 0.06, 'its size is the room it takes')
  assert.equal(fitsOn(MOBIUS_PLATFORM, BASE_PLATFORM), null, 'a platform is not set on another')
})
