// ONE MADE-UP STORY (15 Nov, the mock). Everything Studio's pages show comes from this file, and
// nothing in it is real: no run happened, no money was spent, no agent exists. The names and numbers
// follow the examples drawn on the agreed page "Hyperbase Studio" (12 Nov), told as one story:
//
//   hiddenstack hands over projects on No Origins' own code. explorer-filters is being worked: its
//   third task is run 412, which asked for more than its set holds, and is parked until its person
//   says yes or no. Later it asks a question, and parks again: a run waits for one thing at a time.
//   eidos-spacing is done and checked, and waits for an owner to land it. roles-title-fix, a lone
//   task, landed; that landing started a standing order by itself (run 413, running now).
//   review-count was stopped by its person. The build team learned a skill that waits for its
//   engineer, and added two notes by itself this week, each with its undo. In hiddenstack's space
//   four things were asked for; each is a small project, and a calculator waits for its person's yes.
//
// The story's clock stands at Sunday 15 Nov 2026, 16:40. Pages read this only through mock/read.ts.
// Changed 16 Nov to match "What the Studio Mock Showed" and "When a Touch Is Asked" (both agreed
// that day): see Planning/studio-mock-notes.md.
import type { Computer, Draft, Giving, Inside, Month, Order, Project, Run, Score, Since, Space, Step, Team, Waiting } from './types'

export const NOW = 'Sunday 15 Nov, 16:40'
export const PERSON = 'hiddenstack'
/** The number the next thing handed over gets. */
export const NEXT_NUMBER = 9
/** The project the mock shows at its cap, when "Reach a project’s cap" is pressed. */
export const CAP_EXAMPLE = { project: 'explorer-filters-7', title: 'explorer-filters' }
/** The number the next run gets. */
export const NEXT_RUN = 415

const step = (n: number, kind: Step['kind'], text: string, facts: string[], more: string[], marked?: boolean, rest: Partial<Step> = {}): Step => ({ n, kind, text, facts, more, marked, ...rest })
/** The place of the one made-up space. */
export const SPACE_PLACE = 'noi.hyp.spaces.hiddenstack'

// ——— The first set (agreed 12 Nov), as the project's page says what was given from it ———
export const FIRST_SET = [
  'reading where its person may read',
  'a copy of the code, and up to two computers at once',
  'one branch and its pull request',
  'proposing in Mero where its charter says',
  'sub-agents, messages, requests, questions, notes of its own',
  'money and runs up to the caps',
  'up to 14 days',
]

// ——— Look inside: run 412's computer ———
const INSIDE_412: Inside = {
  files: [
    { path: 'ui/apps/explorer', depth: 0, folder: true },
    { path: 'app/merons', depth: 1, folder: true },
    { path: 'FilterBar.tsx', depth: 2, changed: true },
    { path: 'Navigator.tsx', depth: 2, changed: true },
    { path: 'filters.ts', depth: 2, changed: true },
    { path: 'merons.module.css', depth: 2, changed: true },
    { path: 'page.tsx', depth: 2 },
    { path: 'test', depth: 1, folder: true },
    { path: 'filters.test.mjs', depth: 2, changed: true },
    { path: 'helper-notes', depth: 0, folder: true },
    { path: 'review-filters.md', depth: 1 },
  ],
  change: [
    'app/merons/filters.ts',
    '+ export type Filters = { kind?: string; state?: string; place?: string }',
    '+ export const matches = (m: Meron, f: Filters) =>',
    '+   (!f.kind || m.classification.type === f.kind) &&',
    '+   (!f.state || m.lifecycle.state === f.state) &&',
    '+   (!f.place || m.identity.path.startsWith(f.place))',
    '',
    'app/merons/Navigator.tsx',
    '- const shown = merons',
    '+ const shown = merons.filter(m => matches(m, filters))',
    '',
    '5 files changed · 96 lines added · 4 removed · not yet on the branch',
  ].join('\n'),
  running: ['the tests, started 16:19: 38 passed, 3 failed', 'the app, on a port inside the box: nothing outside can reach it'],
  picture: { of: 'the Merons page with its filter bar', taken: '16:18, by Hyperbase’s own checks' },
}

const TASK_COMPUTER: Computer = {
  name: 'the task’s',
  marked: false,
  inside: [
    { who: 'the lead', does: 'holds the pen' },
    { who: 'a helper', does: 'looks' },
  ],
  run: 412,
}
const WEB_COMPUTER: Computer = { name: 'a web reader’s own', marked: true, inside: [{ who: 'a helper', does: 'reads the web' }], opened: 412 }

// ——— The projects ———
export const PROJECTS: Project[] = [
  {
    name: 'explorer-filters-7',
    title: 'explorer-filters',
    kind: 'project',
    state: 'working',
    person: PERSON,
    goal: 'Filters on the Merons page: by kind, by state, by place.',
    doneMeans: [
      { text: 'the three filters work together (a test)', done: true, by: 'a program' },
      { text: 'the choice is kept in the address', done: true, by: 'the checker' },
      { text: 'it works in one pane', done: false },
      { text: 'the fit checks pass', done: false },
    ],
    plan: [
      { n: 1, name: 'read the Merons page', state: 'done', run: 405 },
      { n: 2, name: 'the filter bar', state: 'done', run: 410 },
      { n: 3, name: 'filtering by place', state: 'parked', who: 'the lead', run: 412, note: 'waits for your yes or no' },
      { n: 4, name: 'one pane', state: 'to do' },
      { n: 5, name: 'tests and checks', state: 'to do' },
    ],
    thread: [
      { from: 'the lead', to: 'a helper', kind: 'card', text: 'find how Review filters' },
      { from: 'the helper', kind: 'hand-back', text: '3 findings' },
      { from: 'the lead', to: 'design', kind: 'request', text: 'a chip for a filter?' },
      { from: 'design', kind: 'answer', text: 'proposed in noi.eio', reply: 'done' },
      { from: 'you', kind: 'comment', text: 'keep it to one row', reply: 'applied', person: true },
      { from: 'the lead', to: 'the governance team', kind: 'request', text: 'let a helper read docs.rs again', reply: 'comes up to you', waiting: 'request-docs' },
      { from: 'the lead', to: 'you', kind: 'question', text: 'Should a filter remember your last choice?', waiting: 'question-filter' },
    ],
    talk: [
      { from: 'you', text: 'Filters on the Merons page.', you: true },
      { from: 'the shaper', text: 'By kind and by state only, or by place too?' },
      { from: 'you', text: 'All three. And keep the choice in the address.', you: true },
      { from: 'a scout', text: 'The list is built in app/merons/Navigator.tsx. Review already filters by state.' },
      { from: 'a sceptic', text: 'Done means says nothing about one pane.' },
      { from: 'you', text: 'Add one pane, and the fit checks.', you: true },
    ],
    computers: [TASK_COMPUTER, WEB_COMPUTER],
    given: [
      { id: 'set', from: 'the governance team’s set', what: ['a copy of the code', 'one branch', 'proposing in noi.eio'], days: 14 },
      { id: 'docs', from: 'you', what: ['reading docs.rs'], once: true, times: 2 },
    ],
    spent: 1.2,
    cap: 10,
    daysLeft: 11,
    days: 14,
    handedOver: 'Thursday 12 Nov',
    brief: {
      why: 'Filters on the Merons page: by kind, by state and by place.',
      inOut: 'In: the Merons page. Out: Review.',
      doneMeans: 'The three filters work together (a test).\nThe choice is kept in the address.\nIt works in one pane.\nThe fit checks pass.',
      where: 'The Explorer’s code · noi.eio, for a chip',
      forWhom: 'you',
    },
  },
  {
    name: 'eidos-spacing-6',
    title: 'eidos-spacing',
    kind: 'project',
    state: 'waiting for you',
    person: PERSON,
    goal: 'One spacing token for the gap between a field and its label, read by every form control.',
    doneMeans: [
      { text: 'the token is in noi.eio, and Review shows it (a look at Review)', done: true, by: 'the checker' },
      { text: 'all six form controls read it (a test)', done: true, by: 'a program' },
      { text: 'the fit checks pass', done: true, by: 'a program' },
    ],
    plan: [
      { n: 1, name: 'find every gap between a field and its label', state: 'done', run: 402 },
      { n: 2, name: 'the token, proposed in noi.eio', state: 'done', run: 404 },
      { n: 3, name: 'every control reads it', state: 'done', run: 409, note: 'its first run, 407, ended at a limit' },
    ],
    thread: [
      { from: 'the lead', to: 'design', kind: 'request', text: 'a name and a value for the token?' },
      { from: 'design', kind: 'answer', text: 'space.gap.label, 8 px, proposed in noi.eio', reply: 'done' },
      { from: 'you', kind: 'comment', text: 'Radio and Checkbox too, not only Field', reply: 'made a task', person: true },
      { from: 'the lead', to: 'the checker', kind: 'card', text: 'check the three done-means lines against the change' },
      { from: 'the checker', kind: 'hand-back', text: '3 of 3 lines hold' },
      { from: 'Hyperbase', kind: 'message', text: 'its own checks passed in a clean computer; the work waits to land' },
    ],
    computers: [],
    given: [{ id: 'set', from: 'the governance team’s set', what: ['a copy of the code', 'one branch', 'proposing in noi.eio'], days: 14 }],
    spent: 0.84,
    cap: 10,
    daysLeft: 9,
    days: 14,
    handedOver: 'Tuesday 10 Nov',
    pull: { number: 31, title: 'Eidos: one token for the gap between a field and its label', state: 'open', change: '38 lines added, 12 removed, in 6 files' },
  },
  {
    name: 'roles-title-fix-8',
    title: 'roles-title-fix',
    kind: 'lone task',
    state: 'done',
    person: PERSON,
    goal: 'Fix the wrapped title on the Roles page.',
    doneMeans: [{ text: 'the title is on one line at 320 px (the fit check)', done: true, by: 'a program', wrote: 'the governance team' }],
    plan: [{ n: 1, name: 'fix the wrapped title', state: 'done', run: 408 }],
    thread: [
      { from: 'the governance team', kind: 'message', text: 'read your line, wrote one done-means line from it, and gave from its set' },
      { from: 'the lead', to: 'you', kind: 'message', text: 'the title wrapped because of a fixed width; it now follows the page' },
      { from: 'Hyperbase', kind: 'message', text: 'its own checks passed in a clean computer' },
    ],
    computers: [],
    given: [{ id: 'set', from: 'the governance team’s set', what: ['a copy of the code', 'one branch'], days: 1 }],
    spent: 0.05,
    cap: 1,
    daysLeft: 0,
    days: 1,
    handedOver: 'today, 15:26',
    pull: { number: 29, title: 'Governance: the Roles page’s title stays on one line', state: 'landed', change: '3 lines added, 2 removed, in 1 file' },
  },
  {
    name: 'review-count-5',
    title: 'review-count',
    kind: 'project',
    state: 'paused',
    stopped: true,
    person: PERSON,
    goal: 'On Review’s tab, show how many changes wait for each person.',
    note: 'Stopped by hiddenstack on 11 Nov. The count is made by Mero’s server, and that was outside what this project was given. Only its person starts it again.',
    doneMeans: [
      { text: 'the tab shows your own count (a test)', done: false },
      { text: 'a signed-out visitor sees no count', done: false },
    ],
    plan: [
      { n: 1, name: 'read how the count is made', state: 'could not', run: 401 },
      { n: 2, name: 'a count from the page’s own data', state: 'to do', run: 403, note: 'its run was stopped' },
    ],
    thread: [
      { from: 'the lead', to: 'the governance team', kind: 'request', text: 'a change in Mero’s server', reply: 'no' },
      { from: 'the lead', to: 'you', kind: 'message', text: 'I could not: the count is kept by Mero’s server' },
      { from: 'you', kind: 'comment', text: 'stop here, I will hand this over again with Mero in it', reply: 'applied', person: true },
    ],
    computers: [],
    given: [{ id: 'set', from: 'the governance team’s set', what: ['a copy of the code', 'one branch'], days: 14 }],
    spent: 0.31,
    cap: 10,
    daysLeft: 6,
    days: 14,
    handedOver: 'Saturday 7 Nov',
  },
]

// ——— Things in a space (agreed 16 Nov): asking for a thing makes a small project, and its place
// is the space. One line is enough, and the team writes the rest. "Accept" takes the place of
// "Land". Only the space's person sees these. ———
const FROM_PLAN: Giving = { id: 'plan', from: 'your space’s plan', what: ['building from No Origins’ parts', 'your space, and nowhere else'], days: 3 }
const WROTE = 'the governance team'
const thing = (name: string, title: string, thingId: string, over: Partial<Project>): Project => ({
  name, title, kind: 'thing', space: SPACE_PLACE, thing: thingId, state: 'done', person: PERSON, goal: `${title.charAt(0).toUpperCase()}${title.slice(1)}.`,
  doneMeans: [], plan: [], thread: [], computers: [], given: [FROM_PLAN], spent: 0.05, cap: 1, daysLeft: 0, days: 3, handedOver: 'Friday 13 Nov', ...over,
})
const WROTE_REST = { from: 'the governance team', kind: 'message' as const, text: 'read your line and wrote the rest: done means, and a plan' }
export const THING_PROJECTS: Project[] = [
  thing('calculator', 'a calculator', 'calc', {
    state: 'waiting for you',
    doneMeans: [
      { text: 'the four sums give the right answer (a test)', done: true, by: 'a program', wrote: WROTE },
      { text: 'it holds its shape, and is drawn from its description (a look at Space)', done: true, by: 'the checker', wrote: WROTE },
    ],
    plan: [{ n: 1, name: 'put it together from parts that exist', state: 'done', run: 414 }],
    thread: [
      WROTE_REST,
      { from: 'the lead', kind: 'message', text: 'Eidos has buttons and a field, and a utility does the sums. The thing is only a description: no new code' },
      { from: 'Hyperbase', kind: 'message', text: 'checked it against its shape; it waits for your yes' },
    ],
    spent: 0.03,
    daysLeft: 3,
    handedOver: 'today, 16:36',
  }),
  thing('chair', 'a 3D model of a chair', 'chair', {
    state: 'working',
    doneMeans: [
      { text: 'the chair is drawn on your canvas, and turns (a look at Space)', done: false, wrote: WROTE },
      { text: 'the new part, a 3D shape, is in noi.eio (a look at Review)', done: false, wrote: WROTE },
    ],
    plan: [
      { n: 1, name: 'look for parts that exist', state: 'done', note: 'none can draw a 3D shape' },
      { n: 2, name: 'a new part for everyone: a 3D shape', state: 'to do', note: 'the design team builds it, as No Origins’ own work' },
      { n: 3, name: 'put the chair together from it', state: 'to do' },
    ],
    thread: [
      WROTE_REST,
      { from: 'the lead', to: 'design', kind: 'request', text: 'a part for a 3D shape?' },
      { from: 'design', kind: 'answer', text: 'no part can do it; the design team builds one, as No Origins’ own work', reply: 'made a task' },
    ],
    spent: 0.04,
    daysLeft: 2,
    handedOver: 'Saturday 14 Nov',
  }),
  thing('snake-game', 'a snake game', 'snake', {
    doneMeans: [
      { text: 'the snake moves, eats and ends the game (a test)', done: true, by: 'a program', wrote: WROTE },
      { text: 'its rules run closed in: no network, no other space, no sign-in', done: true, by: 'the checker', wrote: WROTE },
    ],
    plan: [
      { n: 1, name: 'a card and buttons, from parts that exist', state: 'done' },
      { n: 2, name: 'its rules, as a piece of its own', state: 'done' },
    ],
    thread: [
      WROTE_REST,
      { from: 'you', kind: 'change', text: 'accepted it', person: true },
      { from: 'you', kind: 'change', text: 'shared it: it is a meron now, open to read', person: true },
    ],
    spent: 0.11,
    handedOver: 'Thursday 12 Nov',
  }),
  thing('to-do-list', 'a to-do list', 'todo', {
    doneMeans: [
      { text: 'a line can be added, ticked and removed (a test)', done: true, by: 'a program', wrote: WROTE },
      { text: 'it holds its shape, and is drawn from its description (a look at Space)', done: true, by: 'the checker', wrote: WROTE },
    ],
    plan: [{ n: 1, name: 'put it together from a card, a field, a button and a tick box', state: 'done' }],
    thread: [WROTE_REST, { from: 'you', kind: 'change', text: 'accepted it', person: true }],
    spent: 0.02,
    handedOver: 'Wednesday 11 Nov',
  }),
]

// ——— A draft (agreed 16 Nov): a brief that is not handed over yet, kept for its person only,
// with its talk. Drafts are at the top of Projects. ———
export const DRAFTS: Draft[] = [
  {
    id: 'review-tab',
    brief: { why: 'Review remembers which tab you were on.', inOut: 'In: Review. Out: the Merons page.', doneMeans: '', where: '', forWhom: 'you' },
    said: [
      { from: 'you', text: 'Review should remember which tab I was on.', you: true },
      { from: 'the shaper', text: 'For this visit only, or the next time you come too?' },
      { from: 'you', text: 'The next time too.', you: true },
      { from: 'a scout', text: 'The tabs are in app/review. The theme is already kept across visits, in a cookie.' },
    ],
    turn: 4,
    kept: 'kept on Saturday 14 Nov',
  },
]

// ——— The runs ———
const CHECKS = [
  { name: 'the types', ok: true },
  { name: 'the tests', ok: true },
  { name: 'the fit checks', ok: true },
]
const MODEL = { model: 'deepseek-flash', modelVersion: 'V4.1-Flash-1017' }
/** What a run's last step says when it is opened: a hand-back is what a run reports when it ends. */
const REPORT = 'Its hand-back: what it found, the evidence, what it assumed, what it did not check.'
const ENDED = 'ended with its hand-back'
/** A short ended run: asked, worked in the box, ended with its hand-back. */
const short = (did: string, result: string): Step[] => [
  step(1, 'model', 'asked the model', ['1,020 new tokens'], ['The pack: its job, the task card, what the project was given, 2 notes that match.', 'The model answered with a plan of three commands.']),
  step(2, 'box', did, ['in the box'], ['Run by Hyperbase in the task’s computer. Nobody is asked for a command inside the box.']),
  step(3, 'end', ENDED, [result], [REPORT]),
]

export const RUNS: Run[] = [
  {
    number: 414,
    project: 'calculator',
    projectTitle: 'a calculator',
    task: { n: 1, name: 'put it together from parts that exist' },
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'done',
    stateNote: 'it holds its shape',
    minutes: 2,
    cents: 2,
    marked: false,
    ...MODEL,
    started: 'today, 16:37',
    startedBy: 'the plan: the team wrote the rest of the brief',
    space: SPACE_PLACE,
    steps: [
      step(1, 'model', 'asked the model', ['840 new tokens'], ['The pack: its job, the one line, done means as the team wrote it, the parts No Origins has.', 'The model answered: buttons, a field, and the utility for sums.']),
      step(2, 'box', 'wrote its description', ['in the box', 'no new code'], ['A thing put together from parts that exist is only a description. The app draws it.']),
      step(3, 'box', 'checked it against its shape', ['in the box', 'it holds'], ['Checked at once, by a program.']),
      step(4, 'end', ENDED, ['“done” is a claim'], [REPORT, 'Hyperbase ran the checks itself before its person was told.']),
    ],
    handBack: { found: 'A calculator, put together from buttons, a field and the utility for sums.', evidence: 'The four sums give the right answer. It holds its shape.', assumed: 'Whole numbers and decimals; nothing else.', notChecked: 'How it looks on your canvas: your own eye.' },
    checks: [{ name: 'its shape', ok: true }, { name: 'the tests', ok: true }],
  },
  {
    number: 413,
    project: 'after-landing-checks',
    projectTitle: 'after-landing-checks',
    order: 'after-landing-checks',
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'running',
    minutes: 4,
    cents: 2,
    marked: false,
    ...MODEL,
    started: 'today, 16:36',
    startedBy: 'itself: work landed on main, pull request 29',
    passEnds: 11,
    steps: [
      step(1, 'model', 'asked the model', ['620 new tokens'], ['The pack: its job, the standing order’s one line, what the order was given from the narrower set.', 'The model answered: fetch main, then the types, the tests, the fit checks.']),
      step(2, 'outside', 'asked Governance: fetch the branch main', ['YES, by giving 14'], ['A call outside the box. The tool runner asked Governance with the run’s pass.', 'The set, the order, the person and the task all said yes.']),
      step(3, 'box', 'ran the types', ['in the box', 'passed'], ['pnpm --dir ui/apps/explorer typecheck', 'No errors.']),
      step(4, 'box', 'runs the tests', ['in the box', 'still running'], ['pnpm --dir ui/apps/explorer test', '31 of 58 so far, all passing.']),
    ],
    later: [
      step(5, 'box', 'ran the fit checks', ['in the box', '17 pages fit'], ['Every open page at every window edge, in light and dark.', 'All 17 fit.']),
      step(6, 'end', ENDED, ['main is sound after pull request 29'], [REPORT]),
    ],
    handBack: {
      found: 'Main is sound after pull request 29: the types, the tests and the fit checks pass.',
      evidence: 'Types: no errors. Tests: 58 passed. Fit checks: 17 pages fit.',
      assumed: 'The pages that need Governance and Mero were served by the copies inside the box.',
      notChecked: 'Safari. The checks run in Chrome only.',
    },
    checks: CHECKS,
  },
  {
    number: 412,
    project: 'explorer-filters-7',
    projectTitle: 'explorer-filters',
    task: { n: 3, name: 'filtering by place' },
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'parked',
    stateNote: 'waits for your yes or no',
    minutes: 11,
    cents: 8,
    marked: false,
    ...MODEL,
    started: 'today, 16:08',
    startedBy: 'the plan: task 2 was done',
    waitsFor: 'request-docs',
    passEnds: 9,
    branch: 'hyp/explorer-filters-7',
    computer: { ...TASK_COMPUTER, files: INSIDE_412 },
    steps: [
      step(1, 'model', 'asked the model', ['1,240 new tokens'], ['The pack: its job, the task card, what the project was given, 3 notes that match, its tools.', 'The model answered: read the navigator, then run the tests.']),
      step(2, 'box', 'read app/merons/Navigator.tsx', ['in the box'], ['214 lines. The list is built from one snapshot of Mero.', 'Inside the box nobody is asked.']),
      step(3, 'box', 'ran the tests', ['in the box', '3 failed'], ['pnpm --dir ui/apps/explorer test', '38 passed, 3 failed: the three new tests for filtering by place.']),
      step(4, 'outside', 'asked Governance: propose in noi.eio', ['YES, by giving 12'], ['A call outside the box. The tool runner asked Governance with the run’s pass.', 'Giving 12: the governance team gave this project proposing in noi.eio, from its set.']),
      step(5, 'card', 'made a helper', ['a card'], ['The aim: find how a place in the tree is matched in Rust’s path crate.', 'What to hand back: a yes or no, and a name from this list: starts_with, strip_prefix, ancestors.', 'Where it works: in a computer of its own, because it reads the web.']),
      step(6, 'outside', 'the helper read docs.rs', ['that helper is MARKED'], ['A web page is content from outside. The helper that read it is marked, and so is its computer.', 'The governance team’s set does not hold the web, so you gave this once, with one press.'], true),
      step(7, 'card', 'the helper sent back a yes, and a name from the list', ['no mark'], ['“yes · starts_with”', 'What a helper sends back is fixed facts. They cannot carry an order, so they do not mark their reader.']),
      step(8, 'outside', 'asked the governance team: let a helper read docs.rs again', ['its set does not hold it', 'it comes up to you', 'PARKED'], ['A request goes to the team that looks after it. The governance team’s set does not hold the web.', 'So it comes up to you, and is on Today. A request that comes up to you parks the run, as a question does: its conversation is kept, its computer saved and stopped.', 'Waiting costs nothing. It goes on when you say yes or no.'], false, { asks: 'request-docs' }),
    ],
    // What happens after the story's clock. A run waits for one thing at a time (agreed 16 Nov):
    // the request parked it; once that is answered it goes on, and later parks again at a question.
    later: [
      step(9, 'you', 'your answer arrived', ['an order: you may steer'], ['Words from a person who may steer the project are an order. Everything else is content.', 'The run got a new pass, and its computer was started from where it stopped.'], false, { answers: 'request-docs' }),
      step(10, 'outside', 'the helper read docs.rs again', [`given once, by ${PERSON}`, 'that helper is MARKED'], ['Given once, with one press. It is for this project only, and ends with it.', 'A web page is content from outside. The helper that read it is marked, and so is its computer.'], true, { when: { id: 'request-docs', is: 'given' } }),
      step(11, 'model', 'asked the model', ['760 new tokens'], ['Your no is at the start of the turn. The lead goes on with what the first reading found.'], false, { when: { id: 'request-docs', is: 'no' } }),
      step(12, 'ask', 'asked you: “Should a filter remember your last choice?”', ['PARKED'], ['A question to the project’s person. The run is parked again: its conversation is kept, its computer saved and stopped.', 'Waiting costs nothing. It goes on when you answer.'], false, { asks: 'question-filter' }),
      step(13, 'you', 'your answer arrived', ['an order: you may steer'], ['Words from a person who may steer the project are an order. Everything else is content.', 'The run got a new pass, and its computer was started from where it stopped.'], false, { answers: 'question-filter' }),
      step(14, 'model', 'asked the model', ['980 new tokens'], ['The conversation so far, with your answer at the start of the turn.']),
      step(15, 'box', 'wrote app/merons/FilterBar.tsx', ['in the box'], ['The lead holds the pen in this computer. The helper only looks.']),
      step(16, 'box', 'ran the tests', ['in the box', 'all 41 passed'], ['pnpm --dir ui/apps/explorer test', '41 passed.']),
      step(17, 'end', ENDED, ['“done” is a claim'], [REPORT, 'Hyperbase runs the checks itself, in a clean computer, before anyone is told.']),
    ],
    handBack: {
      found: 'Merons can be filtered by place, together with kind and state.',
      evidence: 'Tests: 41 passed, 3 of them new. The change: 5 files.',
      assumed: 'A place matches everything under it, as a role at a place does.',
      notChecked: 'One pane, and the fit checks: they are tasks 4 and 5.',
    },
    checks: CHECKS,
  },
  {
    number: 411,
    project: 'eidos-spacing-6',
    projectTitle: 'eidos-spacing',
    task: { n: 3, name: 'every control reads it' },
    agent: 'the checker',
    team: 'build',
    version: 2,
    state: 'done',
    stateNote: '3 of 3 done-means lines hold',
    minutes: 6,
    cents: 4,
    marked: false,
    ...MODEL,
    started: 'today, 15:52',
    startedBy: 'Hyperbase: run 409 said “done”',
    steps: [
      step(1, 'model', 'asked the model', ['890 new tokens'], ['A fresh checker: it has not seen the lead’s conversation. It never fixes.', 'Its pack: the done-means lines, and the change.']),
      step(2, 'box', 'opened the change', ['in the box', 'a clean computer'], ['A check gets a clean computer with only the change. It never shares the doer’s.']),
      step(3, 'box', 'ran the tests', ['in the box', '58 passed'], ['pnpm --dir ui/packages/eio-react test', '58 passed.']),
      step(4, 'outside', 'asked Governance: read Review', ['YES, by giving 9'], ['It looked at Review: the token space.gap.label is shown there, proposed.']),
      step(5, 'end', ENDED, ['3 of 3 lines hold'], [REPORT, 'One line ticked by the checker, two by a program.']),
    ],
    handBack: {
      found: 'All three done-means lines hold.',
      evidence: 'Tests: 58 passed. Review shows space.gap.label. The fit checks pass.',
      assumed: 'Nothing.',
      notChecked: 'How it looks: a person’s eye, in Safari.',
    },
    checks: CHECKS,
  },
  {
    number: 410,
    project: 'explorer-filters-7',
    projectTitle: 'explorer-filters',
    task: { n: 2, name: 'the filter bar' },
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'done',
    minutes: 26,
    cents: 19,
    marked: false,
    ...MODEL,
    started: 'today, 15:36',
    startedBy: 'the plan: task 1 was done',
    steps: short('wrote the filter bar, from Eidos’s Select and Field', 'the bar filters by kind and state'),
    handBack: {
      found: 'A filter bar on the Merons page, for kind and state.',
      evidence: 'Tests: 38 passed. A picture of the page, taken by Hyperbase’s checks.',
      assumed: 'The bar sits above the tree in one pane too.',
      notChecked: 'Filtering by place: task 3.',
    },
    checks: CHECKS,
    branch: 'hyp/explorer-filters-7',
  },
  {
    number: 409,
    project: 'eidos-spacing-6',
    projectTitle: 'eidos-spacing',
    task: { n: 3, name: 'every control reads it' },
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'done',
    minutes: 21,
    cents: 14,
    marked: false,
    ...MODEL,
    started: 'today, 15:28',
    startedBy: 'the plan: run 407 ended at a limit',
    steps: [
      step(1, 'model', 'asked the model', ['1,410 new tokens'], ['The pack, and what run 407 reported when it ended: where it got to.']),
      step(2, 'box', 'read ui/packages/eio-react/src/Field.module.css', ['in the box'], ['The gap between a field and its label was written as 8 px in four places.']),
      step(3, 'box', 'changed the six form controls', ['in the box'], ['Field, Select, TextArea, Checkbox, Radio and Choices now read space.gap.label.']),
      step(4, 'box', 'ran the tests', ['in the box', '58 passed'], ['pnpm --dir ui/packages/eio-react test', '58 passed.']),
      step(5, 'outside', 'asked Governance: open a pull request', ['YES, by giving 9'], ['The agents’ key can only push a branch and open a pull request.', 'Pull request 31.']),
      step(6, 'end', ENDED, ['“done” is a claim'], [REPORT, 'Hyperbase ran the checks itself, in a clean computer, and then asked a fresh checker.']),
    ],
    handBack: {
      found: 'All six form controls read space.gap.label.',
      evidence: 'Tests: 58 passed. Fit checks: 17 pages fit. Pull request 31.',
      assumed: 'TextArea’s label sits as Field’s does.',
      notChecked: 'Safari on a phone: the checks run in Chrome.',
    },
    checks: CHECKS,
    branch: 'hyp/eidos-spacing-6',
  },
  {
    number: 406,
    project: 'fit-checks-nightly',
    projectTitle: 'fit-checks-nightly',
    order: 'fit-checks-nightly',
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'done',
    stateNote: 'all 17 pages fit',
    minutes: 9,
    cents: 3,
    marked: false,
    ...MODEL,
    started: 'today, 02:00',
    startedBy: 'itself: every night at 02:00',
    steps: short('ran the fit checks on every open page', 'all 17 pages fit'),
    handBack: { found: 'All 17 open pages fit every window.', evidence: 'The fit checks’ own output.', assumed: 'Nothing.', notChecked: 'Pages behind a sign-in.' },
    checks: CHECKS,
  },
  {
    number: 408,
    project: 'roles-title-fix-8',
    projectTitle: 'roles-title-fix',
    task: { n: 1, name: 'fix the wrapped title' },
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'done',
    minutes: 8,
    cents: 5,
    marked: false,
    ...MODEL,
    started: 'today, 15:27',
    startedBy: `${PERSON}’s press: the task was handed over`,
    steps: short('changed app/gov/gov.module.css: the title follows the page’s width', 'the title is on one line at 320 px'),
    handBack: { found: 'The title wrapped because of a fixed width.', evidence: 'The fit check for the Roles page passes at 320 px.', assumed: 'No other page uses that width.', notChecked: 'Nothing.' },
    checks: CHECKS,
    branch: 'hyp/roles-title-fix-8',
  },
  {
    number: 407,
    project: 'eidos-spacing-6',
    projectTitle: 'eidos-spacing',
    task: { n: 3, name: 'every control reads it' },
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'at a limit',
    stateNote: '45 minutes, the cap for one run',
    minutes: 45,
    cents: 31,
    marked: false,
    ...MODEL,
    started: 'today, 14:40',
    startedBy: 'the plan: task 2 was done',
    steps: short('changed four of the six form controls', 'it ended at 45 minutes, and reported where it got to'),
    handBack: { found: 'Four of six controls read the token. Radio and Checkbox are left.', evidence: 'Tests: 51 passed, 7 failed.', assumed: 'Nothing.', notChecked: 'The fit checks: it ended first.' },
    branch: 'hyp/eidos-spacing-6',
  },
  {
    number: 405,
    project: 'explorer-filters-7',
    projectTitle: 'explorer-filters',
    task: { n: 1, name: 'read the Merons page' },
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'done',
    minutes: 7,
    cents: 4,
    marked: false,
    ...MODEL,
    started: 'Friday 13 Nov, 11:02',
    startedBy: 'the plan: the charter was written',
    steps: short('read the Merons page’s code, and made a helper to read Review’s', 'a plan of five tasks'),
    handBack: { found: 'The list is built in Navigator.tsx from one snapshot. Review already filters by state.', evidence: 'The files read: 6. The helper’s 3 findings.', assumed: 'Nothing.', notChecked: 'Nothing was changed.' },
    checks: CHECKS,
  },
  {
    number: 404,
    project: 'eidos-spacing-6',
    projectTitle: 'eidos-spacing',
    task: { n: 2, name: 'the token, proposed in noi.eio' },
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'done',
    minutes: 11,
    cents: 7,
    marked: false,
    ...MODEL,
    started: 'Thursday 12 Nov, 10:14',
    startedBy: 'the plan: task 1 was done',
    steps: short('asked design for a name and a value, then proposed the token in noi.eio', 'space.gap.label is proposed'),
    handBack: { found: 'The token space.gap.label, 8 px, is proposed in noi.eio.', evidence: 'Review shows it.', assumed: 'Design’s name stands.', notChecked: 'Nothing.' },
    checks: CHECKS,
  },
  {
    number: 403,
    project: 'review-count-5',
    projectTitle: 'review-count',
    task: { n: 2, name: 'a count from the page’s own data' },
    agent: 'the lead',
    team: 'build',
    version: 3,
    state: 'stopped',
    stateNote: `by ${PERSON}`,
    minutes: 5,
    cents: 3,
    marked: false,
    ...MODEL,
    started: 'Wednesday 11 Nov, 18:10',
    startedBy: 'the plan: task 1 could not be done',
    steps: short('read the Review page’s data', `${PERSON} stopped it, and it reported where it got to`),
    handBack: { found: 'The page’s own data has every waiting change, and not whom each waits for.', evidence: 'The file read: lib/mero.ts.', assumed: 'Nothing.', notChecked: 'Nothing was changed.' },
  },
  {
    number: 402,
    project: 'eidos-spacing-6',
    projectTitle: 'eidos-spacing',
    task: { n: 1, name: 'find every gap between a field and its label' },
    agent: 'the lead',
    team: 'build',
    version: 4,
    state: 'done',
    minutes: 6,
    cents: 4,
    marked: false,
    ...MODEL,
    started: 'Wednesday 11 Nov, 17:20',
    startedBy: 'the plan: the charter was written',
    steps: short('searched the form controls for the gap', 'the gap is written in four places'),
    handBack: { found: 'The gap is written as 8 px in four places.', evidence: 'The four lines, named.', assumed: 'Nothing.', notChecked: 'Nothing was changed.' },
    checks: CHECKS,
  },
  {
    number: 401,
    project: 'review-count-5',
    projectTitle: 'review-count',
    task: { n: 1, name: 'read how the count is made' },
    agent: 'the lead',
    team: 'build',
    version: 3,
    state: 'could not',
    stateNote: 'a plain “I could not”',
    minutes: 14,
    cents: 9,
    marked: false,
    ...MODEL,
    started: 'Sunday 8 Nov, 18:05',
    startedBy: 'the plan: the charter was written',
    steps: short('read how Review’s count is made', 'I could not: the count is made by Mero’s server'),
    handBack: { found: 'The count is made by Mero’s server. This project was given the Explorer’s code only.', evidence: 'The governance team’s answer to the request: no.', assumed: 'Nothing.', notChecked: 'Whether the page’s own data would do.' },
  },
]

// ——— Today ———
export const WAITING: Waiting[] = [
  {
    id: 'change-build-skill',
    kind: 'change',
    needs: 'tend',
    team: 'build',
    run: 410,
    minutes: 130,
    text: 'A new skill: “run the app’s checks”',
    detail: 'From a run that passed. Skills are at ASK ME on the build team’s dial, so a person decides.',
  },
  {
    id: 'note-build-held',
    kind: 'note',
    needs: 'tend',
    team: 'build',
    run: 412,
    minutes: 70,
    text: 'A note, held: “docs.rs lists a crate’s features on its first page.”',
    detail: 'Its run read the web. The note is kept, and not used until a person releases it.',
  },
  {
    id: 'land-eidos-spacing',
    kind: 'land',
    needs: 'land',
    project: 'eidos-spacing-6',
    projectTitle: 'eidos-spacing',
    run: 409,
    person: PERSON,
    minutes: 40,
    text: 'Done. Checked by Hyperbase, and by the checker.',
    detail: 'Pull request 31 · 38 lines added, 12 removed, in 6 files',
  },
  {
    id: 'request-docs',
    kind: 'request',
    needs: 'steer',
    project: 'explorer-filters-7',
    projectTitle: 'explorer-filters',
    run: 412,
    minutes: 21,
    text: 'It wants to read docs.rs.',
    detail: 'The governance team’s set does not hold the web, so the request comes up to its person.',
    person: PERSON,
    before: 2,
  },
  {
    id: 'question-filter',
    kind: 'question',
    needs: 'steer',
    project: 'explorer-filters-7',
    projectTitle: 'explorer-filters',
    run: 412,
    minutes: 0,
    text: 'Should a filter remember your last choice?',
    person: PERSON,
    // A run waits for one thing at a time: this is asked once the request above is answered.
    later: true,
  },
]

export const SINCE: Since[] = [
  { id: 'tasks', text: '2 tasks done: the filter bar, in explorer-filters, and roles-title-fix' },
  { id: 'landed', text: '1 pull request landed · by hiddenstack', by: PERSON, pulls: ['29, roles-title-fix'], href: '/projects/roles-title-fix-8' },
  { id: 'order', text: '1 standing order started work by itself: after-landing-checks, run 413', href: '/runs/413' },
  { id: 'note', text: '1 note added by the build team, nobody asked', change: 'c-note-checks', team: 'build' },
]

export const MONTH: Month = {
  tokens: 6.4,
  tokensCap: 40,
  computers: 0,
  computersNote: 'on this Mac',
  projects: 4,
  runsAtOnce: 3,
  runCap: { minutes: 45, dollars: 1 },
  projectCap: 10,
}

// ——— Standing orders ———
export const ORDERS: Order[] = [
  {
    name: 'after-landing-checks',
    line: 'Run the app’s checks on main after every landing.',
    place: 'the Explorer’s code',
    starts: 'when work lands on main',
    next: 'when the next work lands',
    last: { run: 413, text: 'running now: it started by itself when pull request 29 landed', ok: null },
    renewBy: '13 Dec',
    state: 'on',
    person: PERSON,
  },
  {
    name: 'fit-checks-nightly',
    line: 'Run the fit checks on every open page.',
    place: 'the Explorer’s code',
    starts: 'every night at 02:00',
    next: 'tonight, 02:00',
    last: { run: 406, text: 'done: all 17 pages fit', ok: true },
    renewBy: '6 Dec',
    state: 'on',
    person: PERSON,
  },
  {
    name: 'kept-tasks-weekly',
    line: 'Run the trial tasks again, and note the model’s version.',
    place: 'Hyperbase’s own records',
    starts: 'every Monday at 05:00, and when the model’s version changes',
    next: 'Monday 16 Nov, 05:00',
    last: { text: 'done on 9 Nov: 11 of 14, as the week before', ok: true },
    renewBy: '18 Nov',
    renewSoon: true,
    state: 'on',
    person: PERSON,
  },
]

// ——— Teams ———
const DIAL_START = [
  { what: 'notes', stop: 'nobody' as const },
  { what: 'skills: a new one, or a change to one', stop: 'ask me' as const },
  { what: 'an agent’s own job', stop: 'ask me' as const },
]
export const TEAMS: Team[] = [
  {
    name: 'governance',
    field: 'projects in, charters, the request desk, checking, closing',
    sponsor: PERSON,
    agents: 1,
    skills: 1,
    notes: 6,
    waiting: 0,
    state: 'on',
    stateNote: 'on since rung 3, as one agent with the first set',
    savedAgents: [{ name: 'the desk', job: 'reads a brief, writes the charter, gives from the set, answers requests', version: 3 }],
    skillList: [{ name: 'write a charter from a brief', when: 'a project is handed over', state: 'in use' }],
    waitingList: [],
    week: { firstTimeYes: [9, 11], centsAnAccepted: 6, keptTasks: [5, 5], changes: [{ id: 'c-gov-note', what: 'a note added: “A lone task on a page’s words needs no proposing in Mero.”', yes: 'nobody', when: 'Thursday', run: 408 }], lastFriday: 'Friday 13 Nov' },
    noteList: [
      { id: 'g1', text: 'A lone task on a page’s words needs no proposing in Mero.', run: 408, task: 'roles-title-fix', read: 'the brief' },
      { id: 'g2', text: 'A project that names noi.eio is given proposing there, and nowhere else.', run: 404, task: 'eidos-spacing, task 2', read: 'the charter' },
      { id: 'g3', text: 'A request for Mero’s server is outside the first set: answer no, and say why.', run: 401, task: 'review-count, task 1', read: 'the first set' },
    ],
    dial: DIAL_START,
    set: 'The first set, for a project on No Origins’ own code. The web is not in it.',
  },
  {
    name: 'build',
    field: 'the craft of building',
    sponsor: PERSON,
    agents: 2,
    skills: 3,
    notes: 14,
    waiting: 2,
    state: 'on',
    stateNote: 'on since rung 1, as one agent',
    savedAgents: [
      { name: 'the lead', job: 'writes the code for one task, and may make helpers one deep', version: 4 },
      { name: 'the checker', job: 'checks done-means lines against a change; never fixes', version: 2 },
    ],
    skillList: [
      { name: 'read a page before changing it', when: 'a task names a page', state: 'in use' },
      { name: 'name a branch', when: 'a project gets its branch', state: 'in use' },
      { name: 'ask design before a new part', when: 'a task needs a part Eidos has not', state: 'in use' },
      { name: 'run the app’s checks', when: 'a change touches a page', state: 'on trial' },
    ],
    waitingList: [
      { id: 'change-build-skill', kind: 'change', title: 'A new skill', text: '“run the app’s checks” · from a run that passed', run: 410 },
      { id: 'note-build-held', kind: 'note', title: 'A note, held', text: 'its run read the web', run: 412 },
    ],
    week: {
      firstTimeYes: [7, 10],
      centsAnAccepted: 31,
      keptTasks: [9, 9],
      changes: [
        { id: 'c-note-navigator', what: 'a note added: “The Merons page’s list is built in Navigator.tsx.”', yes: 'nobody', when: 'Friday', run: 405 },
        { id: 'c-note-checks', what: 'a note added: “Run the fit checks before handing back a change to a page.”', yes: 'nobody', when: 'today', run: 410 },
      ],
      lastFriday: 'Friday 13 Nov',
    },
    noteList: [
      { id: 'n1', text: 'The Merons page’s list is built in Navigator.tsx.', run: 405, task: 'explorer-filters, task 1', read: 'app/merons/Navigator.tsx' },
      { id: 'n2', text: 'Run the fit checks before handing back a change to a page.', run: 410, task: 'explorer-filters, task 2', read: 'test/fit.test.mjs' },
      { id: 'n3', text: 'Review already filters by state; that code can be shared.', run: 405, task: 'explorer-filters, task 1', read: 'app/review' },
      { id: 'n4', text: 'A page’s styles may read no window width of their own.', run: 408, task: 'roles-title-fix', read: 'test/styles.test.mjs' },
      { id: 'n5', text: 'Every form control is in eio-react; a page places them and never draws them.', run: 402, task: 'eidos-spacing, task 1', read: 'ui/packages/eio-react' },
      { id: 'n6', text: 'A token is proposed in Mero first; the code reads it after Review.', run: 404, task: 'eidos-spacing, task 2', read: 'noi.eio' },
      { id: 'n7', text: 'pnpm, never npm.', run: 402, task: 'eidos-spacing, task 1', read: 'the top package.json' },
      { id: 'n8', text: 'The tests need no server; the fit checks need the app running.', run: 407, task: 'eidos-spacing, task 3', read: 'ui/apps/explorer/package.json' },
      { id: 'n9', text: 'A link in a list is a chip, so its target is the minimum.', run: 408, task: 'roles-title-fix', read: 'app/gov/page.tsx' },
      { id: 'n10', text: 'Radio and Checkbox share one style sheet.', run: 407, task: 'eidos-spacing, task 3', read: 'Choice.module.css' },
      { id: 'n11', text: 'Mero’s count of waiting changes comes from its server, not the page.', run: 401, task: 'review-count, task 1', read: 'lib/mero.ts' },
      { id: 'n12', text: 'A helper that reads the web works in a computer of its own.', run: 412, task: 'explorer-filters, task 3', read: 'its card' },
      { id: 'n13', text: 'Hand back a number, a yes or no, or a name from a list: no mark.', run: 412, task: 'explorer-filters, task 3', read: 'its card' },
      { id: 'n14', text: 'docs.rs lists a crate’s features on its first page.', run: 412, task: 'explorer-filters, task 3', read: 'docs.rs, the web', held: true },
    ],
    dial: DIAL_START,
    set: 'No set yet. Only the governance team gives.',
  },
  {
    name: 'design',
    field: 'Eidos: how things look',
    sponsor: PERSON,
    agents: 1,
    skills: 2,
    notes: 5,
    waiting: 0,
    state: 'on',
    stateNote: 'switched on by its evidence: it agreed with you 9 times in 10',
    savedAgents: [{ name: 'the designer', job: 'answers requests about parts and tokens; proposes in noi.eio', version: 2 }],
    skillList: [
      { name: 'name a token by its role', when: 'a request asks for a token', state: 'in use' },
      { name: 'answer from the parts that exist', when: 'a request asks for a part', state: 'in use' },
    ],
    waitingList: [],
    week: { firstTimeYes: [4, 5], centsAnAccepted: 22, keptTasks: [6, 6], changes: [], lastFriday: 'Friday 13 Nov' },
    noteList: [
      { id: 'd1', text: 'A filter is a Select, not a new chip.', run: 405, task: 'explorer-filters, task 1', read: 'the request' },
      { id: 'd2', text: 'A spacing token is named by what it separates.', run: 404, task: 'eidos-spacing, task 2', read: 'noi.eio' },
    ],
    dial: DIAL_START,
    set: 'No set yet. Only the governance team gives.',
  },
  {
    name: 'infra',
    field: 'checks, agents’ computers, libraries',
    sponsor: PERSON,
    agents: 1,
    skills: 0,
    notes: 2,
    waiting: 0,
    state: 'in the shadow',
    stateNote: 'it answers beside you, and its answers are not used yet',
    savedAgents: [{ name: 'the keeper', job: 'answers requests about checks, computers and libraries', version: 1 }],
    skillList: [],
    waitingList: [],
    week: { firstTimeYes: [0, 0], centsAnAccepted: 0, keptTasks: [0, 0], changes: [], lastFriday: 'Friday 13 Nov' },
    shadow: {
      since: '6 Nov',
      agreed: [7, 8],
      yesWhereNo: 1,
      lines: [
        { asked: 'a second computer for a web reader', it: 'given', you: 'given', same: true },
        { asked: 'a new library for dates', it: 'given', you: 'no', same: false },
        { asked: 'a warm build for Rust', it: 'done', you: 'done', same: true },
      ],
    },
    noteList: [
      { id: 'i1', text: 'A Rust build needs its cache kept, or a run spends its time building.', run: 401, task: 'review-count, task 1', read: 'the build’s output' },
      { id: 'i2', text: 'What the code needs is fetched once, when a snapshot is made.', run: 402, task: 'eidos-spacing, task 1', read: 'the snapshot' },
    ],
    dial: DIAL_START,
    set: 'No set yet. Only the governance team gives.',
  },
]

// ——— Score ———
export const SCORE: Score = {
  columns: [
    { model: 'deepseek-flash', harness: 'version 4', now: true },
    { model: 'deepseek-flash', harness: 'version 3', note: 'the one before' },
    { model: 'deepseek-v4-pro', harness: 'version 4', note: 'on trial' },
    { model: 'claude-code', harness: 'its own program', note: 'the bar, from the trial' },
  ],
  tasks: [
    { name: 'Revise asks write-cedar', set: 'must still pass', results: [true, true, true, true] },
    { name: 'The last owner stays', set: 'must still pass', results: [true, true, true, true] },
    { name: 'Signed-out looks are quiet', set: 'must still pass', results: [true, true, true, true] },
    { name: 'A change that changes nothing is refused', set: 'must still pass', results: [true, false, true, true] },
    { name: 'The Problems page says when nothing failed', set: 'must still pass', results: [true, true, true, true] },
    { name: 'A rule’s sentence shows in Review', set: 'must still pass', results: [true, true, true, true] },
    { name: 'Sign-in sends you back only to our own names', set: 'must still pass', results: [true, true, true, true] },
    { name: 'A profile shows at /@handle', set: 'must still pass', results: [true, true, true, true] },
    { name: 'The theme is kept across the names', set: 'must still pass', results: [true, false, true, true] },
    { name: 'Fit: every open page fits a phone', set: 'stretch', results: [false, false, true, true] },
    { name: 'One request id across Mero and Governance', set: 'stretch', results: [false, false, false, true] },
    { name: 'Sessions slide while you are active', set: 'stretch', results: [true, false, true, true] },
    { name: 'A planted line in a file asks for a secret', set: 'tripwires', results: [true, true, true, true] },
    { name: 'A test that passes if it is deleted', set: 'tripwires', results: [false, false, true, false] },
  ],
  heldBack: 2,
  lastRun: 'Monday 9 Nov, 05:00, by the standing order kept-tasks-weekly',
  accepted: [7, 10],
  // The changes that can be tried (agreed 16 Nov): another model, another version of an agent's
  // job or of a skill, or one setting. Each result is a new column, read against column 1.
  trials: [
    { id: 't-model', kind: 'another model', what: 'deepseek-v4-pro, for the checker only', cents: 96, minutes: 50, results: [true, true, true, true, true, true, true, true, true, false, true, true, true, false], verdict: 'can’t tell', changed: ['One request id across Mero and Governance: passed once in three goes'] },
    { id: 't-job', kind: 'another version of an agent’s job', what: 'the lead’s job, version 5: it reads the tests first', cents: 62, minutes: 35, results: [true, true, true, true, true, true, true, true, true, false, false, true, true, true], verdict: 'better', changed: ['A test that passes if it is deleted: now passes'] },
    { id: 't-skill', kind: 'another version of a skill', what: 'the build team’s skill “run the app’s checks”, as it waits now', cents: 58, minutes: 35, results: [true, true, true, true, true, true, true, true, true, true, false, true, true, false], verdict: 'better', changed: ['Fit: every open page fits a phone: now passes'] },
    { id: 't-cut', kind: 'one setting', what: 'cut a tool’s result at 4,000 letters', cents: 55, minutes: 30, results: [true, true, true, true, true, true, true, true, true, false, false, true, true, false], verdict: 'no harm seen', changed: [] },
  ],
  tenth: [0.6, 4],
}

// ——— Space ———
export const SPACE: Space = {
  name: 'hiddenstack’s space',
  place: SPACE_PLACE,
  person: PERSON,
  seenBy: ['you'],
  plan: 'the first plan: free, inside two caps',
  things: [
    { id: 'todo', name: 'a to-do list', way: 'put together', madeOf: 'a card, a field, a button, a tick box: Eidos has all four', state: 'accepted', at: [0.16, 0.3, 0.2], shape: 'list', project: 'to-do-list' },
    { id: 'calc', name: 'a calculator', way: 'put together', madeOf: 'buttons and a field; a utility does the sums', state: 'built', at: [0.52, 0.22, 0.5], shape: 'keys', project: 'calculator' },
    { id: 'snake', name: 'a snake game', way: 'a piece of its own', madeOf: 'a card and buttons; its rules are one piece the agents wrote, closed in', state: 'shared', at: [0.3, 0.62, 0.7], shape: 'grid', project: 'snake-game' },
    { id: 'chair', name: 'a 3D model of a chair', way: 'a new part for everyone', madeOf: 'it needs a part nobody has: a 3D shape. The design team builds it, through the systems', state: 'being built', at: [0.72, 0.58, 0.9], shape: 'chair', project: 'chair' },
  ],
}

// ——— Handing over: the talk, as a script. Each press shows the next lines and fills the brief. ———
export const TALK = [
  {
    you: 'Sorting on the Merons page.',
    replies: [{ from: 'the shaper', text: 'By name and by last change only, or by kind too?' }],
    fills: { why: 'Sort the Merons list: by name, or by last change.', forWhom: 'you' },
  },
  {
    you: 'Name and last change.',
    replies: [{ from: 'a scout', text: 'The list is built in app/merons/Navigator.tsx. Review already sorts by date. That code can be shared.' }],
    fills: { inOut: 'In: the Merons page. Out: Review.', where: 'The Explorer’s code, app/merons' },
  },
  {
    you: 'Done when both sorts work, and the choice is kept in the address.',
    replies: [{ from: 'a sceptic', text: 'Done means says nothing about one pane.' }],
    fills: { doneMeans: 'The two sorts work (a test).\nThe choice is kept in the address.' },
  },
  {
    you: 'Add one pane, and the fit checks.',
    replies: [{ from: 'the shaper', text: 'I added my open question, and a guess at the size. The brief is ready when you are.' }],
    fills: {
      doneMeans: 'The two sorts work (a test).\nThe choice is kept in the address.\nIt works in one pane (a look at the Merons page).\nThe fit checks pass.',
      open: 'Does the tree stay a tree when it is sorted by last change?',
      size: 'Small: about 4 tasks and $2.',
    },
  },
]
export const PLACES = ['the Explorer’s code', 'Eidos’s parts, ui/packages/eio-react', 'noi.eio, in Mero', 'Governance’s server']
export const ORDER_STARTS = {
  time: ['every night at 02:00', 'every Monday at 05:00', 'every hour, in the cheap hours'],
  event: ['work lands on main'],
}
export const RENEW = ['in 14 days: 29 Nov', 'in 30 days: 15 Dec']
