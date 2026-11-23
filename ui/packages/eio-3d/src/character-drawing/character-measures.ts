// The numbers the characters carry, as pages show them: THE CHARACTER, HOW IT MOVES, ITS FLIGHT INTO A SYSTEM and
// THE EYE THAT FOLLOWS IT, the first world's. (Of their values Eidos keeps only the character's height since 23 Nov
// 2026, issue 131: nothing reads the others till a character moves again; a page gives them.) A length is a line beside or behind the character; a speed or a time is words over him,
// and a walk or a run is shown by his clip at that speed. He stands at the middle, facing the eye (+z).
import type { Motion } from './characters.ts'

/** A point or a direction, in metres: x, y and z, with y up, as three.js has it. */
export type Vec3 = [number, number, number]

// Its measures are the keys Mero holds for it, written by Mero into @noi/eio-tokens (Component States,
// agreed 18 Nov): the table below names every one, so a measure missing here, or one Mero never
// approved, fails the type check.
import type { CharacterDrawingMeasure as CharacterMeasure } from '@noi/eio-tokens/components'
export type { CharacterMeasure }

/** The numbers the stage is given: one for each measure Mero holds, so a measure Mero approves is a number
 * the page must give, and a number the stage takes is a measure Mero holds. */
export type CharacterValues = Record<CharacterMeasure, number>

/** Each measure: its name as Mero's page has it, its unit, and the group it is in. */
export const CHARACTER_MEASURES: Record<CharacterMeasure, { name: string; unit: 'm' | 's' | 'm/s'; group: 'character' | 'movement' | 'flight' | 'eye' }> = {
  height: { name: 'Character height', unit: 'm', group: 'character' },
  stepUp: { name: 'Highest step without a jump', unit: 'm', group: 'character' },
  walk: { name: 'Walk', unit: 'm/s', group: 'movement' },
  run: { name: 'Run', unit: 'm/s', group: 'movement' },
  fly: { name: 'Fly', unit: 'm/s', group: 'movement' },
  rise: { name: 'Rise and sink', unit: 'm/s', group: 'movement' },
  jump: { name: 'Jump height', unit: 'm', group: 'movement' },
  hover: { name: 'Hover height', unit: 'm', group: 'movement' },
  ceiling: { name: 'Flight ceiling', unit: 'm', group: 'movement' },
  jumpHeight: { name: 'Flight jump height', unit: 'm', group: 'flight' },
  jumpTime: { name: 'Flight jump time', unit: 's', group: 'flight' },
  topSpeed: { name: 'Flight top speed', unit: 'm/s', group: 'flight' },
  catchUp: { name: 'Eye catch-up time', unit: 's', group: 'flight' },
  leastIn: { name: 'Least time in a gateway', unit: 's', group: 'flight' },
  dark: { name: 'Going dark', unit: 's', group: 'flight' },
  onFoot: { name: 'Eye on foot', unit: 'm', group: 'eye' },
  eyeJump: { name: 'Eye in the jump', unit: 'm', group: 'eye' },
  chase: { name: 'Eye in fast flight', unit: 'm', group: 'eye' },
  eyeGateway: { name: 'Eye in a gateway', unit: 'm', group: 'eye' },
}

/** What he does on the page: walk or run at that speed; otherwise he stands calmly. */
export function motionFor(which: CharacterMeasure | null | undefined): Motion {
  return which === 'walk' ? 'walk' : which === 'run' ? 'run' : 'stand'
}

/** Where a length lies: up beside him (heights), or along the ground behind him (the eye's distances; he
 * faces the eye, so behind him is -z). A speed or a time has no line: null. */
export function characterLine(v: CharacterValues, which: CharacterMeasure): { from: Vec3; to: Vec3; tick: Vec3 } | null {
  const side = Math.max(0.5, v.height * 0.3), up = (h: number) => ({ from: [side, 0, 0] as Vec3, to: [side, h, 0] as Vec3, tick: [1, 0, 0] as Vec3 })
  const behind = (d: number) => ({ from: [0, 0.02, 0] as Vec3, to: [0, 0.02, -d] as Vec3, tick: [1, 0, 0] as Vec3 })
  switch (which) {
    case 'height': return up(v.height)
    case 'stepUp': return { from: [side, 0, v.height * 0.25], to: [side, v.stepUp, v.height * 0.25], tick: [1, 0, 0] }
    case 'jump': return up(v.jump)
    case 'hover': return up(v.hover)
    case 'ceiling': return up(v.ceiling)
    case 'jumpHeight': return up(v.jumpHeight)
    case 'onFoot': return behind(v.onFoot)
    case 'eyeJump': return behind(v.eyeJump)
    case 'chase': return behind(v.chase)
    case 'eyeGateway': return behind(v.eyeGateway)
    // A speed or a time: words over him, no line.
    case 'walk': case 'run': case 'fly': case 'rise': case 'jumpTime': case 'topSpeed': case 'catchUp': case 'leastIn': case 'dark':
      return null
    default: {
      // Every measure Mero holds is named above: one it adds fails the type check here.
      const unnamed: never = which
      return unnamed
    }
  }
}

/** A measure in words, as a page shows it beside or over him: its name, its number and its unit. */
export function measureWords(v: CharacterValues, which: CharacterMeasure): string {
  const m = CHARACTER_MEASURES[which]
  return `${m.name} · ${v[which].toLocaleString('en-GB', { maximumFractionDigits: 2 })} ${m.unit}`
}
