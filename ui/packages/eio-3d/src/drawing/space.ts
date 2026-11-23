// PLACES AND WAYS IN THE USER'S x, y, z (21 Nov 2026, issue 117 in noi-planning): metres, with z up. Every element
// is drawn in them, into a group of the three.js scene whose x, y and z are the user's (`xyz`); the page that
// shows the world makes that group, by its one crossing into three.js's own order.

/** A place or a way: so many metres along x, along y and up. */
export interface Xyz {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** A thing's size in metres: how far it runs along x, along y, and up. */
export type Size = Xyz

/** Where a place of a strip is, and which ways its own across, along and up point there. */
export interface Frame {
  readonly at: Xyz
  readonly across: Xyz
  readonly along: Xyz
  readonly up: Xyz
}

/** The three.js world an element is drawn into: three.js and its language for surfaces, as the page loaded them,
 * what draws the picture, and the group `xyz`, inside which a position is the user's x, y, z. */
export interface ThreeWorld {
  readonly three: typeof import('three/webgpu')
  readonly tsl: typeof import('three/tsl')
  readonly renderer: import('three/webgpu').WebGPURenderer
  readonly xyz: import('three/webgpu').Group
  /** Where the page serves this package's assets (its characters' files under `characters/`), when it does: a
   * thing drawn from files is loaded from there. */
  readonly assets?: string
}
