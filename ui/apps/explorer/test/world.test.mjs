// The new 3D world (21 Nov 2026), from the user's three answers of that day: three.js draws all of it, no
// panels unless asked for, and nothing of the first world is assumed. These are the rules of the page that shows
// it: the picture's size is bounded, the world is drawn with three.js alone, the page lays nothing over the world
// but what the user asked for, the land and its coordinates, the gallery and its 3D view. The world's elements
// themselves, and the drawing they share, are Eidos's (@noi/eio-3d, 23 Nov 2026): their rules are tested there,
// in its test/elements.test.mjs and test/rules.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MOST_DOTS, pictureSize } from '../app/hyperbase/world/world.ts'
import { at, between, fromThree, readPlace, readSpan, standsOn, toThree, writePlace, writeSpan } from '../app/hyperbase/world/place.ts'
import {
  EVERY, HALF, ISOMETRIC, LAID_BY_THE_USER, LONG, SHOWN, SIDES, USERS_MARKERS, WAYS, astroidsBetween, changed, covering, edgeNumbers, edges, highestTop, inPicture, isometricOver, markerBox, markers,
  markersShown, marks, middleOf, onLand, openLand, pictureHolds, pointerWords, runs, sideMiddle, sideNames, slid, startOfLand, elementOf, thingWords, thingsOver, topAt, travelled, wayInPicture, wordsShown,
} from '../app/hyperbase/world/land.ts'
import { BASE_PLATFORM, BASE_TILE, CAMERA_MODULE, DRONE, ELEMENTS, covers, fitsOn, outline } from '@noi/eio-3d'

const WORLD = fileURLToPath(new URL('../app/hyperbase/world/', import.meta.url))

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

// THE ELEMENTS ARE EIDOS'S (23 Nov 2026). Till then the world's elements lived in this folder, and @noi/eio-3d held
// the first world's, which this page never used. The user: "register all the elements that we have created today
// into Mero and design system." So the elements and the drawing they share are in @noi/eio-3d, and this page takes
// them from there; nothing of an element is written here.
test('three.js draws all of it: the world writes no drawing code of its own, and takes its elements from Eidos', () => {
  for (const name of readdirSync(WORLD).filter(f => /\.tsx?$/.test(f))) {
    const text = code(read(name))
    assert.doesNotMatch(text, /getContext\(/, `${name} asks the canvas for a drawing context of its own`)
    assert.doesNotMatch(text, /\bgl\.(draw|bind|use|create)[A-Z]/, `${name} draws by hand`)
    assert.doesNotMatch(text, /\b(interface WorldElement|function makeElement|function makeMany|const BASE_TILE\b)/, `${name} makes an element of its own`)
  }
  assert.match(code(read('world.ts')), /import\('three\/webgpu'\)/, 'three.js is asked for only when the world opens')
  assert.match(code(read('world.ts')), /export interface World extends ThreeWorld \{/, 'the stage is the three.js world Eidos\'s elements are drawn into')
  for (const name of ['inspect.ts', 'drawLand.ts', 'land.ts']) assert.match(code(read(name)), /from '@noi\/eio-3d'/, `${name} takes the elements from Eidos`)
  assert.deepEqual(readdirSync(WORLD).filter(f => /^(elements|makeElement|light|bend|wave|wavePlatform|solids)\.ts$/.test(f) || f === 'elements'), [], 'no copy of them is left here')
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
// [modal] in 3D view so that I can inspect the element." The elements' own rules are tested with them, in
// @noi/eio-3d; here, what the land and the gallery do with them.

const GALLERY = name => readFileSync(WORLD + 'gallery/' + name, 'utf8')

test('one base tile fills one square of the land\'s stronger lines', () => {
  assert.deepEqual([BASE_TILE.size.x, BASE_TILE.size.y], [EVERY, EVERY], 'one tile fills one square of the stronger lines')
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
  assert.match(stage, /light\(world, look\.colour, lightFor\(world, look\.colour\(element\.surface\.colour\)\), true\)/, 'and the underside is lit')
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
    assert.match(text, /from '@noi\/eio-3d'/, `${name} takes the elements from Eidos`)
  }
})

// AN ELEMENT'S STATES, AND ITS OWN CONTROLS (22 Nov 2026, issue 127). The user: "I also think each [element] also
// have their own set of controls that are specific to them. For example, the camera is used to view, so a
// drone is used to fly around and hover on the different states of it. So I think we should also cater for
// those states and features of an element." From their words: the drone hovers and flies around; the camera
// views; each element's controls are its own. What else a state can say, the other states (landed, resting),
// which state an element starts in, and every number, are a session's design and are not held as rules.
test('the gallery offers an element\'s states as that element\'s own control, and the 3D view acts them out', () => {
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
test('the 3D view looks through the camera module, from where its lenses are, the way it looks', () => {
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

// THE BASE PLATFORM (23 Nov 2026, issue 127). The user: "Let's add the base platform as element in the gallery
// too. So that I can select items to place on the platform just like we do in the drone." That it is the whole
// platform, where a thing is placed on it, that one thing is placed at a time, and that the eye goes near what
// is placed, are a session's picks.
test('the base platform is the land as an element, and the 3D view goes to what is placed on it', () => {
  // it is the land: the land's size, and the land's own tiles and astroids, counted from its middle instead
  // of from the middle of its beginning's side
  assert.deepEqual([BASE_PLATFORM.size.x, BASE_PLATFORM.size.y, BASE_PLATFORM.size.z], [2 * HALF, LONG, BASE_TILE.size.z])
  const laid = BASE_PLATFORM.shape.things.map(t => `${t.element.id} at x ${t.at.x}, y ${t.at.y + LONG / 2}`).sort()
  const land = covering().map(t => `${t.element} at x ${t.at.x}, y ${t.at.y}`).sort()
  assert.equal(laid.length, TILES + ASTROIDS)
  assert.deepEqual(laid, land, 'a base tile on every section and an astroid wherever four tiles meet, exactly as the land is covered')
  // the 3D view: the same choice as on the drone; the eye may come near, and goes to what is placed
  const stage = code(read('inspect.ts'))
  assert.match(stage, /const nearest = \(element\.ground \? Math\.min\(reach, BASE_TILE\.size\.x \/ 2\) : reach\) \* 0\.1/, 'the hand may come as near to ground as to one tile')
  assert.match(stage, /if \(element\.ground\) lookAtPlaced\(piece, place\)/, 'the eye goes to what is placed')
  assert.match(stage, /if \(element\.ground && had\) eye\.glide\(firstSight\(element, narrowerAngle\(world\)\)\)/, 'and back to the whole platform when it is taken off')
  assert.match(stage, /if \(done && element\.ground && onAs\) standBack\(onAs, id\)/, 'and stands back for what the placed thing does in its state')
  assert.doesNotMatch(code(GALLERY('Gallery.tsx')), /['"`]base-platform['"`]/, 'the gallery does not name it: the choice comes from the data')
})

// THE STAGE'S STATES, ITS COLOUR AND ITS SIZE (23 Nov 2026, issue 127), in the gallery. The user: "let's have an
// active state and default state"; "One color applied to all parts of the stage"; "Only controls we need are
// colour, width, breadth and height." The stage's own rules are tested with it, in @noi/eio-3d.
test('the gallery offers the stage\'s states, its colour and its sizes from its data, naming none of them', () => {
  assert.doesNotMatch(code(GALLERY('Gallery.tsx')), /['"`](stage|default|active)['"`]/, 'the two states, without a word about the stage in the gallery\'s code')
  // the gallery: the element's own control, in its card, made of Eidos's Select and Swatch; nothing is named
  const gallery = code(GALLERY('Gallery.tsx'))
  assert.match(gallery, /\{coloursIn\(element, chosen\)\.length > 0 && \(\s+<Colours of=\{element\} lit=\{coloursIn\(element, chosen\)\}/, 'offered for the colours the chosen state lights with')
  assert.match(gallery, /<Swatch color=\{`var\(\$\{now\}\)`\} \/>/, 'the colour as it is now, shown by Eidos\'s Swatch')
  assert.match(gallery, /<Select wide label=\{`The colour of the \$\{of\.name\.toLowerCase\(\)\}'s \$\{own\.name\.toLowerCase\(\)\}`\} value=\{now\} onChange=\{e => tryOut\(own\.id, e\.target\.value\)\}>/, 'chosen with Eidos\'s Select')
  assert.match(gallery, /\{COLOURS_TO_TRY\.map\(offered => <option key=\{offered\.colour\} value=\{offered\.colour\}>\{offered\.name\}<\/option>\)\}/, 'among Eidos\'s colours, from the data')
  assert.doesNotMatch(gallery, /['"`](light|Colour)['"`]/, 'the gallery does not name the stage\'s colour: another element\'s show by themselves')
  assert.match(code(GALLERY('ElementView.tsx')), /for \(const \[id, token\] of Object\.entries\(colours\)\) opened\.colour\(id, token, 'it'\)/, 'and the 3D view follows the choice')
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
  assert.match(picture, /light\(world, look\.colour\)/, 'in plain light, the same as in the gallery')
  assert.match(code(read('inspect.ts')), /light\(world, look\.colour, lightFor\(/, 'which lights by the same light of Eidos\'s')
})

test('the gallery says all of an element in words', () => {
  assert.match(code(GALLERY('Gallery.tsx')), /\{inWords\(element\)\}/, 'the gallery says all of it')
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

// AN ELEMENT ON ITS PAGE IN MERO (23 Nov 2026). Till the first world left Eidos its elements were drawn on their
// components' pages; the new world's are again, with the gallery's own 3D view.
test('a world element\'s component page in Mero shows the element in 3D, with the gallery\'s view', () => {
  const merons = fileURLToPath(new URL('../app/merons/', import.meta.url))
  const page = code(readFileSync(merons + 'MeronScreen.tsx', 'utf8'))
  assert.match(page, /m\.classification\.type === 'component' && m\.identity\.path\.startsWith\(WORLD\) && <ElementOnPage id=\{m\.identity\.path\.slice\(WORLD\.length\)\} \/>/, 'on a 3D world component\'s page, by the last part of its path')
  const shown = code(readFileSync(merons + 'ElementOnPage.tsx', 'utf8'))
  assert.match(shown, /const element = elementById\(id\)/, 'the element is Eidos\'s, by its id')
  assert.match(shown, /<ElementView element=\{element\} \/>/, 'shown by the gallery\'s own 3D view')
})
