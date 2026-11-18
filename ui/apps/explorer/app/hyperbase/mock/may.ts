// Who may press what, in the mock (15 Nov): the grid "who may do what" of the agreed page
// "Hyperbase in Governance and Mero" (12 Nov), as one small table. Later this is Governance's
// answer for each button, and this file goes. A button you may not press is not drawn.
// Agreed 16 Nov: the space's person is a fifth position. In their own space they ask, steer,
// accept, send back and share. An owner has no buttons there, and looks in only with a touch.
import type { Role, Verb } from './types'

export const ROLES: { role: Role; name: string; sees: string }[] = [
  { role: 'viewer', name: 'Viewer', sees: 'A viewer sees every page it was given, with no buttons.' },
  { role: 'member', name: 'Member', sees: 'A member hands work over, and steers what it handed over.' },
  { role: 'engineer', name: 'Team engineer', sees: 'A team engineer looks after its team (here: build), and may stop its runs.' },
  { role: 'owner', name: 'Owner', sees: 'An owner does all of it, lands the work, and has the links into Governance’s limits.' },
  { role: 'person', name: 'The space’s person', sees: 'The space’s person asks, steers, accepts, sends back and shares in their own space, and reaches that space only.' },
]

const MAY: Record<Role, Verb[]> = {
  viewer: [],
  member: ['give', 'steer', 'stop'],
  engineer: ['tend', 'stop'],
  owner: ['give', 'steer', 'stop', 'tend', 'limits', 'land'],
  // In their own space. What is outside it is not shown to them at all: see `sees`.
  person: ['steer', 'stop', 'accept'],
}
/** The team the mock's team engineer looks after. An owner tends every team. */
export const ENGINEERS_TEAM = 'build'

export function may(role: Role, verb: Verb, team?: string): boolean {
  if (!MAY[role].includes(verb)) return false
  if (verb === 'tend' && role === 'engineer' && team !== undefined) return team === ENGINEERS_TEAM
  return true
}
/** Seeing goes by place (agreed 16 Nov). What is in a space is seen by its person, and by nobody
    else as a matter of course; a role inside a space reaches that space only. */
export const sees = (role: Role, space?: string) => (role === 'person') === Boolean(space)
