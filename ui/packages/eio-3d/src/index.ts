// @noi/eio-3d: Eidos's 3D elements for No Origins (23 Nov 2026). The new world's eight elements, each in a
// folder of its own, made by the shared drawing (drawing/) from its data, with every number and colour from
// Eidos; and the three characters (their models, looks, clips and measures), which join the new world next.
// three.js draws every element, into the three.js world the page that shows it opens (drawing/space.ts).
import { ASTROID } from './astroid/astroid.ts'
import { BASE_PLATFORM } from './base-platform/base-platform.ts'
import { BASE_TILE } from './base-tile/base-tile.ts'
import { CAMERA_MODULE } from './camera-module/camera-module.ts'
import type { WorldElement } from './drawing/element.ts'
import { DRONE } from './drone/drone.ts'
import { MOBIUS_PLATFORM } from './mobius-platform/mobius-platform.ts'
import { STAGE } from './stage/stage.ts'
import { WAVE_PLATFORM } from './wave-platform/wave-platform.ts'

// ——— the elements ———
export { BASE_TILE, BASE_TILE_MEASURES } from './base-tile/base-tile.ts'
export { ASTROID, ASTROID_MEASURES } from './astroid/astroid.ts'
export { BASE_PLATFORM, BASE_PLATFORM_MEASURES } from './base-platform/base-platform.ts'
export { MOBIUS_PLATFORM, MOBIUS_PLATFORM_MEASURES } from './mobius-platform/mobius-platform.ts'
export { PROFILE, WAVE, WAVE_PLATFORM, WAVE_PLATFORM_MEASURES } from './wave-platform/wave-platform.ts'
export { DRONE, DRONE_STATES } from './drone/drone.ts'
export { CAMERA_MODULE, CAMERA_MODULE_STATES } from './camera-module/camera-module.ts'
export { STAGE, STAGE_COLOURS, STAGE_SETTINGS, STAGE_STATES } from './stage/stage.ts'

/** Every element of the world, in the order a gallery shows them. */
export const ELEMENTS: readonly WorldElement[] = [BASE_TILE, ASTROID, BASE_PLATFORM, MOBIUS_PLATFORM, WAVE_PLATFORM, DRONE, CAMERA_MODULE, STAGE]

/** An element by its id, or null when there is none. */
export function elementById(id: string): WorldElement | null {
  return ELEMENTS.find(e => e.id === id) ?? null
}

// ——— the shared drawing ———
export { role, value, type NumberPath, type RolePath } from './drawing/eidos.ts'
export type { Frame, Size, ThreeWorld, Xyz } from './drawing/space.ts'
export {
  COLOURS_TO_TRY, borderWords, coloursIn, firstSight, fitsOn, inWords, metres, pieceTurn, poseIn, reachIn, shapeWords, sizeWords, sizedBy, surfaceWords,
  type Astroid, type Border, type ElementColour, type ElementSetting, type ElementState, type Flat, type Laid, type LookOut, type Piece, type Pieces, type Pose,
  type Ring, type Slab, type Spin, type Studs, type Surface, type WorldElement,
} from './drawing/element.ts'
export { CORNER_PIECES, covers, flatOutline, footprint, holesOf, inBorder, inside, outline, pieceHoles, pieceOutline, withinBorder, withinPieceBorder } from './drawing/outline.ts'
export { STUD_GRID, STUDS_A_SIDE, squareOfStuds } from './drawing/studs.ts'
export { bendAt, bent, bentSize, bentWalk, frameOf as bentFrame, lengthOf as bentLength, twistAt, type Bend } from './drawing/bend.ts'
export { frameOf as waveFrame, lengthOf as waveLength, sizeOf as waveSize, type Run, type Wave } from './drawing/wave.ts'
export { LIGHT, light, lightFor } from './drawing/light.ts'
export { makeElement, makeMany, type Made } from './drawing/make.ts'

// ——— the characters ———
export { CharacterPainter, characterFiles, type CharacterFiles, type Motion } from './character-drawing/characters.ts'
export { characterLine, CHARACTER_MEASURES, measureWords, motionFor, type CharacterMeasure, type CharacterValues, type Vec3 } from './character-drawing/character-measures.ts'
