// Talks to Mero (`noi serve`) as you. Server-side only: the browser never talks to Mero directly.
// Your sign-in is Governance's HttpOnly cookie; this server passes it to Mero, which asks
// Governance about every request. Pages never see it.
import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'

const MERO_URL = process.env.MERO_URL ?? 'http://127.0.0.1:8787'
/** Where you sign in. Open the Explorer at localhost too, so the browser sends the same cookie. */
export const GOVERNANCE_URL = process.env.GOVERNANCE_URL ?? 'http://localhost:8788'

/** Your sign-in, as Mero takes it. Signed out, there is none, and Mero asks as a visitor. */
async function credential(): Promise<Record<string, string>> {
  const token = (await cookies()).get('noi_session')?.value
  return token ? { authorization: `Session ${token}` } : {}
}

/** Mero said no to whoever is asking: signed out, a sign-in that ended, or no grant. */
export class Refused extends Error {}

async function read<T>(path: string): Promise<T> {
  const res = await fetch(`${MERO_URL}${path}`, { cache: 'no-store', headers: await credential() })
  if (res.status === 401 || res.status === 403) {
    const body = await res.json().catch(() => ({}))
    throw new Refused(body.error ?? `Mero answered ${res.status}`)
  }
  if (!res.ok) throw new Error(`Mero answered ${res.status}. Is \`noi serve\` running?`)
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
export interface Batch { uid: string; title: string; proposer: string; created_at: string; proposals: Proposal[]; events: ProposalEvent[] }
/** `writable`: signed in, so you can propose. `touch_to_decide`: approving, sending back and
 * rejecting need your touch, which comes to the Explorer in step 4. */
export interface ReviewState { writable: boolean; reviewer: string | null; touch_to_decide?: boolean; batches: Batch[] }

/** Every batch, and what you may do with them. */
export const review = cache(async (): Promise<ReviewState> => read<ReviewState>('/api/review'))

/** The batch Review opens on beside its list: the oldest one still waiting, else the newest. */
export const nextBatch = (batches: Batch[]): Batch | undefined =>
  batches.filter(b => b.proposals.some(p => p.state === 'waiting')).at(-1) ?? batches[0]

/** How many proposals wait for a decision; undefined when Mero cannot say. */
export async function waitingCount(): Promise<number | undefined> {
  try {
    return (await review()).batches.flatMap(b => b.proposals).filter(p => p.state === 'waiting').length
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
    })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? `Mero answered ${res.status}` }
  } catch {
    return { ok: false, error: 'Mero isn’t answering. Is `noi serve` running?' }
  }
}

/** What deciding on these proposals asks Governance about: the action, and exactly which places. A
 * touch is for these and nothing else. `wholeBatches` is approving every waiting proposal given. */
export async function places(proposals: string[], wholeBatches: boolean) {
  return send('places', { proposals, whole_batches: wholeBatches }) as Promise<
    { ok: true; data: { action: string; targets: { path: string }[] } } | { ok: false; error: string }
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
