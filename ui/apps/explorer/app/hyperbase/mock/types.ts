// The shapes of what Studio's pages read (15 Nov, the mock). Each is what one page needs from
// Hyperbase's server, in the words of the agreed page "Hyperbase Studio" (12 Nov). When the server
// exists these shapes are what it answers with; until then mock/story.ts fills them with made-up data.

/** The four roles for people (agreed 12 Nov; the first three are working names), and a fifth
    position, the space's person (agreed 16 Nov): in their own space they ask, steer, accept, send
    back and share. */
export type Role = 'viewer' | 'member' | 'engineer' | 'owner' | 'person'

/** What a button needs, from the grid "who may do what" (agreed 12 Nov). Each becomes one or more
    of Hyperbase's verbs, checked by Governance. */
export type Verb =
  | 'give' // hand over a project, give a task, set a standing order
  | 'steer' // comment, answer, pause, change the goal, take over, start again, give once
  | 'stop' // stop a run or a project
  | 'tend' // a team's notes, trials, undo, its weekly page; approve what its dial sends to a person
  | 'limits' // write a set, a guideline, a dial, a cap: on Governance's pages
  | 'land' // land the work on main, with a touch
  | 'accept' // in a space: ask, accept, send back, share. The space's person only (16 Nov)

// ——— The words on the pages (agreed 12 Nov) ———
export type ProjectState = 'draft' | 'handed over' | 'working' | 'waiting for you' | 'paused' | 'done' | 'closed'
export type TaskState = 'to do' | 'working' | 'parked' | 'checking' | 'done' | 'could not'
/** A run is running, parked, or ended in one of four ways. There is no fourth word (agreed 16
    Nov): a paused run is parked, and says why. */
export type RunState = 'running' | 'parked' | 'done' | 'could not' | 'stopped' | 'at a limit'
/** Your comment gets one of four answers (agreed 10 Nov). */
export type Receipt = 'applied' | 'not applied' | 'made a task' | 'needs your decision'

// ——— A project, on one page ———
export interface DoneLine {
  text: string
  done: boolean
  /** Who ticked it: never the doer. */
  by?: 'a program' | 'the checker'
  /** Who wrote the line, when it was not the person: a lone task's lines (16 Nov). */
  wrote?: string
}
export interface Task {
  n: number
  name: string
  state: TaskState | 'yours'
  who?: string
  run?: number
  note?: string
}
export interface ThreadLine {
  from: string
  to?: string
  /** A card and its hand-back, a request and its answer, a message, a question, a person's comment. */
  kind: 'card' | 'hand-back' | 'request' | 'answer' | 'message' | 'question' | 'comment' | 'change'
  text: string
  /** The answer to a request, or the receipt of a comment. */
  reply?: string
  person?: boolean
  /** The id of what waits on Today for this line: it shows "waits for you" until it is answered. */
  waiting?: string
  /** Who answers a comment that has no answer yet (16 Nov): the lead at its next step, or the
      governance team within a minute. */
  answers?: string
}
/** One line of the talk had before a project was handed over. */
export interface TalkLine {
  from: string
  text: string
  you?: boolean
}
export interface Computer {
  name: string
  marked: boolean
  /** Who is in it. One holds the pen; the others look, or read the web. */
  inside: { who: string; does: 'holds the pen' | 'looks' | 'reads the web' }[]
  run?: number
  /** A helper's computer: the run it was opened for. It is cleared when that run ends. */
  opened?: number
  cleared?: boolean
}
export interface Giving {
  id: string
  from: string
  what: string[]
  days?: number
  once?: boolean
  times?: number
}
export interface Brief {
  why: string
  inOut: string
  doneMeans: string
  where: string
  forWhom: string
  /** What the shaper adds: its open questions, and a guess at the size. */
  open?: string
  size?: string
}
export interface Project {
  /** Its place: noi.hyp.projects.<name>. The name ends in its number. */
  name: string
  title: string
  /** A thing asked for in a space is a small project too (agreed 16 Nov): its place is the space. */
  kind: 'project' | 'lone task' | 'thing'
  /** For a thing: the space it is in, and which thing on the canvas it is. */
  space?: string
  thing?: string
  state: ProjectState
  person: string
  goal: string
  doneMeans: DoneLine[]
  plan: Task[]
  thread: ThreadLine[]
  computers: Computer[]
  given: Giving[]
  /** Dollars spent, of the project's cap. */
  spent: number
  cap: number
  daysLeft: number
  days: number
  pull?: { number: number; title: string; state: 'open' | 'landed'; change: string }
  handedOver: string
  brief?: Brief
  /** A line under the state, such as who stopped it. */
  note?: string
  /** Stopped, not only paused: its runs ended, and only its person starts it again (16 Nov). */
  stopped?: boolean
  /** The talk it was handed over with, kept at the top of its thread (16 Nov). */
  talk?: TalkLine[]
}
/** One row of the list of projects. */
export type ProjectRow = Pick<Project, 'name' | 'title' | 'kind' | 'state' | 'person' | 'goal' | 'spent' | 'cap' | 'handedOver' | 'space' | 'thing'> & { done: number; of: number }
/** A brief that is not handed over yet (16 Nov): kept for its person only, with its talk. */
export interface Draft {
  id: string
  brief: Brief
  said: TalkLine[]
  /** How far the talk has got, in the mock's script. */
  turn: number
  /** The words of its name, if the person changed them. */
  words?: string
  kept: string
}

// ——— A run, step by step ———
export interface Step {
  n: number
  /** Each call to the model, each command in the box, each call outside it with Governance's
      answer, each card (agreed 12 Nov). */
  kind: 'model' | 'box' | 'outside' | 'card' | 'ask' | 'you' | 'end'
  text: string
  /** A short fact at the end of the line: "in the box", "YES, by giving 12", "3 failed". */
  facts?: string[]
  marked?: boolean
  /** All of it, shown when the step is opened. */
  more: string[]
  /** The run parks at this step, and waits for this thing on Today (16 Nov: a run waits for one
      thing at a time). */
  asks?: string
  /** This step shows the person's answer to that thing. */
  answers?: string
  /** The step happens only if that thing was answered so. */
  when?: { id: string; is: string }
}
export interface HandBack {
  found: string
  evidence: string
  assumed: string
  notChecked: string
}
export interface Run {
  number: number
  project: string
  projectTitle: string
  /** A project's task (and how many the plan has), or a standing order's go. */
  task?: { n: number; name: string; of?: number }
  order?: string
  agent: string
  team: string
  version: number
  state: RunState
  /** Why it is parked, or how it ended, in a few words. */
  stateNote?: string
  minutes: number
  cents: number
  marked: boolean
  model: string
  modelVersion: string
  started: string
  startedBy: string
  steps: Step[]
  /** The mock's own: steps that have not happened yet, shown one at a time. */
  later?: Step[]
  /** The id of what it waits for, on Today. */
  waitsFor?: string
  passEnds?: number
  computer?: Computer & { files: Inside }
  handBack?: HandBack
  checks?: { name: string; ok: boolean }[]
  branch?: string
  /** A run for a thing in a space: only the space's person sees it. */
  space?: string
}
export type RunRow = Pick<Run, 'number' | 'project' | 'projectTitle' | 'task' | 'order' | 'agent' | 'team' | 'state' | 'stateNote' | 'minutes' | 'cents' | 'marked' | 'started' | 'startedBy' | 'space'>

/** What "look inside" shows: the files, the change so far, what is running. Read only. */
export interface Inside {
  files: { path: string; depth: number; folder?: boolean; changed?: boolean }[]
  change: string
  running: string[]
  /** A page an agent built is shown as a picture, taken by Hyperbase's own checks. */
  picture?: { of: string; taken: string }
}

// ——— Today ———
export interface Waiting {
  id: string
  /** A question from a run · a request that comes up to its person · work to land · a change a dial sends to a
      person · a note that is held (agreed 12 Nov). And, agreed 16 Nov: a cap that was reached · a
      run that is parked because it was paused · a thing in a space that waits for its person's yes. */
  kind: 'question' | 'request' | 'land' | 'change' | 'note' | 'cap' | 'paused' | 'accept'
  /** The verb whoever answers it needs. */
  needs: Verb
  project?: string
  projectTitle?: string
  team?: string
  run?: number
  /** How long it has waited, in minutes: the oldest is first. */
  minutes: number
  text: string
  detail?: string
  /** For a request: how many times the same yes was given before. */
  before?: number
  /** Not asked yet at the story's clock: it comes when its run reaches the step that asks it. */
  later?: boolean
  /** In a space: only the space's person sees it. */
  space?: string
  /** Whose project it is. */
  person?: string
}
export interface Since {
  id: string
  text: string
  href?: string
  /** A landing names the person who landed it (agreed 16 Nov), and each pull request. */
  by?: string
  pulls?: string[]
  /** A change made without a person carries its undo: the id of that change, on its team's week. */
  change?: string
  team?: string
}
export interface Month {
  tokens: number
  tokensCap: number
  computers: number
  computersNote: string
  projects: number
  runsAtOnce: number
  runCap: { minutes: number; dollars: number }
  projectCap: number
}

// ——— Standing orders ———
export interface Order {
  /** One name on the pages: a standing order (agreed 16 Nov). Each says what starts it. */
  name: string
  line: string
  place: string
  /** What starts it: a time, or something that happens. */
  starts: string
  next: string
  last: { run?: number; text: string; ok: boolean | null }
  /** The date to renew it by. */
  renewBy: string
  renewSoon?: boolean
  state: 'on' | 'paused' | 'handed over' | 'ended'
  person: string
}

// ——— Teams ———
export interface TeamRow {
  name: string
  field: string
  sponsor: string
  agents: number
  skills: number
  notes: number
  waiting: number
  /** On, or answering in the shadow until its evidence switches it on (agreed 11 Nov). */
  state: 'on' | 'in the shadow'
  stateNote: string
}
export interface TeamWaiting {
  id: string
  kind: 'change' | 'note'
  title: string
  text: string
  run?: number
}
export interface Change {
  id: string
  what: string
  /** Nobody, or the evidence by a guideline. */
  yes: 'nobody' | 'by a guideline'
  when: string
  run?: number
}
export interface Note {
  id: string
  text: string
  /** Each names its source: the run, the task, what it read. */
  run: number
  task: string
  read: string
  held?: boolean
}
export type DialStop = 'off' | 'ask me' | 'by a guideline' | 'nobody'
export interface Team extends TeamRow {
  savedAgents: { name: string; job: string; version: number }[]
  skillList: { name: string; when: string; state: 'in use' | 'on trial' | 'retired' }[]
  waitingList: TeamWaiting[]
  week: {
    firstTimeYes: [number, number]
    centsAnAccepted: number
    keptTasks: [number, number]
    changes: Change[]
    lastFriday: string
  }
  noteList: Note[]
  dial: { what: string; stop: DialStop }[]
  set: string
  /** A team not yet switched on answers beside the person, and is counted (agreed 11 Nov). */
  shadow?: { since: string; agreed: [number, number]; yesWhereNo: number; lines: { asked: string; it: string; you: string; same: boolean }[] }
}

// ——— Score ———
export interface KeptTask {
  name: string
  set: 'must still pass' | 'stretch' | 'tripwires'
  /** One result for each column of the score. Never the hidden checks. */
  results: boolean[]
}
/** One change that can be tried (agreed 16 Nov): another model, another version of an agent's job
    or of a skill, or one setting. Its result is a new column on Score. */
export interface Trial {
  id: string
  kind: 'another model' | 'another version of an agent’s job' | 'another version of a skill' | 'one setting'
  what: string
  /** Said before the press: what it will cost, and how long it takes. */
  cents: number
  minutes: number
  /** One result for each kept task, in their order. */
  results: boolean[]
  /** Three verdicts (agreed 11 Nov). */
  verdict: 'better' | 'no harm seen' | 'can’t tell'
  changed: string[]
}
export interface Score {
  /** The pairs that were run: the one in use, the one before, and any on trial (16 Nov). */
  columns: { model: string; harness: string; now?: boolean; note?: string }[]
  tasks: KeptTask[]
  heldBack: number
  lastRun: string
  accepted: [number, number]
  trials: Trial[]
  /** The tenth of the month's money kept for getting better (11 Nov): dollars used, of dollars. */
  tenth: [number, number]
}

// ——— Space ———
export interface Thing {
  id: string
  name: string
  /** Three ways a thing gets built (agreed 12 Nov). */
  way: 'put together' | 'a piece of its own' | 'a new part for everyone'
  madeOf: string
  /** Built · accepted or sent back · shared (it becomes a meron). */
  state: 'being built' | 'built' | 'accepted' | 'sent back' | 'shared'
  /** Its place on the canvas: three dimensions, each from 0 to 1. */
  at: [number, number, number]
  shape: 'list' | 'keys' | 'grid' | 'chair' | 'blank'
  /** The small project that builds it (16 Nov). */
  project?: string
}
export interface Space {
  name: string
  place: string
  person: string
  seenBy: string[]
  things: Thing[]
  plan: string
}
