// Talks to Mero (`noi serve`) as you. Server-side only: the browser never talks to Mero directly.
// Your sign-in is Governance's HttpOnly cookie; this server passes it to Mero, which asks
// Governance about every request. Pages never see it.
import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { errorOf, notAnswering, READ_MS, WRITE_MS } from './backend'

const MERO_URL = process.env.MERO_URL ?? 'http://127.0.0.1:8787'

/** Your sign-in, as Mero takes it. Signed out, there is none, and Mero asks as a visitor. */
async function credential(): Promise<Record<string, string>> {
  const token = (await cookies()).get('noi_session')?.value
  return token && !ended().yes ? { authorization: `Session ${token}` } : {}
}

/** Whether this request's sign-in turned out to have ended, remembered for the one render. */
const ended = cache(() => ({ yes: false }))

/** Whether this browser carries a sign-in at all. Without one there is nothing to ask as. */
async function carriesSignIn(): Promise<boolean> {
  return Boolean((await cookies()).get('noi_session')?.value)
}

/** Mero said no to whoever is asking: signed out, a sign-in that ended, or no grant. */
export class Refused extends Error {}

async function read<T>(path: string): Promise<T> {
  const headers = await credential()
  let res: Response
  try {
    res = await fetch(`${MERO_URL}${path}`, { cache: 'no-store', headers, signal: AbortSignal.timeout(READ_MS) })
  } catch {
    throw new Error(notAnswering('Mero'))
  }
  // A sign-in that ended (12 hours unused) must not close what a visitor may read (10 Nov): the
  // cookie outlives the session, so ask again as a visitor, for the rest of this render too.
  if (res.status === 401 && 'authorization' in headers) {
    ended().yes = true
    return read<T>(path)
  }
  if (res.status === 401 || res.status === 403) {
    const body = await res.json().catch(() => ({}))
    throw new Refused(body.error ?? `Mero answered ${res.status}`)
  }
  if (!res.ok) throw new Error(errorOf('Mero', res.status))
  return res.json()
}

export interface Meron {
  identity: { uid: string; path: string; name: string }
  classification: { type: string; subtype?: string | null; roles: string[] }
  semantics: { definition: string; responsibility: string }
  lifecycle: { state: 'proposed' | 'registered' | 'active' | 'deprecated' | 'retired'; release_mode: string }
  authority_scope: string
  metadata: Record<string, unknown>
  // A meron's spec is checked by its invariants; its shape depends on its kind.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any
  revision: number
  created_at: string
  updated_at: string
}

export interface Relationship {
  uid: string
  source: string
  predicate: 'contains' | 'depends-on' | 'implements' | 'represents' | 'governed-by'
  target: string
}

export interface Snapshot {
  generated_at: string
  merons: Meron[]
  relationships: Relationship[]
}

/** The whole registry, fresh on every request and read once per request. */
export const snapshot = cache(async (): Promise<Snapshot> => read<Snapshot>('/api/registry'))

/** Lookups over one snapshot. */
export function index(s: Snapshot) {
  const byPath = new Map(s.merons.map(m => [m.identity.path, m]))
  const byUid = new Map(s.merons.map(m => [m.identity.uid, m]))
  const from = (m: Meron, predicate: Relationship['predicate']) =>
    s.relationships.filter(r => r.source === m.identity.uid && r.predicate === predicate).map(r => byUid.get(r.target)!).filter(Boolean)
  const to = (m: Meron, predicate: Relationship['predicate']) =>
    s.relationships.filter(r => r.target === m.identity.uid && r.predicate === predicate).map(r => byUid.get(r.source)!).filter(Boolean)
  return { byPath, byUid, from, to }
}
export type Index = ReturnType<typeof index>

/** `noi.eio.color.text.danger` ↔ `/merons/noi/eio/color/text/danger`. */
export const hrefOf = (path: string) => `/merons/${path.split('.').join('/')}`

/** A label for the meron's kind, such as "Token · color role". */
export function kindLabel(m: Meron) {
  const type = m.classification.type[0].toUpperCase() + m.classification.type.slice(1)
  // A component's meron says which part of a package it is (Components in Mero, 17 Nov).
  if (m.classification.type === 'component' && m.spec?.part === 'shared-part') return 'Component · shared part'
  if (m.classification.type === 'component' && m.spec?.part === 'package') return 'Component · the package’s own files'
  return m.classification.subtype ? `${type} · ${m.classification.subtype.replace(/-/g, ' ')}` : type
}

/** Whether an invariant's `applies_to` covers a meron. */
export const covers = (inv: Meron, m: Meron) =>
  inv.spec.applies_to?.type === m.classification.type &&
  (inv.spec.applies_to.subtype === undefined || inv.spec.applies_to.subtype === m.classification.subtype)

/** The invariants that check a meron. */
export const invariantsFor = (s: Snapshot, m: Meron) =>
  s.merons.filter(i => i.classification.type === 'invariant' && covers(i, m))

/** One check's parameters from an invariant, such as the contrast minimums. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const checkParams = (inv: Meron | undefined, name: string): any =>
  inv?.spec.checks?.find((c: { name: string }) => c.name === name)?.params

// ——— Review ———

export type ProposalState = 'waiting' | 'sent-back' | 'approved' | 'rejected'

/** One change, exactly as proposed; approval runs this. */
export type Change =
  | { operation: 'add'; meron: NewMeron; container?: string }
  | { operation: 'update'; uid: string; expected_revision: number; meron: NewMeron; compatibility: Compatibility }
  | { operation: 'rename'; uid: string; expected_revision: number; path: string }
  | { operation: 'deprecate'; uid: string; expected_revision: number }
  | { operation: 'reinstate'; uid: string; expected_revision: number; reason: string }

export interface NewMeron {
  path: string
  name: string
  classification: Meron['classification']
  semantics: Meron['semantics']
  release_mode?: string
  authority_scope?: string | null
  metadata?: Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec?: any
}
export interface Compatibility { impact: 'non-breaking' | 'breaking' | 'unknown'; rationale: string; invariant_checks: string[]; migration_plan?: string | null }

/** A test run's result: what the change did, or why it failed. */
export type Outcome =
  | { ok: true; meron: Meron; before?: Meron; steps: string[]; checks?: { check: string; invariant: { uid: string; revision: number } }[]; invariants?: { uid: string; revision: number }[]; rechecked?: { uid: string; revision: number }[]; affected_consumers?: string[] }
  | { ok: false; error: string }

export interface Proposal {
  uid: string
  batch: string
  position: number
  change: Change
  state: ProposalState
  revision: number
  outcome: Outcome
  checked_at: string
  decided_by: string | null
  decided_at: string | null
  stale: boolean
}
export interface ProposalEvent { sequence: number; proposal: string | null; action: string; actor: string; note: string | null; occurred_at: string }
/** A batch, with the places deciding its waiting proposals asks about, and whether you may decide
 * it (asked of Governance as if you touched, unrecorded: 9 Nov, step 6). */
export interface Batch {
  uid: string; title: string; proposer: string; created_at: string; proposals: Proposal[]; events: ProposalEvent[]
  places: string[]; may_decide?: boolean
}
/** `writable`: you may decide at least one waiting batch. `reviewer`: who is signed in.
 * `touch_to_decide`: approving, sending back and rejecting need your touch. */
export interface ReviewState { writable: boolean; reviewer: string | null; touch_to_decide?: boolean; batches: Batch[] }

/** Every batch, and what you may do with them. */
export const review = cache(async (): Promise<ReviewState> => read<ReviewState>('/api/review'))

/** The batch Review opens on beside its list: the oldest one still waiting, else the newest. */
export const nextBatch = (batches: Batch[]): Batch | undefined =>
  batches.filter(b => b.proposals.some(p => p.state === 'waiting')).at(-1) ?? batches[0]

/** Only the roles and rules, under noi.gov (9 Nov, step 6): what Governance's pages need, without
 * the whole registry. Read once per request. */
export const govSnapshot = cache(async (): Promise<Snapshot> => read<Snapshot>('/api/registry?under=noi.gov'))

/** How many proposals wait for a decision: Review's badge, as Mero counts it, without every batch
 * (9 Nov, step 6). Undefined when Mero won't or can't say: signed out, Review is closed. */
export async function waitingCount(): Promise<number | undefined> {
  // Signed out, Review is closed: don't ask, so a visitor's page view leaves nothing behind (10 Nov).
  if (!(await carriesSignIn())) return undefined
  try {
    return (await read<{ waiting: number }>('/api/review/waiting')).waiting
  } catch {
    return undefined
  }
}

/** Sends a write to Mero. Returns its answer, or the error Mero gave in words. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function send(path: string, body: unknown): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${MERO_URL}/api/review/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await credential()) },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(WRITE_MS),
    })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, data } : { ok: false, error: errorOf('Mero', res.status, data.error) }
  } catch {
    return { ok: false, error: notAnswering('Mero') }
  }
}

/** What deciding on these proposals asks Governance about: the action, exactly which places, and,
 * with the decision, what else the touch names: the decision and each proposal at its revision (9
 * Nov, step 7). A touch is for these and nothing else. `wholeBatches` is approving every waiting
 * proposal given. */
export async function places(proposals: string[], wholeBatches: boolean, decision?: string) {
  return send('places', { proposals, whole_batches: wholeBatches, ...(decision ? { decision } : {}) }) as Promise<
    { ok: true; data: { action: string; targets: { path: string }[]; about?: unknown } } | { ok: false; error: string }
  >
}

/** A short name for a proposal's change, from the change itself or the meron it targets. */
export function changeName(idx: Index, change: Change) {
  if (change.operation === 'add' || change.operation === 'update') return change.meron.name
  return idx.byUid.get(change.uid)?.identity.name ?? change.uid
}
export function changePath(idx: Index, change: Change) {
  if (change.operation === 'add' || change.operation === 'update') return change.meron.path
  return idx.byUid.get(change.uid)?.identity.path ?? change.uid
}

/** One failure a server kept for the Problems page (agreed 8 Nov). */
export interface Problem { seq: number; at: string; request_id: string; method: string; path: string; status: number; what: string }

/** Mero's problems, newest first, if you may view them (owners may). */
export async function meroProblems(): Promise<{ ok: true; data: Problem[] } | { ok: false; error: string }> {
  try {
    return { ok: true, data: (await read<{ problems: Problem[] }>('/api/problems?limit=100')).problems }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
