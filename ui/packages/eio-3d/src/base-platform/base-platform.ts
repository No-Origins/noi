// THE BASE PLATFORM (23 Nov 2026, issue 127). The user: "Let's add the base platform as element in the gallery
// too. So that I can select items to place on the platform just like we do in the drone." The base platform is
// the world's base as the user had it built (21 to 23 Nov 2026): 21 tiles across (the user: "if there are only 21
// tiles in a row, so that becomes odd ... one column for the center") and 600 m long ("maybe we can make y up to
// 600"), a base tile on every section, and an astroid wherever four tiles meet.
// FROM THE USER'S WORDS: it is an element in the gallery, and in its 3D view one chooses things to place on it,
// as one chooses what to set on the drone.
// MY PICKS, not the user's word: that the element is the whole platform and not a part of it; where a thing is
// placed (the middle of the tile beside the platform's middle, on the tile's top); that one thing is placed at
// a time, as on the drone; that what can be placed is whatever stands by itself (so not the camera module,
// which goes on studs, and not the tiles and astroids the platform is laid from).
// Like every element it stands by the middle of its base, so its middle is x 0, y 0. On the land the same
// platform is counted from the middle of its beginning's side; the land reads the same two measures.
// IN TILES (23 Nov 2026, issue 131): the user decided a platform is sized on the grid, so its size is held as a
// count of tiles (noi.eio.world.base-platform), and its measures in metres are worked out from the tile.
import type { BasePlatformMeasure } from '@noi/eio-tokens/components'
import { ASTROID } from '../astroid/astroid.ts'
import { BASE_TILE } from '../base-tile/base-tile.ts'
import { value } from '../drawing/eidos.ts'
import type { Laid, WorldElement } from '../drawing/element.ts'

/** Each measure of the base platform, in metres: as many tiles across and along as Eidos holds. */
export const BASE_PLATFORM_MEASURES: Record<BasePlatformMeasure, number> = {
  width: value('noi.eio.world.base-platform.tiles-across') * BASE_TILE.size.x,
  length: value('noi.eio.world.base-platform.tiles-long') * BASE_TILE.size.y,
}

const things: Array<{ element: WorldElement; at: { x: number; y: number } }> = (() => {
  const [stepX, stepY] = [BASE_TILE.size.x, BASE_TILE.size.y]
  const [hx, hy] = [BASE_PLATFORM_MEASURES.width / 2, BASE_PLATFORM_MEASURES.length / 2]
  const laid: Array<{ element: WorldElement; at: { x: number; y: number } }> = []
  // a base tile on every section
  for (let x = stepX / 2 - hx; x < hx; x += stepX) for (let y = stepY / 2 - hy; y < hy; y += stepY) laid.push({ element: BASE_TILE, at: { x, y } })
  // an astroid wherever four tiles meet: at every corner of a section that is not on the platform's edge
  for (let x = stepX - hx; x < hx; x += stepX) for (let y = stepY - hy; y < hy; y += stepY) laid.push({ element: ASTROID, at: { x, y } })
  return laid
})()

/** The base platform: the whole base of the world, laid from base tiles and astroids. Things are placed on it. */
export const BASE_PLATFORM: WorldElement & { readonly shape: Laid; readonly ground: { readonly x: number; readonly y: number; readonly z: number; readonly step: number } } = {
  id: 'base-platform',
  name: 'Base platform',
  says: `The base of the world: a base tile on every ${BASE_TILE.size.x} m by ${BASE_TILE.size.y} m section, and an astroid wherever four tiles meet. Other elements are placed on it.`,
  size: { x: BASE_PLATFORM_MEASURES.width, y: BASE_PLATFORM_MEASURES.length, z: BASE_TILE.size.z },
  shape: {
    kind: 'laid',
    things,
    says: `${things.filter(t => t.element === BASE_TILE).length} base tiles, and ${things.filter(t => t.element === ASTROID).length} astroids where four of them meet`,
  },
  surface: { ...BASE_TILE.surface, says: `${BASE_TILE.surface.says} tiles, astroids in the secondary colour` },
  // a thing is placed on the middle of a tile of the middle column (x 0), beside the platform's middle, on its top
  ground: { x: 0, y: BASE_TILE.size.y / 2, z: BASE_TILE.size.z, step: BASE_TILE.size.x },
}
