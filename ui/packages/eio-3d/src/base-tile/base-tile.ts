// THE BASE TILE (21 Nov 2026, issue 123 in noi-planning). THE USER'S WORDS: "the base tile element, where the tile,
// one tile is for 10 meters into 10 meters section, but with 1 meter border radius. The tile has to be matte
// black." MY PICK, not the user's word: how thick the tile is. They gave no thickness.
// THE TILE'S BORDER. The user: "what I want to add to tiles is that ... to have a border. Let's keep the border
// size to be 0.1 meters." So the outermost part of a tile, all the way round and through its whole thickness, is
// its border; the tile stays as large. MY PICKS, not the user's word: the border's colour (Eidos's own border
// colour, as on Eidos's cards; they gave its size only), and that it is matte like the rest.
// Its measures are Eidos's (noi.eio.world.base-tile), each by the key Mero holds for it.
import type { BaseTileMeasure } from '@noi/eio-tokens/components'
import { role, value } from '../drawing/eidos.ts'
import type { Border, Slab, WorldElement } from '../drawing/element.ts'

/** Each measure of the base tile, as Eidos holds it, in metres. */
export const BASE_TILE_MEASURES: Record<BaseTileMeasure, number> = {
  width: value('noi.eio.world.base-tile.width'),
  breadth: value('noi.eio.world.base-tile.breadth'),
  thickness: value('noi.eio.world.base-tile.thickness'),
  'corner-radius': value('noi.eio.world.base-tile.corner-radius'),
  'border-width': value('noi.eio.world.base-tile.border-width'),
}

/** The base tile: one tile for one section of the land. */
export const BASE_TILE: WorldElement & { readonly shape: Slab; readonly border: Border } = {
  id: 'base-tile',
  name: 'Base tile',
  says: `One tile covers one ${BASE_TILE_MEASURES.width} m by ${BASE_TILE_MEASURES.breadth} m section of the land.`,
  size: { x: BASE_TILE_MEASURES.width, y: BASE_TILE_MEASURES.breadth, z: BASE_TILE_MEASURES.thickness },
  shape: { kind: 'slab', cornerRadius: BASE_TILE_MEASURES['corner-radius'] },
  surface: { colour: role('noi.eio.color.world.land'), finish: 'matte', says: 'matte black' },
  border: { width: BASE_TILE_MEASURES['border-width'], colour: role('noi.eio.color.border.default') },
}
