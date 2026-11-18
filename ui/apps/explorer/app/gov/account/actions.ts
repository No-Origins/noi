'use server'
// Your account's changes (agreed 9 Nov, step 4). Each first asks Governance for a touch for exactly
// that change, then sends the change with your sign-in and that touch. Nothing here reaches anyone
// else's account: Governance takes the account from your sign-in.
import { revalidatePath } from 'next/cache'
import {
  emailChangeStart,
  endSignInsWith,
  ownTouchStart,
  passkeyAddFinish,
  passkeyAddStart,
  removePasskeyWith,
  type Answer,
  type OwnChange,
  type Started,
} from '../../../lib/governance'
import type { Touching } from '../touch'

const WHAT: Record<OwnChange['change'], string> = {
  'add-passkey': 'adding a passkey to your account',
  'remove-passkey': 'removing that passkey',
  'end-sign-in': 'ending that sign-in',
  'end-other-sign-ins': 'ending your other sign-ins',
  'change-email': 'changing your email',
}

/** Opens a touch prompt for one change to your account. */
export async function askOwnTouch(change: OwnChange): Promise<Touching> {
  const r = await ownTouchStart(change)
  return r.ok ? { ok: true, what: WHAT[change.change], ...r.data } : r
}

/** Your account's page shows the change once it is made. */
async function changed<T>(r: Answer<T>): Promise<Answer<T>> {
  if (r.ok) revalidatePath('/gov/account')
  return r
}

export async function startAddPasskey(touch: string): Promise<Answer<Started>> {
  return passkeyAddStart(touch)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function finishAddPasskey(ceremony: string, credential: any, name: string) {
  return changed(await passkeyAddFinish(ceremony, credential, name.trim()))
}

export async function removePasskey(touch: string, passkey: string) {
  return changed(await removePasskeyWith(touch, passkey))
}

/** Ends one of your other sign-ins, or, with no session, all of them. */
export async function endSignIns(touch: string, session?: string) {
  return changed(await endSignInsWith(touch, session))
}

/** Sends a link to a new email. The answer is the same whether or not that email has an account. */
export async function changeEmail(touch: string, email: string): Promise<Answer<string>> {
  const r = await emailChangeStart(touch, email.trim())
  return r.ok ? { ok: true, data: r.data.said } : r
}
