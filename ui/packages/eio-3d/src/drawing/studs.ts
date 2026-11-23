// THE ONE GRID OF STUDS (22 Nov 2026, issue 127). The user, of the drone: "what I want you to imagine the drone as a
// Lego piece, and we will create more and more pieces over time that can attach to the drone." And then: "I would
// have preferred 4 as a grid, and we can adapt that to other things that we build in the future." So there is one
// grid for the whole world, and every element with studs (the drone) or sockets (the camera module) is on it, so
// that a piece made for it fits on anything that has studs.
// ONE SIZE OF STUD (23 Nov 2026, issue 131). The user: "studs should have universally one single size", and, asked
// whether a bigger element gets bigger studs or more of them: "I also would like to go with A" (more of them, as
// the toy's bricks). So the stud is one size everywhere: the pitch is Eidos's (noi.eio.world.stud.pitch), the one
// stud measure that fits elements together; a stud's width and height are this file's own, as shares of the pitch
// (the toy's own proportions; MY PICK of 22 Nov, not the user's word). How many studs an element carries is the
// element's own: the user's four, two by two, on the drone at its Base size, more on a larger drone.
import { value } from './eidos.ts'
import type { Studs } from './element.ts'

/** The grid: `pitch` is metres from one stud's middle to the next; `across` is a stud's width and `tall` its
 * height, each as a share of the pitch. */
export const STUD_GRID = {
  pitch: value('noi.eio.world.stud.pitch'),
  across: 0.6,
  tall: 0.2125,
} as const

/** How many studs a side of a square of them takes, the most that fit a square `room` metres across: each stud
 * takes one pitch of it. At least one. */
export function studsFitting(room: number): number {
  // a hair more, so that a room of exactly so many pitches is not counted one short by the computer's rounding
  return Math.max(1, Math.floor(room / STUD_GRID.pitch + 1e-9))
}

/** A square of studs (or of sockets) on the grid, `side` studs a side, centred on the element's middle, `z` metres
 * above its base: each as wide and as tall as the grid says. They are counted row by row, the first from high x
 * and high y. */
export function squareOfStuds(side: number, z: number): Studs {
  const { pitch } = STUD_GRID
  const along = Array.from({ length: side }, (_, i) => (i - (side - 1) / 2) * pitch)
  const rows = [...along].reverse()
  return {
    pitch,
    radius: (STUD_GRID.across * pitch) / 2,
    height: STUD_GRID.tall * pitch,
    // each row turns back on the one before it, so that they go round the square
    at: rows.flatMap((y, row) => (row % 2 === 0 ? [...along].reverse() : along).map(x => ({ x: x === 0 ? 0 : x, y: y === 0 ? 0 : y, z }))),
  }
}
