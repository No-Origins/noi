'use server'
// Review's writes. They run on the Explorer's server and go to Mero with your sign-in; Mero asks
// Governance whether you may. Approving, sending back and rejecting also need your touch (step 4).
// Next checks that each call comes from this app's own pages before running it.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { touchFinish, touchStart, type Started } from '../../lib/governance'
import type { Touching } from '../gov/touch'
import { covers, hrefOf, places, send, snapshot, type Change } from '../../lib/mero'

export interface ActionState { error?: string; done?: string }

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

/** What a decision is: approving (these proposals, all together), sending back or rejecting one. */
export type Decision = 'approve' | 'send-back' | 'reject'

/** Step one of a touch: Mero says which places the decision covers, and Governance starts a touch
 * for exactly those. The browser then asks for Touch ID. */
export async function askTouch(decision: Decision, proposals: string[]): Promise<({ ok: true; places: string[] } & Started) | { ok: false; error: string }> {
  const asked = await places(proposals, decision === 'approve', decision)
  if (!asked.ok) return asked
  const started = await touchStart(asked.data.action, asked.data.targets, asked.data.about)
  if (!started.ok) return started
  return { ok: true, places: asked.data.targets.map(t => t.path), ...started.data }
}

/** Step two: the passkey's answer goes to Governance, which gives back the touch. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function finishTouch(ceremony: string, credential: any): Promise<{ ok: true; touch: string } | { ok: false; error: string }> {
  const finished = await touchFinish(ceremony, credential)
  return finished.ok ? { ok: true, touch: finished.data.touch } : finished
}

/** A touch for writing Cedar by hand, if the form has one, as a batch carries it. */
const touchIn = (form: FormData) => (text(form, 'touch') ? { touch: text(form, 'touch') } : {})

/** The touch a decision carries, if the form has one. */
const touchOf = (form: FormData) => text(form, 'touch') || undefined

export async function approve(_: ActionState, form: FormData): Promise<ActionState> {
  const proposals = form.getAll('proposal').map(String)
  const result = await send('approve', { proposals, touch: touchOf(form) })
  revalidatePath('/', 'layout')
  if (!result.ok) return { error: result.error }
  const n = result.data.approved.length
  // Eidos's files come with the branch (part B, decision 5): Mero writes nothing after an approval.
  const copied = result.data.copied
  const notes = [copied && !copied.error ? 'Governance copied the roles and rules again.' : '']
  return {
    done: `Approved ${n} change${n === 1 ? '' : 's'}. ${notes.filter(Boolean).join(' ')}`.trim(),
    error: copied?.error,
  }
}

export async function sendBack(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await send('send-back', { proposal: text(form, 'proposal'), note: text(form, 'note'), touch: touchOf(form) })
  revalidatePath('/', 'layout')
  return result.ok ? { done: 'Sent back to its proposer.' } : { error: result.error }
}

export async function reject(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await send('reject', { proposal: text(form, 'proposal'), note: text(form, 'note'), touch: touchOf(form) })
  revalidatePath('/', 'layout')
  return result.ok ? { done: 'Rejected. It stays on record with your note.' } : { error: result.error }
}

/** Your own change to a meron: a proposal like an agent's, sent to Review. */
export async function proposeChange(_: ActionState, form: FormData): Promise<ActionState> {
  const s = await snapshot()
  const m = s.merons.find(x => x.identity.uid === text(form, 'uid'))
  if (!m) return { error: 'That meron is no longer in Mero.' }
  // The role and rule editor says when its Cedar isn't ready or isn't right.
  const specError = text(form, 'spec_error')
  if (specError) return { error: specError }
  let spec: unknown
  try {
    spec = JSON.parse(text(form, 'spec') || '{}')
  } catch (e) {
    return { error: `The spec is not valid JSON: ${(e as Error).message}` }
  }
  const rationale = text(form, 'rationale')
  if (!rationale) return { error: 'Say why, so Review has a reason to read.' }
  const breaking = text(form, 'impact') === 'breaking'
  const plan = text(form, 'plan')
  if (breaking && !plan) return { error: 'A change that may break something needs a plan for what reads it.' }
  // The invariants that cover this meron: Mero runs them on the change, here and again on approval.
  const invariants = s.merons
    .filter(i => i.classification.type === 'invariant' && covers(i, m))
    .map(i => `${i.identity.path}@${i.revision}`)
  const change: Change = {
    operation: 'update',
    uid: m.identity.uid,
    expected_revision: Number(text(form, 'revision')),
    meron: {
      path: m.identity.path,
      name: text(form, 'name'),
      classification: m.classification,
      semantics: { definition: text(form, 'definition'), responsibility: text(form, 'responsibility') },
      release_mode: m.lifecycle.release_mode,
      authority_scope: m.authority_scope,
      metadata: m.metadata,
      spec,
    },
    compatibility: {
      impact: breaking ? 'breaking' : 'non-breaking',
      rationale,
      invariant_checks: invariants.length ? invariants : ['no invariant covers this meron'],
      migration_plan: breaking ? plan : null,
    },
  }
  // With a touch when the Cedar is written by hand (step 7); Mero asks for it then.
  const result = await send('batches', { title: `Change ${m.identity.name}`, note: rationale, changes: [change], ...touchIn(form) })
  if (!result.ok) return { error: result.error }
  revalidatePath('/', 'layout')
  redirect(`/review/${result.data.uid}?from=${encodeURIComponent(hrefOf(m.identity.path))}`)
}

/** A touch for writing Cedar by hand (agreed 9 Nov, step 7): only owners may, with Touch ID, for
 * this role or rule, named by its meron or, for a new role, by its name. Mero asks for exactly this
 * when the Cedar the form didn't write is new or changed. */
export async function askCedarTouch(of: { uid: string } | { role: string }): Promise<Touching> {
  let path: string
  if ('uid' in of) {
    const m = (await snapshot()).merons.find(x => x.identity.uid === of.uid)
    if (!m) return { ok: false, error: 'No such meron.' }
    path = m.identity.path
  } else {
    const slug = slugOf(of.role)
    if (!slug) return { ok: false, error: 'Give it a name, such as Proposer.' }
    path = `noi.gov.roles.${slug}`
  }
  const started = await touchStart('write-cedar', [{ path }])
  return started.ok ? { ok: true, what: `writing the Cedar of ${path} by hand`, ...started.data } : started
}

/** A role's last name in its path, from its name: "Proposer" → proposer. */
const slugOf = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** A new role: a proposal to add it under noi.gov.roles, approved in Review by an owner. */
export async function proposeNewRole(_: ActionState, form: FormData): Promise<ActionState> {
  const specError = text(form, 'spec_error')
  if (specError) return { error: specError }
  const s = await snapshot()
  const name = text(form, 'name')
  const slug = slugOf(name)
  if (!slug) return { error: 'Give it a name, such as Proposer.' }
  const path = `noi.gov.roles.${slug}`
  if (s.merons.some(m => m.identity.path === path)) return { error: `${path} already exists. Pick another name.` }
  let spec: unknown
  try {
    spec = JSON.parse(text(form, 'spec') || '{}')
  } catch (e) {
    return { error: `The spec is not valid JSON: ${(e as Error).message}` }
  }
  const rationale = text(form, 'rationale')
  if (!rationale) return { error: 'Say why, so Review has a reason to read.' }
  // The same authority as the roles already there.
  const like = s.merons.find(m => m.identity.path.startsWith('noi.gov.roles.'))
  const change: Change = {
    operation: 'add',
    meron: {
      path,
      name,
      classification: { type: 'rule', subtype: 'role', roles: [] },
      semantics: { definition: text(form, 'definition'), responsibility: text(form, 'responsibility') },
      authority_scope: like?.authority_scope ?? null,
      metadata: {},
      spec,
    },
  }
  const result = await send('batches', { title: `New role: ${name}`, note: rationale, changes: [change], ...touchIn(form) })
  if (!result.ok) return { error: result.error }
  revalidatePath('/', 'layout')
  redirect(`/review/${result.data.uid}?from=${encodeURIComponent(hrefOf('noi.gov.roles'))}`)
}
