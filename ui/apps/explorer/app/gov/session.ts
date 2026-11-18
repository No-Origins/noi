'use server'
// Signing in, adding your first passkey and signing out, on Governance's pages in the one app
// (agreed 8 Nov). The app's server asks Governance's API; Governance checks the passkey and makes
// the session; the app hands its cookie to your browser as Governance made it.
import { emailChangeFinish, keep, linkFinish, linkStart, lostStart, signInFinish, signInStart, signOut, signUpStart, type Answer, type Opened, type Started } from '../../lib/governance'

type Done = { ok: true } | { ok: false; error: string }

/** Settles a finish: keeps the session Governance made, or says why there is none. */
async function settle(r: Opened<unknown>): Promise<Done> {
  if (!r.ok) return r
  if (!r.session) return { ok: false, error: 'Governance said yes but made no session. Try again.' }
  await keep(r.session)
  return { ok: true }
}

/** Starts signing in: with no handle the browser offers your passkeys; with one, only that person's. */
export async function startSignIn(handle?: string): Promise<Answer<Started>> {
  const r = await signInStart(handle?.trim() || undefined)
  return r.ok ? { ok: true, data: r.data } : r
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function finishSignIn(ceremony: string, credential: any): Promise<Done> {
  return settle(await signInFinish(ceremony, credential))
}

export async function startLink(token: string): Promise<Answer<Started>> {
  const r = await linkStart(token)
  return r.ok ? { ok: true, data: r.data } : r
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function finishLink(ceremony: string, credential: any, name: string): Promise<Done> {
  return settle(await linkFinish(ceremony, credential, name.trim()))
}

/** A sign-up: the answer is the same whether or not the email has an account. */
export async function startSignUp(email: string, handle: string, name: string): Promise<Answer<string>> {
  const r = await signUpStart(email.trim(), handle.trim().toLowerCase(), name.trim())
  return r.ok ? { ok: true, data: r.data.said } : r
}

/** A lost passkey: the same answer whether or not the email has an account. */
export async function startLost(email: string): Promise<Answer<string>> {
  const r = await lostStart(email.trim())
  return r.ok ? { ok: true, data: r.data.said } : r
}

export async function leave(): Promise<Done> {
  const r = await signOut()
  return r.ok ? { ok: true } : r
}

/** The link sent to a new email (9 Nov): opening it makes that your email. No sign-in needed. */
export async function confirmNewEmail(token: string): Promise<Done> {
  const r = await emailChangeFinish(token)
  return r.ok ? { ok: true } : r
}
