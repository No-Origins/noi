// What each page of Studio reads (15 Nov, the mock): one small function for each thing a page
// needs. Today they answer from the made-up story in mock/story.ts. When Hyperbase's server exists,
// each function becomes one call to it, and the pages stay as they are. Nothing here calls
// Governance or Mero, and nothing needs a sign-in.
import { rowOfProject, rowOfRun } from './now'
import { DRAFTS, MONTH, ORDERS, ORDER_STARTS, PLACES, PROJECTS, RENEW, RUNS, SCORE, SINCE, SPACE, TALK, TEAMS, THING_PROJECTS, WAITING } from './story'
import type { Draft, Month, Order, Project, ProjectRow, Run, RunRow, Score, Since, Space, Team, TeamRow, Waiting } from './types'

/** Every project: No Origins' own, and the small projects for the things in a space (16 Nov). */
const ALL: Project[] = [...PROJECTS, ...THING_PROJECTS]
const rowOf = (r: Run): RunRow => rowOfRun(r, ALL.find(p => p.name === r.project)?.plan.length)

// ——— Today ———
/** What waits for a person, the oldest first. */
export async function waiting(): Promise<Waiting[]> {
  return [...WAITING].sort((a, b) => b.minutes - a.minutes)
}
/** How many things wait, for the count on the Hyperbase tab on every page of the app. */
export async function waitingCount(): Promise<number> {
  return WAITING.filter(w => !w.later).length
}
/** The runs that are running or parked now. */
export async function runningNow(): Promise<RunRow[]> {
  return RUNS.filter(r => r.state === 'running' || r.state === 'parked').map(rowOf)
}
/** What finished, and what changed without a person, since you last looked. */
export async function sinceYouLooked(): Promise<Since[]> {
  return SINCE
}
/** The month's money against the caps. */
export async function month(): Promise<Month> {
  return MONTH
}

// ——— Projects ———
export async function projects(): Promise<ProjectRow[]> {
  return ALL.map(rowOfProject)
}
/** One project, with its plan, its thread, its computers, what it was given and what it spent. */
export async function project(name: string): Promise<Project | undefined> {
  return ALL.find(p => p.name === name)
}
/** The briefs that are not handed over yet: kept for their person only (agreed 16 Nov). */
export async function drafts(): Promise<Draft[]> {
  return DRAFTS
}
/** What handing over needs: the talk with the three standing agents (a script, in the mock), the
    places a lone task can name, and what can start a standing order. */
export async function handingOver() {
  return { talk: TALK, places: PLACES, starts: ORDER_STARTS, renew: RENEW }
}

// ——— Standing orders ———
export async function orders(): Promise<Order[]> {
  return ORDERS
}

// ——— Teams ———
export async function teams(): Promise<TeamRow[]> {
  return TEAMS.map(({ name, field, sponsor, agents, skills, notes, waiting, state, stateNote }) => ({ name, field, sponsor, agents, skills, notes, waiting, state, stateNote }))
}
/** One team: its saved agents, skills and notes, what waits for its engineer, its week. */
export async function team(name: string): Promise<Team | undefined> {
  return TEAMS.find(t => t.name === name)
}

// ——— Runs ———
/** Every run, the newest first. */
export async function runs(): Promise<RunRow[]> {
  return [...RUNS].sort((a, b) => b.number - a.number).map(rowOf)
}
/** One run and its steps. */
export async function run(number: number): Promise<Run | undefined> {
  return RUNS.find(r => r.number === number)
}

// ——— Score ———
export async function score(): Promise<Score> {
  return SCORE
}

// ——— Space ———
export async function space(): Promise<Space> {
  return SPACE
}
