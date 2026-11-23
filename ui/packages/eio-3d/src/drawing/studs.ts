// THE ONE GRID OF STUDS (22 Nov 2026, issue 127). The user, of the drone: "what I want you to imagine the drone as a
// Lego piece, and we will create more and more pieces over time that can attach to the drone." And then: "I would
// have preferred 4 as a grid, and we can adapt that to other things that we build in the future." So there is one
// grid for the whole world, and every element with studs (the drone) or sockets (the camera module) is on it, so
// that a piece made for it fits on anything that has studs. The grid's numbers are Eidos's (noi.eio.world.stud-grid):
// the pitch, and a stud's width and height as shares of the pitch (the toy's own proportions); the user's four,
// two by two.
import { value } from './eidos.ts'
import type { Studs } from './element.ts'

/** The grid: `pitch` is metres from one stud's middle to the next; `across` is a stud's width and `tall` its
 * height, each as a share of the pitch; `count` how many studs a square of them holds. */
export const STUD_GRID = {
  pitch: value('noi.eio.world.stud-grid.pitch'),
  across: value('noi.eio.world.stud-grid.across'),
  tall: value('noi.eio.world.stud-grid.tall'),
  count: value('noi.eio.world.stud-grid.count'),
} as const

/** How many studs one side of the square holds: two, for the user's four. */
export const STUDS_A_SIDE = Math.round(Math.sqrt(STUD_GRID.count))
if (STUDS_A_SIDE * STUDS_A_SIDE !== STUD_GRID.count) throw new Error(`The studs are a square: ${STUD_GRID.count} studs are not.`)

/** A square of studs (or of sockets) on the grid, centred on the element's middle, `z` metres above its base:
 * each as wide and as tall as the grid says. They are counted row by row, the first from high x and high y. */
export function squareOfStuds(z: number): Studs {
  const { pitch } = STUD_GRID
  const along = Array.from({ length: STUDS_A_SIDE }, (_, i) => (i - (STUDS_A_SIDE - 1) / 2) * pitch)
  const rows = [...along].reverse()
  return {
    pitch,
    radius: (STUD_GRID.across * pitch) / 2,
    height: STUD_GRID.tall * pitch,
    // each row turns back on the one before it, so that the four go round the square
    at: rows.flatMap((y, row) => (row % 2 === 0 ? [...along].reverse() : along).map(x => ({ x: x === 0 ? 0 : x, y: y === 0 ? 0 : y, z }))),
  }
}
