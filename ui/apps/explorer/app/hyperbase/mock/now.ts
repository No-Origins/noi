// The mock's own behaviour (15 Nov): what the pages show after a button was pressed in this visit.
// `Did` is everything pressed since the page was loaded; it lives in the browser's memory only
// (mock/visit.tsx), so nothing is stored and nothing is sent, and loading a page again starts the
// story over. The functions below lay what was pressed over what mock/read.ts answered. With a
// real server, a press is a call that Governance checks, the page reads again, and this file goes.
//
// Changed 16 Nov, to what was agreed that day ("What the Studio Mock Showed", "When a Touch Is
// Asked"): a run waits for one thing at a time, and a request that comes up to its person parks
// it as a question does · a paused run is parked, and says why · "three runs at once" counts only
// runs that are working, and a fourth waits its turn · a comment is answered at the lead's next
// step, or by the governance team within a minute · Stop pauses a project, Close is for good ·
// changing the goal stops the run that is going · drafts · a thing in a space is a small project.
import { may, sees } from './may'
import { FIRST_SET, NEXT_NUMBER, NEXT_RUN, PERSON, SPACE_PLACE } from './story'
import type { Brief, Draft, Order, Project, ProjectRow, ProjectState, Receipt, Role, Run, RunRow, RunState, Step, TalkLine, Task, Thing, ThreadLine, Waiting } from './types'

/** A run after a press: how it stands, why, and what it waits for on Today. "paused" is the mock's
    own word for "parked because someone paused it"; the pages say parked. */
export interface RunDid { state: RunState | 'paused'; note?: string; waits?: string }
export interface ProjectDid {
  state?: ProjectState
  /** Stopped, not only paused: its runs ended, and only its person starts it again. */
  stopped?: boolean
  goal?: string
  /** The goal was changed: done means and the plan are written again. */
  regoal?: boolean
  /** No run is going, and the next task is due to start: the mock offers "A minute later". */
  restart?: boolean
  said?: ThreadLine[]
  yours?: number
  /** What it was given was ended by hand. */
  ended?: boolean
  /** Tasks made from a comment. */
  tasks?: Omit<Task, 'n'>[]
  /** Tasks whose run was started in this visit. */
  started?: { name: string; run: number }[]
}
export interface Did {
  /** What was answered: a waiting thing's id, and what was said or chosen. */
  answers: Record<string, string>
  runs: Record<number, RunDid>
  /** How many of a run's later steps are shown: the mock's clock, moved by "Show the next step". */
  shown: Record<number, number>
  /** Runs that would be a fourth at work. They wait their turn, the first to wait first. */
  turn: number[]
  projects: Record<string, ProjectDid>
  /** Handed over in this visit. */
  made: Project[]
  madeRuns: Run[]
  madeOrders: Order[]
  orders: Record<string, Order['state']>
  renewed: Record<string, boolean>
  /** Changes undone, by their id. */
  undone: Record<string, boolean>
  teams: Record<string, { paused?: boolean; friday?: boolean; removed?: string[] }>
  things: Record<string, Thing['state']>
  asked: Thing[]
  /** Briefs written or changed in this visit, and not handed over. */
  drafts: Draft[]
  discarded: string[]
  /** Questions that came from a comment whose answer was "needs your decision". */
  decisions: Waiting[]
  /** The mock's own: a cap shown as reached. A project's, or the month's. */
  cap?: { project?: string; title?: string }
  /** The offer after the third same yes, put away with "Not now". */
  offerAway?: boolean
  /** An owner looked into the space, with a touch. */
  lookedIn?: boolean
}
export const NOTHING: Did = {
  answers: {}, runs: {}, shown: {}, turn: [], projects: {}, made: [], madeRuns: [], madeOrders: [], orders: {}, renewed: {}, undone: {}, teams: {}, things: {}, asked: [],
  drafts: [], discarded: [], decisions: [],
}

const ENDED: (RunState | 'paused')[] = ['done', 'could not', 'stopped', 'at a limit']
export const ended = (s: RunState | 'paused') => ENDED.includes(s)
export const PAUSED = `paused by ${PERSON}`
export const TURN = 'waits its turn: three runs are working'
/** Three runs at once (11 Nov). Agreed 16 Nov: it counts only runs that are working. */
export const AT_ONCE = 3

// ——— Runs ———
type Standing = Pick<Run, 'number' | 'project' | 'state' | 'stateNote'>
/** How a run stands now, and why. A run is running, parked, or ended: there is no fourth word. */
export function standing(r: Standing, did: Did, ignoreTurn = false): { state: RunState; note?: string } {
  const own = did.runs[r.number]
  const state = own?.state ?? r.state
  if (state !== 'paused' && ended(state)) return { state, note: own ? own.note : r.stateNote }
  if (state === 'paused' || did.projects[r.project]?.state === 'paused') return { state: 'parked', note: PAUSED }
  if (state === 'parked') return { state: 'parked', note: own ? own.note : r.stateNote }
  if (!ignoreTurn && did.turn.includes(r.number)) return { state: 'parked', note: TURN }
  return { state: 'running' }
}
/** One row of a list of runs. */
export const rowOfRun = (r: Run, of?: number): RunRow => ({
  number: r.number, project: r.project, projectTitle: r.projectTitle, task: r.task && { ...r.task, of: r.task.of ?? of }, order: r.order, agent: r.agent, team: r.team,
  state: r.state, stateNote: r.stateNote, minutes: r.minutes, cents: r.cents, marked: r.marked, started: r.started, startedBy: r.startedBy, space: r.space,
})
export function rowNow(r: RunRow, did: Did): RunRow {
  const { state, note } = standing(r, did)
  const shown = did.shown[r.number] ?? 0
  return { ...r, state, stateNote: note, minutes: r.minutes + shown, cents: r.cents + shown }
}
/** The steps that have not happened yet, as they will: some happen only after a yes, or a no. */
export const laterFor = (r: Run, did: Did): Step[] => (r.later ?? []).filter(s => !s.when || did.answers[s.when.id] === s.when.is)
const saidAs = (answer: string) => (answer === 'given' ? 'yes: given once' : answer)
/** One run as it stands: its state, and the steps that have happened so far. */
export function runNow(r: Run, did: Did): Run {
  const { state, note } = standing(r, did)
  const shown = did.shown[r.number] ?? 0
  const later = laterFor(r, did).slice(0, shown).map((s, i): Step => {
    const answer = s.answers ? did.answers[s.answers] : undefined
    return { ...s, n: r.steps.length + i + 1, text: answer ? `your answer arrived: “${saidAs(answer)}”` : s.text }
  })
  return { ...r, state, stateNote: note, steps: [...r.steps, ...later], minutes: r.minutes + shown, cents: r.cents + shown }
}
/** Whether the mock has another step to show for a run. */
export const hasNext = (r: Run, did: Did) => standing(r, did).state === 'running' && (did.shown[r.number] ?? 0) < laterFor(r, did).length
/** What a parked run waits for, on Today: the id of that thing. A run waits for one thing at a time. */
export function waitsFor(r: Pick<Run, 'number' | 'waitsFor'>, did: Did): string | undefined {
  const id = did.runs[r.number] ? did.runs[r.number].waits : r.waitsFor
  return id && did.answers[id] === undefined ? id : undefined
}
/** Whether a thing on Today has been asked yet: some come only when their run reaches the step. */
export const asked = (did: Did, id: string) => did.answers[id] !== undefined || Object.values(did.runs).some(r => r.waits === id)

/** Three at once counts only runs that are working. A run that would start as a fourth waits its
    turn, and goes on as soon as one of the three ends or parks. Called after every press. */
export function turns(before: Did, after: Did, live: RunRow[]): Did {
  const rows = (d: Did) => [...d.madeRuns.map(r => rowOfRun(r)), ...live]
  const wants = (d: Did) => rows(d).filter(r => standing(r, d, true).state === 'running').map(r => r.number)
  const want = wants(after)
  let turn = after.turn.filter(n => want.includes(n))
  let working = want.filter(n => !turn.includes(n))
  const was = new Set(wants(before).filter(n => !before.turn.includes(n)))
  // The ones that started with this press wait, if three are working already.
  const fresh = working.filter(n => !was.has(n))
  while (working.length > AT_ONCE && fresh.length) {
    const n = fresh.pop()!
    turn = [...turn, n]
    working = working.filter(x => x !== n)
  }
  while (working.length < AT_ONCE && turn.length) {
    working = [...working, turn[0]]
    turn = turn.slice(1)
  }
  const same = turn.length === after.turn.length && turn.every((n, i) => n === after.turn[i])
  return same ? after : { ...after, turn }
}

// ——— A space ———
/** How a thing stands: asked for, it is being built until its run ends; then it waits for a yes. */
export function thingNow(t: Thing, did: Did): Thing['state'] {
  const pressed = did.things[t.id]
  if (pressed) return pressed
  const run = did.madeRuns.find(r => r.project === t.project)
  return run && standing(run, did).state === 'done' ? 'built' : t.state
}

// ——— Today ———
/** What waits: for whoever is looking (`mine`), and what they can see waiting for someone else,
    under whom it waits for (agreed 16 Nov). Nothing waits for a viewer. */
export interface Waits { mine: Waiting[]; others: { whom: string; items: Waiting[] }[] }
const whom = (w: Waiting) =>
  w.needs === 'land' || w.needs === 'limits' ? 'an owner' : w.needs === 'tend' ? `the ${w.team} team’s engineer` : w.needs === 'accept' ? 'the space’s person' : `${w.person ?? PERSON}, whose work it is`

export function waitingNow(items: Waiting[], did: Did, role: Role, live: RunRow[], things: Thing[]): Waits {
  const rows = [...did.madeRuns.map(r => rowOfRun(r)), ...live]
  const base = [...items, ...did.decisions].filter(w => {
    if (did.answers[w.id] !== undefined) return false
    if (w.later && !asked(did, w.id)) return false
    // A run that ended asks nothing more: stopped, taken over, or stopped with its project.
    const row = w.kind !== 'land' && w.run ? rows.find(r => r.number === w.run) : undefined
    if (row && ended(standing(row, did).state)) return false
    if (w.project && did.projects[w.project]?.state === 'closed') return false
    if (w.kind === 'note' && w.team && did.teams[w.team]?.friday) return false
    return true
  })
  // A cap that was reached is at the top: a project's waits for its person, the month's for an owner.
  const cap: Waiting[] = did.cap
    ? [did.cap.project
        ? { id: 'cap', kind: 'cap', needs: 'steer', project: did.cap.project, projectTitle: did.cap.title, minutes: 0, person: PERSON, text: 'Its cap is reached: $10 of $10. Nothing new starts in this project.' }
        : { id: 'cap', kind: 'cap', needs: 'limits', minutes: 0, text: 'The month’s cap for tokens is reached: $40 of $40. Nothing new starts.' }]
    : []
  // A run that someone paused is parked, and waits for its person to let it go on.
  // A run waits for one thing at a time: one that already waits for an answer is listed once.
  const waitsAlready = (n: number) => base.some(w => w.run === n && (w.kind === 'question' || w.kind === 'request'))
  const paused: Waiting[] = rows.filter(r => standing(r, did).note === PAUSED && !waitsAlready(r.number)).map(r => ({
    id: `paused-${r.number}`, kind: 'paused', needs: 'steer', run: r.number, project: r.project, projectTitle: r.projectTitle, minutes: 0, person: PERSON, space: r.space,
    text: did.projects[r.project]?.state === 'paused' ? `Its project is paused, by ${PERSON}.` : `Paused by ${PERSON}.`,
  }))
  // In a space, a thing that is built waits for its person's yes. "Accept" takes the place of "Land".
  const built: Waiting[] = [...things, ...did.asked].filter(t => thingNow(t, did) === 'built').map(t => ({
    id: `accept-${t.id}`, kind: 'accept', needs: 'accept', project: t.project, projectTitle: t.name, minutes: 1, space: SPACE_PLACE,
    text: 'Built, and checked against its shape.', detail: 'It is drawn on your canvas already. Accept it, or send it back with a word.',
  }))
  const all = [...cap, ...[...base, ...paused, ...built].sort((a, b) => b.minutes - a.minutes)].filter(w => sees(role, w.space))
  const mine = role === 'viewer' ? [] : all.filter(w => may(role, w.needs, w.team))
  // A viewer sees it all. A member also sees its own work that waits for an owner to land it.
  const rest = all.filter(w => !mine.includes(w) && (role === 'viewer' || (role === 'member' && w.kind === 'land')))
  const others: Waits['others'] = []
  for (const w of rest) {
    const group = others.find(o => o.whom === whom(w))
    if (group) group.items.push(w)
    else others.push({ whom: whom(w), items: [w] })
  }
  return { mine, others }
}

// ——— Projects ———
const RECEIPTS: Receipt[] = ['applied', 'made a task', 'not applied', 'needs your decision']
/** The answer a comment gets. In the mock they come in turn, so all four can be seen. */
export const receiptFor = (said: number): Receipt => RECEIPTS[said % RECEIPTS.length]

const AGAIN = 'the governance team'
export function projectNow(p: Project, did: Did, waiting: Waiting[] = []): Project {
  const d = did.projects[p.name] ?? {}
  const landed = did.answers[`land-${p.title}`] === 'landed'
  let state: ProjectState = landed ? 'done' : (d.state ?? p.state)
  // A thing: built, it waits for its person's yes; accepted or shared, it is done.
  if (p.kind === 'thing') {
    const t = p.thing ? did.things[p.thing] : undefined
    const run = did.madeRuns.find(r => r.project === p.name)
    if (t === 'accepted' || t === 'shared') state = 'done'
    else if (t === 'sent back') state = d.state ?? 'working'
    else if (run && standing(run, did).state === 'done') state = 'waiting for you'
  }
  // Changing the goal: finished tasks stay finished, and the rest of the plan is written again.
  const kept = p.plan.filter(t => t.state === 'done' || t.state === 'could not')
  const written: Task[] = d.regoal
    ? [
        ...kept,
        { n: kept.length + 1, name: 'read what the new goal changes', state: 'to do' },
        { n: kept.length + 2, name: 'make the change', state: 'to do' },
        { n: kept.length + 3, name: 'check each done-means line', state: 'to do' },
      ]
    : p.plan
  // A task follows its run: working while it runs, parked while it is parked, to do again if it
  // was stopped. A task whose run was stopped, and that started again in this visit, has a new run.
  const withRun = (task: Task): Task => {
    if (!task.run || task.state === 'done' || task.state === 'could not') return task
    const own = did.runs[task.run]?.state
    if (own === 'done') return { ...task, state: 'done', note: undefined }
    if (own === 'stopped') return { ...task, state: 'to do', who: undefined, note: 'its run was stopped' }
    if (task.state !== 'working' && task.state !== 'parked') return task
    const now = standing({ number: task.run, project: p.name, state: task.state === 'parked' ? 'parked' : 'running', stateNote: task.note }, did)
    return now.state === 'running' ? { ...task, state: 'working', note: task.state === 'parked' ? undefined : task.note } : { ...task, state: 'parked', note: now.note }
  }
  const plan = [...written, ...(d.tasks ?? []).map((t, i): Task => ({ ...t, n: written.length + i + 1 }))].map((t): Task => {
    if (d.yours === t.n) return { ...t, state: 'yours', who: 'you', note: 'the task is yours, and so is its branch' }
    const first = withRun(t)
    const started = d.started?.find(s => s.name === t.name)
    return started && first.state === 'to do' ? withRun({ ...first, run: started.run, state: 'working', who: 'the lead', note: '1 min' }) : first
  })
  const doneMeans = d.regoal
    ? [
        { text: 'the new goal holds (a look at the page it names)', done: false, wrote: AGAIN },
        { text: 'the fit checks pass', done: false, wrote: AGAIN },
      ]
    : p.doneMeans
  const said = d.said ?? []
  const given = p.given.map(g => (g.id === 'docs' && did.answers['request-docs'] === 'given' ? { ...g, times: (g.times ?? 1) + 1 } : g))
  // A line that asks its person something shows once it is asked, and "waits" until it is
  // answered, or until the run that asked has ended.
  const later = new Set(waiting.filter(w => w.later).map(w => w.id))
  const settled = (id: string) => {
    const run = waiting.find(w => w.id === id)?.run
    return did.answers[id] !== undefined || (run !== undefined && ended(did.runs[run]?.state ?? 'running'))
  }
  const thread = [
    ...p.thread.filter(l => !l.waiting || !later.has(l.waiting) || asked(did, l.waiting)).map(l => (l.waiting && settled(l.waiting) ? { ...l, waiting: undefined } : l)),
    ...said.map(l => (l.waiting && settled(l.waiting) ? { ...l, waiting: undefined } : l)),
  ]
  // A computer is cleared when the work it was opened for ends.
  const open = (run?: number) => !run || !ended(did.runs[run]?.state ?? 'running')
  const startedBoxes = (d.started ?? []).filter(s => open(s.run)).map(s => ({ name: 'the task’s', marked: false, inside: [{ who: 'the lead', does: 'holds the pen' as const }], run: s.run }))
  const capped = did.cap?.project === p.name
  return {
    ...p,
    state,
    stopped: d.stopped ?? p.stopped,
    note:
      d.state === 'closed' ? `Closed by ${PERSON}. That is for good.`
      : d.stopped ? `Stopped by ${PERSON}. Its runs ended at once. Only its person starts it again.`
      : d.state === 'paused' ? (d.ended ? `What it was given is ended, by ${PERSON}. It has no copy of the code and no branch now, so it is paused. “Go on” asks the governance team for them again.` : `Paused by ${PERSON}. Its runs finish their step and park.`)
      : d.state === 'working' ? undefined
      : p.note,
    goal: d.goal ?? p.goal,
    doneMeans,
    plan,
    thread,
    given: d.ended ? [] : given,
    spent: capped ? p.cap : p.spent,
    pull: p.pull && landed ? { ...p.pull, state: 'landed' } : p.pull,
    computers: state === 'closed' || state === 'done' ? [] : [...p.computers.filter(c => open(c.run ?? c.opened) && !(d.yours !== undefined && c.run)), ...startedBoxes],
  }
}
export function projectRowNow(r: ProjectRow, did: Did): ProjectRow {
  const d = did.projects[r.name] ?? {}
  const landed = did.answers[`land-${r.title}`] === 'landed'
  let state: ProjectState = landed ? 'done' : (d.state ?? r.state)
  if (r.kind === 'thing') {
    const t = r.thing ? did.things[r.thing] : undefined
    const run = did.madeRuns.find(m => m.project === r.name)
    if (t === 'accepted' || t === 'shared') state = 'done'
    else if (t === 'sent back') state = 'working'
    else if (run && standing(run, did).state === 'done') state = 'waiting for you'
  }
  return { ...r, state, goal: d.goal ?? r.goal, spent: did.cap?.project === r.name ? r.cap : r.spent }
}
export const rowOfProject = (p: Project): ProjectRow => ({
  name: p.name, title: p.title, kind: p.kind, state: p.state, person: p.person, goal: p.goal, spent: p.spent, cap: p.cap, handedOver: p.handedOver, space: p.space, thing: p.thing,
  done: p.doneMeans.filter(d => d.done).length, of: p.doneMeans.length,
})

// ——— Handing over ———
const SMALL = new Set(['the', 'a', 'an', 'on', 'of', 'to', 'in', 'for', 'and', 'by', 'or', 'at', 'is', 'it'])
/** Words as a name's words: small letters and numbers, joined by hyphens. */
export const asWords = (text: string, most = 4) => text.toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').split(/[ -]+/).filter(Boolean).slice(0, most).join('-')
/** A name for what is handed over: two words of its first line, and its number. Its person can
    change the words before the press, and not after: the name is its place (agreed 16 Nov). */
export function nameOf(line: string, number = NEXT_NUMBER, words?: string): { name: string; title: string } {
  const own = words ? asWords(words) : ''
  const title = own || line.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(w => w && !SMALL.has(w)).slice(0, 2).join('-') || 'project'
  return { name: `${title}-${number}`, title }
}
/** A project as it is the moment after the press: handed over, and nothing given yet. */
export function handedOver(brief: Brief, kind: Project['kind'], number: number, words?: string, talk?: TalkLine[]): Project {
  const { name, title } = nameOf(brief.why, number, words)
  const lines = brief.doneMeans.split('\n').map(l => l.trim()).filter(Boolean)
  const small = kind !== 'project'
  return {
    name, title, kind, state: 'handed over', person: PERSON, goal: brief.why,
    doneMeans: lines.map(text => ({ text: text.replace(/\.$/, ''), done: false })),
    plan: [], thread: [], computers: [], given: [],
    spent: 0, cap: small ? 1 : 10, daysLeft: small ? (kind === 'thing' ? 3 : 1) : 14, days: small ? (kind === 'thing' ? 3 : 1) : 14,
    handedOver: 'now', brief: kind === 'project' ? brief : undefined, talk: talk?.length ? talk : undefined,
  }
}
/** A thing asked for in a space: a small project whose place is the space. One line is enough. */
export function askedFor(line: string, name: string, thing: string): Project {
  return { ...handedOver({ why: line, inOut: '', doneMeans: '', where: '', forWhom: 'you' }, 'thing', 0), name, title: line, space: SPACE_PLACE, thing }
}
/** The first steps of a run that starts in this visit. */
function firstRun(p: Pick<Project, 'name' | 'title' | 'kind' | 'space'>, task: { n: number; name: string }, number: number, startedBy: string): Run {
  const thing = p.kind === 'thing'
  const computer = { name: 'the task’s', marked: false, inside: [{ who: 'the lead', does: 'holds the pen' as const }], run: number }
  return {
    number, project: p.name, projectTitle: p.title, task, agent: 'the lead', team: 'build', version: 4,
    state: 'running', minutes: 1, cents: 1, marked: false, model: 'deepseek-flash', modelVersion: 'V4.1-Flash-1017',
    started: 'now', startedBy, passEnds: 14, branch: thing ? undefined : `hyp/${p.name}`, space: p.space,
    steps: [
      { n: 1, kind: 'model', text: 'asked the model', facts: ['1,180 new tokens'], more: ['The pack: its job, the task card, what the project was given, the notes that match, its tools.'] },
      thing
        ? { n: 2, kind: 'box', text: 'looked for parts that exist', facts: ['in the box'], more: ['Parts that exist come first. A piece of its own is written only when no part can do it.'] }
        : { n: 2, kind: 'box', text: 'read the code the task names', facts: ['in the box'], more: ['Inside the box nobody is asked.'] },
    ],
    later: [
      thing
        ? { n: 3, kind: 'box', text: 'wrote its description, and checked it against its shape', facts: ['in the box', 'it holds'], more: ['A thing put together from parts that exist is only a description: no new code. The app draws it.'] }
        : { n: 3, kind: 'box', text: 'ran the tests', facts: ['in the box', 'all passed'], more: ['The tests as they stand, before any change.'] },
      { n: 4, kind: 'end', text: 'ended with its hand-back', facts: ['“done” is a claim'], more: ['Its hand-back: what it found, the evidence, what it assumed, what it did not check.', 'Hyperbase runs the checks itself, in a clean computer, before anyone is told.'] },
    ],
    handBack: thing
      ? { found: 'The thing, put together from parts that exist.', evidence: 'It holds its shape.', assumed: 'Nothing.', notChecked: 'How it looks on your canvas: your own eye.' }
      : { found: 'What the task names, and where a change would go.', evidence: 'The files read, named.', assumed: 'Nothing.', notChecked: 'Nothing was changed.' },
    checks: thing ? [{ name: 'its shape', ok: true }] : [{ name: 'the types', ok: true }, { name: 'the tests', ok: true }, { name: 'the fit checks', ok: true }],
    computer: {
      ...computer,
      files: {
        files: [{ path: 'ui/apps/explorer', depth: 0, folder: true }, { path: 'app', depth: 1, folder: true }, { path: 'test', depth: 1, folder: true }],
        change: 'Nothing is changed yet.',
        running: ['nothing'],
      },
    },
  }
}
/** The run that starts the next task of a project that is going again. */
export const nextRun = (p: Project, task: Task, number: number): Run => firstRun(p, { n: task.n, name: task.name }, number, 'the plan: the project is going again')
/** The same project a minute later: the governance team wrote the charter and gave from its set,
    and the first task started. For a lone task, and for a thing, it also wrote done means from the
    one line (agreed 16 Nov). Returns the project and its first run. */
export function aMinuteLater(p: Project, runNumber = NEXT_RUN): { project: Project; run: Run } {
  const lone = p.kind === 'lone task'
  const thing = p.kind === 'thing'
  const line = p.goal.replace(/\.$/, '')
  const plan: Task[] = thing
    ? [{ n: 1, name: 'put it together from parts that exist', state: 'working', who: 'the lead', run: runNumber, note: '1 min' }]
    : lone
      ? [{ n: 1, name: line.toLowerCase(), state: 'working', who: 'the lead', run: runNumber, note: '1 min' }]
      : [
          { n: 1, name: 'read the code the brief names', state: 'working', who: 'the lead', run: runNumber, note: '1 min' },
          { n: 2, name: 'make the change', state: 'to do' },
          { n: 3, name: 'check each done-means line', state: 'to do' },
        ]
  const wrote = 'the governance team'
  const doneMeans = thing
    ? [{ text: `it does what your line says: “${line}” (a test)`, done: false, wrote }, { text: 'it holds its shape, and is drawn from its description (a look at Space)', done: false, wrote }]
    : lone
      ? [{ text: `your line holds: “${line}” (a look at the page it names)`, done: false, wrote }, { text: 'the app’s checks pass', done: false, wrote }]
      : p.doneMeans
  const run = firstRun(p, { n: 1, name: plan[0].name }, runNumber, thing ? 'your press: you asked for it' : 'your press: you handed it over')
  const project: Project = {
    ...p,
    state: 'working',
    doneMeans,
    plan,
    thread: [
      thing
        ? { from: 'the governance team', kind: 'message', text: 'read your line and wrote the rest: done means, and a plan' }
        : lone
          ? { from: 'the governance team', kind: 'message', text: 'read your line, wrote two done-means lines from it, and gave from its set' }
          : { from: 'the governance team', kind: 'message', text: 'read the brief, wrote the charter, and gave from its set' },
      { from: 'the lead', kind: 'message', text: thing ? 'started with the parts that exist' : lone ? 'started the task' : `wrote a plan of ${plan.length} tasks, and started the first` },
    ],
    computers: [{ name: 'the task’s', marked: false, inside: [{ who: 'the lead', does: 'holds the pen' }], run: runNumber }],
    given: thing
      ? [{ id: 'plan', from: 'your space’s plan', what: ['building from No Origins’ parts', 'your space, and nowhere else'], days: p.days }]
      : [{ id: 'set', from: 'the governance team’s set', what: lone ? ['a copy of the code', 'one branch'] : ['a copy of the code', 'one branch', 'proposing in noi.eio'], days: p.days }],
    spent: 0.01,
  }
  return { project, run }
}
export const FIRST_SET_LINES = FIRST_SET
