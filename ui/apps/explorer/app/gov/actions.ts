'use server'
// Governance's writes for agents and roles: adding an agent from Accounts; giving a role, ending
// one, and ending someone's sign-ins from the person's profile (9 Nov, steps 3 and 5). Each goes to
// Governance with your sign-in and a fresh touch for exactly that action; Governance checks you are
// an owner and records it.
import { revalidatePath } from 'next/cache'
import { accounts, addAgentWith, endGrantWith, endSessionsWith, grantWith, me, touchStart, type Answer, type Target } from '../../lib/governance'
import type { Touching } from './touch'

export interface FormState { error?: string; done?: string }
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

const FOR: Record<'grant' | 'end-grant' | 'end-session', (handle: string) => string> = {
  grant: h => `granting a role to ${h}`,
  'end-grant': h => `ending one of ${h}’s roles`,
  'end-session': h => `ending ${h}’s sign-ins`,
}

/** Starts a touch for adding an agent (in noi), or for granting, ending a role or ending sign-ins
    on this account. `about` is what else it names (9 Nov, step 7), as Governance will ask it: the
    new agent's handle, the role and place, the grant. */
export async function askGovTouch(
  action: 'add-agent' | 'grant' | 'end-grant' | 'end-session',
  handle?: string,
  about?: Record<string, string>,
): Promise<Touching> {
  let target: Target
  let what: string
  if (action === 'add-agent') {
    target = { path: 'noi' }
    what = 'adding an agent, in noi'
  } else {
    const list = await accounts()
    if (!list.ok) return list
    const account = list.data.find(a => a.handle === handle)
    if (!account) return { ok: false, error: `No account has the handle ${handle}.` }
    target = { account: account.id }
    what = FOR[action](account.handle)
  }
  if (action === 'grant' && about?.role) what = `giving ${about.role.split('.').pop()} in ${about.scope} to ${handle}`
  if (action === 'add-agent' && about?.handle) what = `adding the agent ${about.handle}, in noi`
  const started = await touchStart(action, [target], about)
  return started.ok ? { ok: true, what, ...started.data } : started
}

/** Makes an agent. You sponsor it: you answer for what it does. */
export async function addAgent(_: FormState, form: FormData): Promise<FormState> {
  const you = await me()
  if (!you) return { error: 'Signed out: sign in first.' }
  const handle = text(form, 'handle')
  const r = await addAgentWith({
    touch: text(form, 'touch'),
    handle,
    display_name: text(form, 'display_name'),
    purpose: text(form, 'purpose'),
    sponsor: you.handle,
    vouched_by: text(form, 'vouched_by'),
  })
  revalidatePath('/gov/accounts')
  return r.ok ? { done: `${handle} is an agent now, sponsored by you. Give it a role on its profile, at @${handle}.` } : { error: r.error }
}

/** Grants a role in a place. */
export async function grantRole(_: FormState, form: FormData): Promise<FormState> {
  const handle = text(form, 'handle')
  const role = text(form, 'role')
  const scope = text(form, 'scope')
  const r = await grantWith({ touch: text(form, 'touch'), handle, role, scope })
  revalidatePath(`/at/${handle}`)
  return r.ok ? { done: `${handle} holds ${role.split('.').pop()} in ${scope} now.` } : { error: r.error }
}

/** Ends one of this person's roles (agreed 9 Nov, step 5). */
export async function endRole(touch: string, grant: string, handle: string): Promise<Answer<null>> {
  const r = await endGrantWith(touch, grant)
  if (!r.ok) return r
  revalidatePath(`/at/${handle}`)
  return { ok: true, data: null }
}

/** Ends every sign-in of this person's, and an agent's runs (agreed 9 Nov, step 5). */
export async function endTheirSignIns(touch: string, handle: string): Promise<Answer<number>> {
  const r = await endSessionsWith(touch, handle)
  if (!r.ok) return r
  revalidatePath(`/at/${handle}`)
  return { ok: true, data: r.data.ended }
}
