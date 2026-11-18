// The 3D world's elements, drawn from what Mero holds (17 Nov, the user: "We now have noi.eio.world.arch
// which is a 3D model. I think, we should show the models within these pages too"; and "Only their own
// pages"). An element's page shows it whole; each of its numbers' pages shows it with that measure
// marked. Everything a model is made of is read here from Mero's merons, so it is what Mero holds now.
import { CHARACTER_MEASURES, characterFiles, stepCount, type ArchMeasure, type CharacterMeasure, type GatewayMeasure, type LandMeasure, type PoolMeasure, type Scene, type StepsMeasure } from '@noi/eio-3d'
import { hex, resolve } from './color'
import type { Index } from './mero'

const W = 'noi.eio.world'
const ARCH_NUMBERS: ArchMeasure[] = ['height', 'width', 'thickness', 'reach', 'distance']
/** The land's three pages, and which of their numbers is which measure. */
const LAND_PAGES: Record<string, { focus: 'land' | 'circles' | 'edge'; numbers: Record<string, LandMeasure> }> = {
  [`${W}.land`]: { focus: 'land', numbers: { radius: 'radius' } },
  [`${W}.circles`]: { focus: 'circles', numbers: { radius: 'circle-radius', place: 'place', dash: 'dash', line: 'line' } },
  [`${W}.edge`]: { focus: 'edge', numbers: { band: 'band', grain: 'grain' } },
}

const metres = (idx: Index, path: string) => {
  const v = idx.byPath.get(path)?.spec?.m
  return typeof v === 'number' ? v : undefined
}
const colour = (idx: Index, role: string) => {
  const r = resolve(idx, `noi.eio.color.world.${role}`)
  return r ? hex(r.dark) : undefined
}
/** Every number by name, or nothing when one is missing from Mero. */
function numbers<K extends string>(idx: Index, paths: Record<K, string>): Record<K, number> | null {
  const out = {} as Record<K, number>
  for (const k in paths) { const v = metres(idx, paths[k]); if (v === undefined) return null; out[k] = v }
  return out
}
function colours<K extends string>(idx: Index, roles: Record<K, string>): Record<K, string> | null {
  const out = {} as Record<K, string>
  for (const k in roles) { const v = colour(idx, roles[k]); if (!v) return null; out[k] = v }
  return out
}

/** The model for a page, or nothing: an element's group page, or one of its numbers' pages, when every
 * number and colour it needs is in Mero. */
export function worldScene(idx: Index, path: string): { scene: Scene; label: string } | null {
  return archScene(idx, path) ?? landScene(idx, path) ?? poolScene(idx, path) ?? stepsScene(idx, path) ?? gatewayScene(idx, path) ?? characterScene(idx, path)
}

function archScene(idx: Index, path: string): { scene: Scene; label: string } | null {
  const ARCH = `${W}.arch`
  if (path !== ARCH && !path.startsWith(ARCH + '.')) return null
  const measure = path === ARCH ? null : path.slice(ARCH.length + 1)
  if (measure !== null && !ARCH_NUMBERS.includes(measure as ArchMeasure)) return null
  const a = numbers(idx, { height: `${ARCH}.height`, width: `${ARCH}.width`, thickness: `${ARCH}.thickness`, reach: `${ARCH}.reach`, distance: `${ARCH}.distance` })
  const e = numbers(idx, { landRadius: `${W}.land.radius`, band: `${W}.edge.band`, grain: `${W}.edge.grain` })
  const c = colours(idx, { body: 'arch', sky: 'sky', highlight: 'highlight' })
  if (!a || !e || !c) return null
  const scene: Scene = { element: 'arch', arch: a, edge: e, colours: c, measure: measure as ArchMeasure | null }
  const label = measure
    ? `A system's arch, ${a.height} metres tall, with its ${measure} marked in lime: ${a[measure as ArchMeasure]} metres.`
    : `A system's arch: one white block, ${a.height} metres tall and ${a.width} wide, its top reaching ${a.reach} metres toward the pool. Behind it the block goes on and dissolves into dust at the edge of the world.`
  return { scene, label }
}

function landScene(idx: Index, path: string): { scene: Scene; label: string } | null {
  const page = Object.keys(LAND_PAGES).find(p => path === p || path.startsWith(p + '.'))
  if (!page) return null
  const { focus, numbers: names } = LAND_PAGES[page]
  const key = path === page ? null : path.slice(page.length + 1)
  if (key !== null && !(key in names)) return null
  const measure = key === null ? null : names[key]
  const v = numbers(idx, {
    radius: `${W}.land.radius`, band: `${W}.edge.band`, grain: `${W}.edge.grain`, circleRadius: `${W}.circles.radius`,
    place: `${W}.circles.place`, dash: `${W}.circles.dash`, line: `${W}.circles.line`, poolRadius: `${W}.pool.radius`, wallWidth: `${W}.wall.width`,
  })
  const c = colours(idx, { land: 'land', sky: 'sky', circle: 'circle', dust: 'dust', highlight: 'highlight' })
  if (!v || !c) return null
  const scene: Scene = { element: 'land', land: v, colours: c, focus, measure }
  const whole = `The round land, ${v.radius * 2} metres across and black, with rows of dashed circles round the empty middle where the pool goes; past ${v.radius} metres it dissolves into dust, and ${v.band} metres further nothing is left.`
  const label = measure ? `${whole} Marked in lime: ${measure.replace('-', ' ')}.` : whole
  return { scene, label }
}

/** The pool's two pages, and which of their numbers is which measure. */
const POOL_PAGES: Record<string, { focus: 'pool' | 'wall'; numbers: Record<string, PoolMeasure> }> = {
  [`${W}.pool`]: { focus: 'pool', numbers: { radius: 'pool-radius' } },
  [`${W}.wall`]: { focus: 'wall', numbers: { height: 'wall-height', width: 'wall-width' } },
}

function poolScene(idx: Index, path: string): { scene: Scene; label: string } | null {
  const page = Object.keys(POOL_PAGES).find(p => path === p || path.startsWith(p + '.'))
  if (!page) return null
  const { focus, numbers: names } = POOL_PAGES[page]
  const key = path === page ? null : path.slice(page.length + 1)
  if (key !== null && !(key in names)) return null
  const measure = key === null ? null : names[key]
  const land = numbers(idx, {
    radius: `${W}.land.radius`, band: `${W}.edge.band`, grain: `${W}.edge.grain`, circleRadius: `${W}.circles.radius`,
    place: `${W}.circles.place`, dash: `${W}.circles.dash`, line: `${W}.circles.line`, poolRadius: `${W}.pool.radius`, wallWidth: `${W}.wall.width`,
  })
  const wall = numbers(idx, { poolRadius: `${W}.pool.radius`, height: `${W}.wall.height`, width: `${W}.wall.width` })
  const c = colours(idx, { land: 'land', sky: 'sky', circle: 'circle', dust: 'dust', highlight: 'highlight', wall: 'wall', water: 'water', waterDeep: 'water-deep' })
  if (!land || !wall || !c) return null
  const scene: Scene = { element: 'pool', land, wall, colours: c, focus, measure }
  const whole = `The round pool, ${wall.poolRadius * 2} metres across, its water moving in small waves and mirroring the white wall round it, ${wall.height} metres high and ${wall.width} wide, on the black land.`
  const label = measure ? `${whole} Marked in lime: ${measure.replace('-', ' ')}.` : whole
  return { scene, label }
}

const STEPS_NUMBERS: StepsMeasure[] = ['start', 'depth', 'height', 'top']

function stepsScene(idx: Index, path: string): { scene: Scene; label: string } | null {
  const STEPS = `${W}.steps`
  if (path !== STEPS && !path.startsWith(STEPS + '.')) return null
  const measure = path === STEPS ? null : path.slice(STEPS.length + 1)
  if (measure !== null && !STEPS_NUMBERS.includes(measure as StepsMeasure)) return null
  const land = numbers(idx, {
    radius: `${W}.land.radius`, band: `${W}.edge.band`, grain: `${W}.edge.grain`, circleRadius: `${W}.circles.radius`,
    place: `${W}.circles.place`, dash: `${W}.circles.dash`, line: `${W}.circles.line`, poolRadius: `${W}.pool.radius`, wallWidth: `${W}.wall.width`,
  })
  const st = numbers(idx, { start: `${STEPS}.start`, depth: `${STEPS}.depth`, height: `${STEPS}.height`, top: `${STEPS}.top` })
  const c = colours(idx, { land: 'land', sky: 'sky', circle: 'circle', dust: 'dust', highlight: 'highlight', edge: 'step-edge' })
  if (!land || !st || !c) return null
  const steps = { ...st, reach: land.radius + land.band }
  const scene: Scene = { element: 'steps', steps, land, colours: c, measure: measure as StepsMeasure | null }
  const whole = `${stepCount(steps)} black steps in a half circle behind the pool's place, each ${steps.depth} metres deep and ${steps.height} high, one grey line at each lip, rising to the top step ${steps.top} metres above the land, which runs out and dissolves with the land.`
  const label = measure ? `${whole} Marked in lime: ${measure}.` : whole
  return { scene, label }
}

/** The gateway's page and the lime ripples' page, and which of their numbers is which measure. */
const GATEWAY_PAGES: Record<string, { focus: 'gateway' | 'ripples'; numbers: Record<string, GatewayMeasure> }> = {
  [`${W}.gateway`]: { focus: 'gateway', numbers: { depth: 'depth' } },
  [`${W}.ripples`]: { focus: 'ripples', numbers: { gap: 'gap', speed: 'speed', tail: 'tail', behind: 'behind', ahead: 'ahead' } },
}
/** A number in Mero by its kind's field: metres, seconds, or metres a second. */
const value = (idx: Index, path: string) => {
  const spec = idx.byPath.get(path)?.spec
  const v = spec?.m ?? spec?.s ?? spec?.m_per_s
  return typeof v === 'number' ? v : undefined
}

function gatewayScene(idx: Index, path: string): { scene: Scene; label: string } | null {
  const page = Object.keys(GATEWAY_PAGES).find(p => path === p || path.startsWith(p + '.'))
  if (!page) return null
  const { focus, numbers: names } = GATEWAY_PAGES[page]
  const key = path === page ? null : path.slice(page.length + 1)
  if (key !== null && !(key in names)) return null
  const measure = key === null ? null : names[key]
  const ARCH = `${W}.arch`
  const arch = numbers(idx, { height: `${ARCH}.height`, width: `${ARCH}.width`, thickness: `${ARCH}.thickness`, reach: `${ARCH}.reach`, distance: `${ARCH}.distance` })
  const g = numbers(idx, { depth: `${W}.gateway.depth`, grain: `${W}.edge.grain` })
  const R = `${W}.ripples`, rp = { gap: value(idx, `${R}.gap`), speed: value(idx, `${R}.speed`), tail: value(idx, `${R}.tail`), behind: value(idx, `${R}.behind`), ahead: value(idx, `${R}.ahead`) }
  const c = colours(idx, { body: 'arch', sky: 'sky', highlight: 'highlight' })
  if (!arch || !g || !c || Object.values(rp).some(v => v === undefined)) return null
  const ripples = rp as { gap: number; speed: number; tail: number; behind: number; ahead: number }
  const scene: Scene = { element: 'gateway', gateway: { arch, depth: g.depth, grain: g.grain }, ripples, colours: c, focus, measure }
  const label = focus === 'gateway'
    ? `Looking in through a system's door: the gateway's white walls, floor and ceiling carry on and dissolve into dust, nothing left ${g.depth} metres in.${measure ? ' Marked in lime: its depth.' : ''}`
    : `Inside a gateway in flight: the walls go on as thin dust, and rings of lime run from behind the character, past him and on ahead, one every ${ripples.gap} second${ripples.gap === 1 ? '' : 's'}.${measure ? ` Marked in lime: ${measure}.` : ''}`
  return { scene, label }
}

/** The characters' four pages, and which of their numbers is which measure. */
const CHARACTER_PAGES: Record<string, { focus: 'character' | 'movement' | 'flight' | 'eye'; numbers: Record<string, CharacterMeasure> }> = {
  [`${W}.character`]: { focus: 'character', numbers: { height: 'height', 'step-up': 'stepUp' } },
  [`${W}.movement`]: { focus: 'movement', numbers: { walk: 'walk', run: 'run', fly: 'fly', rise: 'rise', jump: 'jump', hover: 'hover', ceiling: 'ceiling' } },
  [`${W}.flight`]: { focus: 'flight', numbers: { 'jump-height': 'jumpHeight', 'jump-time': 'jumpTime', 'top-speed': 'topSpeed', 'catch-up': 'catchUp', 'least-in': 'leastIn', dark: 'dark' } },
  [`${W}.eye`]: { focus: 'eye', numbers: { 'on-foot': 'onFoot', jump: 'eyeJump', chase: 'chase', gateway: 'eyeGateway' } },
}
/** Where the app serves the characters' files (app/3d). */
const SERVED = '/3d'

function characterScene(idx: Index, path: string): { scene: Scene; label: string } | null {
  const page = Object.keys(CHARACTER_PAGES).find(p => path === p || path.startsWith(p + '.'))
  if (!page) return null
  const { focus, numbers: names } = CHARACTER_PAGES[page]
  const key = path === page ? null : path.slice(page.length + 1)
  if (key !== null && !(key in names)) return null
  const measure = key === null ? null : names[key]
  // every number of the four pages, by the measure's name
  const values: Record<string, number> = {}
  for (const [group, { numbers: ns }] of Object.entries(CHARACTER_PAGES)) {
    for (const [segment, name] of Object.entries(ns)) { const v = value(idx, `${group}.${segment}`); if (v === undefined) return null; values[name] = v }
  }
  const land = numbers(idx, {
    radius: `${W}.land.radius`, band: `${W}.edge.band`, grain: `${W}.edge.grain`, circleRadius: `${W}.circles.radius`,
    place: `${W}.circles.place`, dash: `${W}.circles.dash`, line: `${W}.circles.line`, poolRadius: `${W}.pool.radius`, wallWidth: `${W}.wall.width`,
  })
  const c = colours(idx, { land: 'land', sky: 'sky', circle: 'circle', dust: 'dust', highlight: 'highlight' })
  if (!land || !c) return null
  const all = characterFiles(SERVED), characters = focus === 'character' ? all : all.slice(0, 1)
  const scene: Scene = { element: 'characters', focus, characters, values: values as unknown as import('@noi/eio-3d').CharacterValues, land, colours: c, measure }
  const who = characters.map(x => x.name).join(', ')
  const label = `${who}, ${values.height} metres tall, standing on the black land${measure ? `, with ${CHARACTER_MEASURES[measure].name.toLowerCase()} marked in lime` : ''}.`
  return { scene, label }
}
