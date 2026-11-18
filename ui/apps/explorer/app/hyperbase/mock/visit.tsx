'use client'
// One visit to the mock (15 Nov): who you are looking as, and what you pressed since the page was
// loaded. Kept in the browser's memory while you move between Studio's pages, and nowhere else:
// nothing is stored, nothing is sent, and loading a page again starts the story over.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Name } from '../../../lib/hosts'
import { NOTHING, aMinuteLater, laterFor, nextRun, receiptFor, turns, waitingNow, type Did, type ProjectDid, type Waits } from './now'
import { CAP_EXAMPLE, NEXT_NUMBER, NEXT_RUN, PERSON } from './story'
import type { Draft, Order, Project, Role, Run, RunRow, Task, Thing, ThreadLine, Waiting } from './types'

type Change = (did: Did) => Did
interface VisitValue {
  role: Role
  setRole: (role: Role) => void
  did: Did
  press: (change: Change) => void
  /** Each system's own address, for the links into Governance and Mero. */
  at?: Record<Name, string>
  /** The runs that are running or parked in the story, and the things in the space: what the
      count of what waits, and "three at once", are worked out from. */
  live: RunRow[]
  things: Thing[]
}
const Ctx = createContext<VisitValue>({ role: 'owner', setRole: () => {}, did: NOTHING, press: () => {}, live: [], things: [] })
const ROLES: Role[] = ['viewer', 'member', 'engineer', 'owner', 'person']

export function Visit({ at, live, things, children }: { at: Record<Name, string>; live: RunRow[]; things: Thing[]; children: ReactNode }) {
  const [role, setRole] = useState<Role>('owner')
  const [did, setDid] = useState<Did>(NOTHING)
  // ?as=viewer opens the mock looking as that role, and ?cap=project (or month) with a cap shown
  // as reached, so a picture of each can be linked to.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const as = query.get('as') as Role | null
    if (as && ROLES.includes(as)) setRole(as)
    const cap = query.get('cap')
    if (cap === 'project' || cap === 'month') setDid(d => pressed.cap(cap)(d))
  }, [])
  // After every press: three runs at once counts only runs that are working.
  const press = useCallback((change: Change) => setDid(d => turns(d, change(d), live)), [live])
  const value = useMemo(() => ({ role, setRole, did, press, at, live, things }), [role, did, press, at, live, things])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useVisit = () => useContext(Ctx)
/** What waits now, for whoever is looking, and what they see waiting for someone else. */
export function useWaiting(items: Waiting[]): Waits {
  const { did, role, live, things } = useVisit()
  return waitingNow(items, did, role, live, things)
}

// ——— What each button does to the visit. Each is one call to Hyperbase's server, later. ———
const project = (did: Did, name: string, change: Partial<ProjectDid>): Did => ({ ...did, projects: { ...did.projects, [name]: { ...did.projects[name], ...change } } })
const say = (did: Did, name: string, ...lines: ThreadLine[]): Did => project(did, name, { said: [...(did.projects[name]?.said ?? []), ...lines] })
const you = (text: string, rest: Partial<ThreadLine> = {}): ThreadLine => ({ from: 'you', kind: 'change', text, person: true, ...rest })
/** An answer wakes the run that waited for it: it goes on, and its next step shows the answer. */
const wake = (did: Did, run: number): Did => ({ ...did, runs: { ...did.runs, [run]: { state: 'running' } }, shown: { ...did.shown, [run]: (did.shown[run] ?? 0) + 1 } })
const stopRuns = (did: Did, runs: number[], note: string): Did => ({ ...did, runs: { ...did.runs, ...Object.fromEntries(runs.map(n => [n, { state: 'stopped' as const, note }])) } })
/** Comments with no answer yet get one: applied, not applied, made a task, or needs your decision
    (10 Nov). The lead answers at its next step; with no run going, the governance team does. */
function answerComments(did: Did, name: string, title: string): Did {
  const said = did.projects[name]?.said ?? []
  if (!said.some(l => l.kind === 'comment' && !l.reply)) return did
  let next = did
  let count = said.filter(l => l.kind === 'comment' && l.reply).length
  const lines: ThreadLine[] = []
  for (const l of said) {
    if (l.kind !== 'comment' || l.reply) { lines.push(l); continue }
    const receipt = receiptFor(count++)
    lines.push({ ...l, reply: receipt })
    if (receipt === 'made a task') next = project(next, name, { tasks: [...(next.projects[name]?.tasks ?? []), { name: l.text.length > 48 ? l.text.slice(0, 48) + '…' : l.text, state: 'to do', note: 'from your comment' }] })
    if (receipt === 'needs your decision') {
      const id = `decision-${name}-${count}`
      const text = `Should done means change, as your comment asks? You wrote: ${l.text}`
      lines.push({ from: l.answers ?? 'the lead', to: 'you', kind: 'question', text, waiting: id })
      next = { ...next, decisions: [...next.decisions, { id, kind: 'question', needs: 'steer', project: name, projectTitle: title, minutes: 0, text, person: PERSON, detail: 'It came from your comment. No run waits for it.' }] }
    }
  }
  return project(next, name, { said: lines })
}

export const pressed = {
  /** Answer a question: it leaves Today, and the run that was parked for it goes on. */
  answer: (w: Waiting, text: string): Change => did => {
    let next: Did = { ...did, answers: { ...did.answers, [w.id]: text } }
    if (w.run) next = wake(next, w.run)
    if (w.project) next = say(next, w.project, { from: 'you', to: 'the lead', kind: 'answer', text, person: true })
    return next
  },
  /** Give once, say no, land, approve, send back, release or remove: the thing leaves Today. A yes
      or a no to a request wakes the run that was parked for it. */
  settle: (w: Pick<Waiting, 'id' | 'project' | 'kind' | 'run'>, how: string): Change => did => {
    let next: Did = { ...did, answers: { ...did.answers, [w.id]: how } }
    if (w.kind === 'request' && w.run) next = wake(next, w.run)
    if (w.project && (how === 'given' || how === 'no')) next = say(next, w.project, { from: 'you', to: 'the lead', kind: 'answer', text: 'reading docs.rs', reply: how === 'given' ? 'given, once' : 'no', person: true })
    if (w.project && how === 'landed') next = say(next, w.project, you('landed the work on main, with a touch'))
    return next
  },
  /** One touch for everything that was ticked (agreed 16 Nov): the touch names every item. */
  touch: (items: { w: Waiting; how: string }[]): Change => did => items.reduce((d, i) => pressed.settle(i.w, i.how)(d), did),
  /** Pause a run: it is parked, and says why. Go on, or stop it. */
  run: (number: number, state: 'paused' | 'running' | 'stopped'): Change => did => ({
    ...did,
    runs: { ...did.runs, [number]: state === 'stopped' ? { state, note: `by ${PERSON}: it reported where it got to` } : state === 'running' ? { state, waits: did.runs[number]?.waits } : { state } },
  }),
  /** The mock's clock: one more step of a run happens. A step that asks its person something
      parks the run; after the last step, the run has ended. Its project's comments are answered. */
  nextStep: (r: Run): Change => did => {
    const later = laterFor(r, did)
    const shown = (did.shown[r.number] ?? 0) + 1
    const step = later[shown - 1]
    const state = shown >= later.length ? { state: 'done' as const } : step?.asks ? { state: 'parked' as const, note: step.kind === 'ask' ? 'waits for your answer' : 'waits for your yes or no', waits: step.asks } : did.runs[r.number]
    return answerComments({ ...did, shown: { ...did.shown, [r.number]: shown }, runs: state ? { ...did.runs, [r.number]: state } : did.runs }, r.project, r.projectTitle)
  },
  /** Pause a project: its runs finish their step and park. */
  pause: (name: string): Change => did => say(project(did, name, { state: 'paused', stopped: false }), name, you('paused the project: its runs finish their step and park')),
  /** Go on: after a pause, or after what it was given was ended; or start again after a stop. */
  goOn: (name: string): Change => did => {
    const d = did.projects[name] ?? {}
    const lines = [
      you(d.stopped || !d.state ? 'started the project again' : 'let the project go on'),
      ...(d.ended ? [{ from: 'the governance team', kind: 'message' as const, text: 'was asked again for what the project was given, and gave it from its set' }] : []),
    ]
    return say(project(did, name, { state: 'working', stopped: false, ended: false, restart: d.stopped || !d.state ? true : d.restart }), name, ...lines)
  },
  /** Stop a project: its runs end at once. It is paused, and says who stopped it. */
  stop: (name: string, runs: number[]): Change => did =>
    say(project(stopRuns(did, runs, `with its project, by ${PERSON}`), name, { state: 'paused', stopped: true, yours: undefined }), name, you('stopped the project: its runs ended at once')),
  /** Close a paused project. That one is for good. */
  close: (name: string, runs: number[]): Change => did => say(project(stopRuns(did, runs, `with its project, by ${PERSON}`), name, { state: 'closed', stopped: false }), name, you('closed the project, for good')),
  /** Change the goal: one press. The run that is going stops and says where it got to; the
      governance team writes done means and the plan again; what was given is checked again. */
  goal: (name: string, goal: string, run?: number): Change => did =>
    say(
      project(run ? stopRuns(did, [run], 'the goal changed: it reported where it got to') : did, name, { goal, regoal: true, restart: true, yours: undefined, started: [] }),
      name,
      you(`changed the goal: “${goal}”`),
      ...(run ? [{ from: 'the lead', kind: 'hand-back' as const, text: `run ${run} stopped, and said where it got to` }] : []),
      { from: 'the governance team', kind: 'message', text: 'wrote done means and the plan again: finished tasks stay finished. It checked what was given: it still holds' },
    ),
  /** The mock's clock: a minute passes, and the next task of a project that is going again starts. */
  startNext: (p: Project, task: Task): Change => did => {
    const run = nextRun(p, task, NEXT_RUN + did.madeRuns.length)
    const d = did.projects[p.name] ?? {}
    return project({ ...did, madeRuns: [run, ...did.madeRuns] }, p.name, { restart: false, started: [...(d.started ?? []), { name: task.name, run: run.number }] })
  },
  /** A comment. Its answer comes at the lead's next step, or from the governance team in a minute. */
  comment: (name: string, text: string, going: boolean): Change => did => say(did, name, { from: 'you', kind: 'comment', text, person: true, answers: going ? 'the lead' : 'the governance team' }),
  /** The mock's clock: a minute passes, and the comments that wait are answered. */
  answerComments: (name: string, title: string): Change => did => answerComments(did, name, title),
  takeOver: (name: string, task: number, run?: number): Change => did =>
    say(project(run ? stopRuns(did, [run], `task ${task} was taken over by ${PERSON}`) : did, name, { yours: task }), name, you(`took over task ${task}: it is yours, and so is its branch`)),
  handBack: (name: string, task: number, text: string): Change => did => say(project(did, name, { yours: undefined, restart: true }), name, { from: 'you', to: 'the lead', kind: 'comment', text: `task ${task} is handed back: ${text}`, reply: 'applied', person: true }),
  /** End what a project was given. It is paused, and says what is missing. */
  endGiving: (name: string): Change => did => say(project(did, name, { ended: true, state: 'paused', stopped: false }), name, you('ended what the project was given')),
  /** One press: the project is handed over. Its draft, if it had one, is no longer a draft. */
  handOver: (p: Project, draft?: string): Change => did => ({ ...did, made: [p, ...did.made], drafts: did.drafts.filter(d => d.id !== draft), discarded: draft ? [...did.discarded, draft] : did.discarded }),
  /** A brief that is not handed over is kept as a draft, for its person only. */
  draft: (draft: Draft): Change => did => ({ ...did, drafts: [draft, ...did.drafts.filter(d => d.id !== draft.id)], discarded: did.discarded.filter(id => id !== draft.id) }),
  discard: (id: string): Change => did => ({ ...did, drafts: did.drafts.filter(d => d.id !== id), discarded: [...did.discarded, id] }),
  /** The mock's clock: a minute passes after the press. */
  aMinuteLater: (name: string): Change => did => {
    const p = did.made.find(m => m.name === name)
    if (!p || p.state !== 'handed over') return did
    const { project: ready, run } = aMinuteLater(p, NEXT_RUN + did.madeRuns.length)
    return { ...did, made: did.made.map(m => (m.name === name ? ready : m)), madeRuns: [run, ...did.madeRuns] }
  },
  order: (o: Order): Change => did => ({ ...did, madeOrders: [o, ...did.madeOrders] }),
  orderState: (name: string, state: Order['state']): Change => did => ({ ...did, orders: { ...did.orders, [name]: state } }),
  renew: (name: string): Change => did => ({ ...did, renewed: { ...did.renewed, [name]: true } }),
  undo: (change: string, undone = true): Change => did => ({ ...did, undone: { ...did.undone, [change]: undone } }),
  team: (name: string, change: Partial<Did['teams'][string]>): Change => did => ({ ...did, teams: { ...did.teams, [name]: { ...did.teams[name], ...change } } }),
  removeNote: (team: string, id: string): Change => did => ({ ...did, teams: { ...did.teams, [team]: { ...did.teams[team], removed: [...(did.teams[team]?.removed ?? []), id] } } }),
  /** In a space: accept a thing, send it back, or share it. Its small project says so. */
  thing: (id: string, state: Thing['state'], name?: string): Change => did => {
    const next: Did = { ...did, things: { ...did.things, [id]: state } }
    const words = state === 'accepted' ? 'accepted it' : state === 'sent back' ? 'sent it back' : state === 'shared' ? 'shared it: it is a meron now, open to read' : undefined
    return name && words ? say(next, name, you(words)) : next
  },
  /** Ask for a thing: a small project whose place is the space. */
  ask: (thing: Thing, p: Project): Change => did => ({ ...did, asked: [...did.asked, thing], made: [p, ...did.made] }),
  /** The mock's own: show a cap as reached, a project's or the month's; or put it back. */
  cap: (which?: 'project' | 'month'): Change => did => ({ ...did, cap: which === 'project' ? CAP_EXAMPLE : which === 'month' ? {} : undefined }),
  /** "Not now" puts the offer away, until three more of the same yes. */
  offerAway: (): Change => did => ({ ...did, offerAway: true }),
  /** An owner looks into a space: with a touch, recorded, and its person is shown it. */
  lookIn: (): Change => did => ({ ...did, lookedIn: true }),
}
/** The number the next thing handed over in this visit gets. A thing in a space takes none. */
export const nextNumber = (did: Did) => NEXT_NUMBER + did.made.filter(p => p.kind !== 'thing').length + did.madeOrders.length
