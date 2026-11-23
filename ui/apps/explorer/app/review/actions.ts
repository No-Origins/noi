'use server'
// Review's writes. They run on the Explorer's server and go to Mero with your sign-in; Mero asks
// Governance whether you may. Approving, sending back and rejecting also need your touch (step 4).
// Next checks that each call comes from this app's own pages before running it.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { touchFinish, touchStart, type Started } from '../../lib/governance'
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

/** The touch a decision carries, if the form has one. */
const touchOf = (form: FormData) => text(form, 'touch') || undefined

export async function approve(_: ActionState, form: FormData): Promise<ActionState> {
  const proposals = form.getAll('proposal').map(String)
  const result = await send('approve', { proposals, touch: touchOf(form) })
  revalidatePath('/', 'layout')
  if (!result.ok) return { error: result.error }
  const n = result.data.approved.length
  // Eidos's files come with the branch (part B, decision 5): Mero writes nothing after an approval.
  // Roles and rules are Governance's own since step 3: nothing is copied after one either.
  return { done: `Approved ${n} change${n === 1 ? '' : 's'}.` }
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
  const result = await send('batches', { title: `Change ${m.identity.name}`, note: rationale, changes: [change] })
  if (!result.ok) return { error: result.error }
  revalidatePath('/', 'layout')
  redirect(`/review/${result.data.uid}?from=${encodeURIComponent(hrefOf(m.identity.path))}`)
}
