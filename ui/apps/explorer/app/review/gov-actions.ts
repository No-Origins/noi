'use server'
// Deciding a change to roles and rules from Review (agreed 9 Nov, "Where Roles and Rules Live",
// decision 3): one Review page shows what waits in Mero and in Governance, and each is decided by the
// system that keeps it. These go to Governance with your sign-in and a touch made for exactly that
// decision on that proposal (as approving in Mero names its proposals, 9 Nov, step 7).
import { revalidatePath } from 'next/cache'
import { decideAbout, decideInGovernance, touchStart, type GovDecision } from '../../lib/governance'
import type { Touching } from '../gov/touch'
import type { ActionState } from './actions'

const WORDS: Record<GovDecision, string> = { approve: 'approving', 'send-back': 'sending back', reject: 'rejecting' }

/** Starts the touch for one decision on one proposal, on its place. */
export async function askGovDecisionTouch(proposal: string, path: string, decision: GovDecision): Promise<Touching> {
  const started = await touchStart('review', [{ path }], decideAbout(decision, proposal))
  return started.ok ? { ok: true, what: `${WORDS[decision]} this change to ${path}`, ...started.data } : started
}

/** Approves, sends back or rejects, with that touch. Sending back and rejecting need a note. */
export async function decideGov(_: ActionState, form: FormData): Promise<ActionState> {
  const text = (key: string) => String(form.get(key) ?? '').trim()
  const decision = text('decision') as GovDecision
  const r = await decideInGovernance(text('proposal'), decision, text('note'), text('touch'))
  revalidatePath('/', 'layout')
  if (!r.ok) return { error: r.error }
  if (decision === 'approve') {
    const ended = r.data.ended_grants ? ` ${r.data.ended_grants === 1 ? 'One grant' : `${r.data.ended_grants} grants`} of it ended.` : ''
    return { done: `Approved: revision ${r.data.revision}, ${r.data.state === 'retired' ? 'retired' : r.data.state === 'deprecated' ? 'set aside' : 'in force'} from the next request.${ended}` }
  }
  return { done: decision === 'send-back' ? 'Sent back to its proposer, with your note.' : 'Rejected. It stays on record with your note.' }
}
