'use server'
// Governance's writes for agents and roles, from the one app's plain Governance page (agreed 8 Nov,
// until the layout). Each goes to Governance with your sign-in and a fresh touch for exactly that
// action; Governance checks you are an owner and records it.
import { revalidatePath } from 'next/cache'
import { accounts, addAgentWith, grantWith, me, touchStart, type Started, type Target } from '../../lib/governance'

export interface FormState { error?: string; done?: string }
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

/** Starts a touch for adding an agent (in noi), or for granting a role to this account. */
export async function askGovTouch(action: 'add-agent' | 'grant', handle?: string): Promise<({ ok: true; what: string } & Started) | { ok: false; error: string }> {
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
    what = `granting a role to ${handle}`
  }
  const started = await touchStart(action, [target])
  return started.ok ? { ok: true, what, ...started.data } : started
}

/** Makes an agent. You sponsor it: you answer for what it does. */
export async function addAgent(_: FormState, form: FormData): Promise<FormState> {
  const you = await me()
  if (!you) return { error: 'Signed out: sign in at Governance first.' }
  const handle = text(form, 'handle')
  const r = await addAgentWith({
    touch: text(form, 'touch'),
    handle,
    display_name: text(form, 'display_name'),
    purpose: text(form, 'purpose'),
    sponsor: you.handle,
    vouched_by: text(form, 'vouched_by'),
  })
  revalidatePath('/gov')
  return r.ok ? { done: `${handle} is an agent now, sponsored by you. Give it a role below.` } : { error: r.error }
}

/** Grants a role in a place. */
export async function grantRole(_: FormState, form: FormData): Promise<FormState> {
  const handle = text(form, 'handle')
  const role = text(form, 'role')
  const scope = text(form, 'scope')
  const r = await grantWith({ touch: text(form, 'touch'), handle, role, scope })
  revalidatePath('/gov')
  return r.ok ? { done: `${handle} holds ${role.split('.').pop()} in ${scope} now.` } : { error: r.error }
}
