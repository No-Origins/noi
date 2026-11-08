// Talks to Governance's server for a touch, as you. Server-side only: your sign-in is
// Governance's HttpOnly cookie, passed on from here; pages never see it.
import 'server-only'
import { cookies } from 'next/headers'

const GOVERNANCE_API = process.env.GOVERNANCE_API ?? 'http://127.0.0.1:8788'

export type Answer<T> = { ok: true; data: T } | { ok: false; error: string }

async function post<T>(path: string, body: unknown): Promise<Answer<T>> {
  const token = (await cookies()).get('noi_session')?.value
  if (!token) return { ok: false, error: 'Signed out: sign in at Governance first.' }
  try {
    const res = await fetch(`${GOVERNANCE_API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `noi_session=${token}` },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? `Governance answered ${res.status}` }
  } catch {
    return { ok: false, error: 'Governance isn’t answering. Is `noi gov serve` running?' }
  }
}

export type Target = { path: string } | { account: string }
/** WebAuthn request options in JSON, and the ceremony they belong to. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Started { ceremony: string; options: any }

/** Starts a touch for exactly this action on these places. */
export const touchStart = (action: string, targets: Target[]) => post<Started>('/api/touch/start', { action, targets })
/** Finishes it with the passkey's answer; Governance gives back the touch, good once, for a minute. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const touchFinish = (ceremony: string, credential: any) => post<{ touch: string }>('/api/touch/finish', { ceremony, credential })

async function get<T>(path: string): Promise<Answer<T>> {
  const token = (await cookies()).get('noi_session')?.value
  if (!token) return { ok: false, error: 'Signed out: sign in at Governance first.' }
  try {
    const res = await fetch(`${GOVERNANCE_API}${path}`, { headers: { cookie: `noi_session=${token}` }, cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? `Governance answered ${res.status}` }
  } catch {
    return { ok: false, error: 'Governance isn’t answering. Is `noi gov serve` running?' }
  }
}

/** Your roles, from your Profile: each role's name and where you hold it. */
export async function myRoles(): Promise<{ role: string; scope: string }[]> {
  return (await me())?.roles ?? []
}

/** You, from your Profile: your handle and your roles. Undefined when signed out. */
export async function me(): Promise<{ handle: string; roles: { role: string; scope: string }[] } | undefined> {
  const r = await get<{ handle: string; roles: { role: string; scope: string }[] }>('/api/profile')
  return r.ok ? r.data : undefined
}

export interface Account { id: string; handle: string; display_name: string; kind: string; state: string; sponsor: string | null; roles: number }
/** Every account, if you may view them (owners may). */
export async function accounts(): Promise<Answer<Account[]>> {
  const r = await get<{ accounts: Account[] }>('/api/accounts')
  return r.ok ? { ok: true, data: r.data.accounts } : r
}

/** Makes an agent, with a fresh touch for add-agent in noi. */
export const addAgentWith = (body: { touch: string; handle: string; display_name: string; purpose: string; sponsor: string; vouched_by: string }) =>
  post<{ account: string }>('/api/agents', body)
/** Grants a role in a place, with a fresh touch for grant on that account. */
export const grantWith = (body: { touch: string; handle: string; role: string; scope: string }) =>
  post<{ grant: string }>('/api/grants', body)

/** Every account's ID and handle, if you may view them (owners may). Empty otherwise. */
export async function accountNames(): Promise<Record<string, string>> {
  const r = await get<{ accounts: { id: string; handle: string }[] }>('/api/accounts')
  return r.ok ? Object.fromEntries(r.data.accounts.map(a => [a.id, a.handle])) : {}
}

/** Governance's problems, newest first, if you may view them (owners may). */
export async function governanceProblems() {
  const r = await get<{ problems: import('./mero').Problem[] }>('/api/problems?limit=100')
  return r.ok ? { ok: true as const, data: r.data.problems } : r
}
