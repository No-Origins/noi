// Talks to Governance's server for a touch, as you. Server-side only: your sign-in is
// Governance's HttpOnly cookie, passed on from here; pages never see it.
import 'server-only'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { errorOf, notAnswering, READ_MS, WRITE_MS } from './backend'
import { DOMAIN, isLocal } from './hosts'
import { SESSION, sessionFrom, visitorOf, type Session } from './session'

const GOVERNANCE_API = process.env.GOVERNANCE_API ?? 'http://127.0.0.1:8788'

export type Answer<T> = { ok: true; data: T } | { ok: false; error: string }

const SIGNED_OUT = 'Signed out: sign in first.'
/** What the app says when Governance doesn't answer at all, as opposed to answering no. */
export const NOT_ANSWERING = notAnswering('Governance')

/** The one way this server asks Governance (found 9 Nov: it was written out five times): JSON in
    and out, never cached, never longer than a time limit, Governance's own words when it says no
    (plain ones when it fails), and the session cookies it sets.
    With a body it posts; without one it gets. */
async function call<T>(path: string, headers: Record<string, string>, body?: unknown): Promise<(Answer<T> & { ok: true; setCookies: string[] }) | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GOVERNANCE_API}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(body === undefined ? READ_MS : WRITE_MS),
    })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, data, setCookies: res.headers.getSetCookie() } : { ok: false, error: errorOf('Governance', res.status, data.error) }
  } catch {
    return { ok: false, error: NOT_ANSWERING }
  }
}

/** Your session, as Governance takes it. Undefined when you're signed out. */
async function yours(): Promise<Record<string, string> | undefined> {
  const token = (await cookies()).get(SESSION)?.value
  return token ? { cookie: `${SESSION}=${token}` } : undefined
}

/** Asks as you; signed out, it says so without asking. */
async function asYou<T>(path: string, body?: unknown, more: Record<string, string> = {}): Promise<Answer<T>> {
  const session = await yours()
  if (!session) return { ok: false, error: SIGNED_OUT }
  const r = await call<T>(path, { ...more, ...session }, body)
  return r.ok ? { ok: true, data: r.data } : r
}
/** Your browser's name for itself, so Governance can say where something was done. */
async function browser(): Promise<Record<string, string>> {
  return { 'user-agent': (await headers()).get('user-agent') ?? 'a browser' }
}
const post = <T>(path: string, body: unknown) => asYou<T>(path, body)
const get = <T>(path: string) => asYou<T>(path)

export type Target = { path: string } | { account: string }
/** WebAuthn request options in JSON, and the ceremony they belong to. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Started { ceremony: string; options: any }

/** What Governance answers before anyone is signed in, and the session it makes, if it makes one. */
export type Opened<T> = { ok: true; data: T; session?: Session } | { ok: false; error: string }

/** Asks Governance with no sign-in: to start or finish signing in, or a one-time link. Your
    browser's name for itself goes along, so your Profile can say where you signed in. */
async function opening<T>(path: string, body: unknown): Promise<Opened<T>> {
  const h = await headers()
  // Who is visiting, for Governance's limits on starts and sign-ups from one address: only from a
  // header the hosting service sets (see visitorOf), never one the visitor can write.
  const visitor = visitorOf(name => h.get(name), process.env.NOI_VISITOR_HEADER)
  const r = await call<T>(path, { ...(await browser()), ...(visitor ? { 'x-noi-visitor': visitor } : {}) }, body)
  return r.ok ? { ok: true, data: r.data, session: sessionFrom(r.setCookies) } : r
}

/** Starts signing in (agreed 9 Nov): with no handle, Governance asks for any passkey of No Origins
    and the one picked says whose it is; with a handle, for one of that person's. */
export const signInStart = (handle?: string) => opening<Started>('/api/sign-in/start', handle ? { handle } : {})
/** Finishes it with the passkey's answer; Governance makes a session if it checks out. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signInFinish = (ceremony: string, credential: any) => opening<{ ok: true }>('/api/sign-in/finish', { ceremony, credential })
/** Starts a sign-up (agreed 8 Nov): Governance emails a link to confirm, or says it can't. */
export const signUpStart = (email: string, handle: string, display_name: string) =>
  opening<{ ok: true; said: string }>('/api/sign-up/start', { email, handle, display_name })
/** A lost passkey: Governance emails a link to the account with that email, if there is one. */
export const lostStart = (email: string) => opening<{ ok: true; said: string }>('/api/lost/start', { email })
/** Starts adding a first passkey, with a one-time link's token. */
export const linkStart = (token: string) => opening<Started>('/api/link/start', { token })
/** Keeps the new passkey's public half, under the name you gave it, and signs you in. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const linkFinish = (ceremony: string, credential: any, name: string) => opening<{ ok: true }>('/api/link/finish', { ceremony, credential, name })

/** The sign-in cookie belongs to the base name, so gov, mero and eidos share it (agreed 8 Nov):
    HttpOnly, and HTTPS-only once the base name is a real one. SameSite lax (9 Nov): Safari treats
    gov and mero under .localhost as two sites and kept a strict cookie back when signing in sent
    you on to mero. Lax still keeps it off other sites' background requests and forms; the app's
    forms also check where they come from. */
const where = { domain: DOMAIN, path: '/', httpOnly: true, sameSite: 'lax', secure: !isLocal() } as const

/** Gives your browser the session Governance made, for as long as Governance made it. */
export async function keep(session: Session) {
  ;(await cookies()).set(SESSION, session.token, { ...where, maxAge: session.maxAge })
}

/** Who is signed in on this browser: their handle and name. Undefined when no one is. */
export async function signedIn(): Promise<{ handle: string; display_name: string } | undefined> {
  const r = await get<{ handle: string; display_name: string } | null>('/api/me')
  return r.ok ? (r.data ?? undefined) : undefined
}

/** Ends your sign-in at Governance, then forgets it here. If Governance doesn't answer, you stay
    signed in rather than seem signed out while the session goes on. */
export async function signOut(): Promise<Answer<null>> {
  if (await yours()) {
    const r = await post<{ ok: true }>('/api/sign-out', {})
    if (!r.ok) return r
  }
  ;(await cookies()).set(SESSION, '', { ...where, maxAge: 0 })
  return { ok: true, data: null }
}

/** "What may I do here?" (agreed 9 Nov, step 6): yes or no for each question, as if confirmed with a
    touch (you will be when you act), and not recorded. Signed out, it asks as a visitor. Anything
    but an answer reads as no; the real question is asked when you act. */
export async function mayHere(questions: { action: string; targets: Target[] }[]): Promise<boolean[]> {
  if (!questions.length) return []
  const r = await call<{ answers: boolean[] }>('/api/may/preview', (await yours()) ?? {}, { questions })
  return r.ok && r.data.answers.length === questions.length ? r.data.answers : questions.map(() => false)
}

/** Starts a touch for exactly this action on these places, and what else it names (9 Nov, step 7):
    the decision and each proposal, the role and place, the new agent. */
export const touchStart = (action: string, targets: Target[], about?: unknown) =>
  post<Started>('/api/touch/start', about === undefined ? { action, targets } : { action, targets, about })
/** Finishes it with the passkey's answer; Governance gives back the touch, good once, for a minute. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const touchFinish = (ceremony: string, credential: any) => post<{ touch: string }>('/api/touch/finish', { ceremony, credential })

/** Your roles, from your Profile: each role's name and where you hold it. */
export async function myRoles(): Promise<{ role: string; scope: string }[]> {
  return (await me())?.roles ?? []
}

/** You, from your Profile: your handle and your roles. Undefined when signed out. */
export async function me(): Promise<{ handle: string; roles: { role: string; scope: string }[] } | undefined> {
  const r = await profile()
  return r.ok ? r.data : undefined
}

/** An account as Accounts lists it (owners): the roles held and where, and when it last signed in
    (an agent: its last run). */
export interface Account {
  id: string; handle: string; display_name: string; kind: string; state: string; since: string; sponsor: string | null
  roles: number; held: { role: string; path: string; scope: string }[]; last_signed_in: string | null
}
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

/** A role someone holds: which, where, since when and from whom. */
export interface Held { grant: string; role: string; path: string; scope: string; granted_at: string; granted_by: string | null }
/** A change to who may do what, from Governance's record (9 Nov). */
export interface Change {
  seq: number; at: string; kind: string; by: string | null; whom: string | null
  role: string | null; scope: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: Record<string, any>
  /** For a copy of Mero's roles and rules: what got a new revision, as "noi.gov.roles.observer@5". */
  changed?: string[]
}
/** What Governance's home shows whoever is looking (agreed 9 Nov). */
export interface Dashboard {
  you: null | { handle: string; display_name: string; kind: string; roles: Held[] }
  /** Whether you may view Governance's data (owners): the rest comes only then. */
  view?: boolean
  held?: Record<string, number>
  changes?: Change[]
  attention?: { waiting: string[]; problems_today: number }
}

/** Governance's home for whoever is looking: signed out, it asks with no sign-in. */
export async function dashboard(): Promise<Answer<Dashboard>> {
  const r = await call<Dashboard>('/api/dashboard', (await yours()) ?? {})
  return r.ok ? { ok: true, data: r.data } : r
}

/** Someone's public profile (agreed 9 Nov): handle, name, person or agent, since when; for an agent,
    also its sponsor and what it is for (agreed 9 Nov, step 5). */
export interface Person { handle: string; display_name: string; kind: string; since: string; sponsor?: string | null; purpose?: string | null }
export async function person(handle: string): Promise<Answer<Person>> {
  const r = await call<Person>(`/api/people/${encodeURIComponent(handle)}`, {})
  return r.ok ? { ok: true, data: r.data } : r
}

/** One account as owners see it: its roles, passkeys by name, sign-ins and an agent's runs. */
export interface AccountView extends Person {
  id: string; state: string; made_by: string | null; sponsor: string | null; purpose: string | null; vouched_by: string | null
  roles: Held[]
  passkeys: { name: string; added_at: string; last_used_at: string | null }[]
  sessions: { device: string; started_at: string; expires_at: string }[]
  runs: { run: string; started_by: string | null; vouched_by: string; issued_at: string; expires_at: string; live: boolean }[]
}
export const accountOf = (handle: string) => get<AccountView>(`/api/accounts/${encodeURIComponent(handle)}`)

/** Governance's problems, newest first, if you may view them (owners may). */
export async function governanceProblems() {
  const r = await get<{ problems: import('./mero').Problem[] }>('/api/problems?limit=100')
  return r.ok ? { ok: true as const, data: r.data.problems } : r
}

// ——— Your account (agreed 9 Nov, step 4): yours alone, and every change with a touch ———

/** A change to your own account. Governance makes the touch for exactly it: this passkey, that
    sign-in. */
export type OwnChange =
  | { change: 'add-passkey' }
  | { change: 'remove-passkey'; passkey: string }
  | { change: 'end-sign-in'; session: string }
  | { change: 'end-other-sign-ins' }
  /** The new address goes with the touch (9 Nov, step 7); Governance keeps only its fingerprint. */
  | { change: 'change-email'; email: string }

/** Your account as Governance shows it to you: your email, roles, passkeys by name, and where
    you're signed in, each sign-in with the passkey that made it when Governance knows. */
export interface Profile {
  account: string; handle: string; display_name: string; kind: string; state: string; since: string
  email: string | null
  roles: Held[]
  passkeys: { id: string; name: string; added_at: string; last_used_at: string | null }[]
  sessions: { id: string; device: string; started_at: string; expires_at: string; this: boolean; passkey: string | null; passkey_name: string | null }[]
}
/** Read once per request: the layout and the page share it. */
export const profile = cache(() => get<Profile>('/api/profile'))

/** Starts a touch for one change to your account. */
export const ownTouchStart = (change: OwnChange) => post<Started>('/api/account/touch/start', change)
/** With that touch, options for your browser to make another passkey. */
export const passkeyAddStart = (touch: string) => post<Started>('/api/account/passkeys/start', { touch })
/** Keeps the passkey your browser made; Governance tells your email, naming this browser. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const passkeyAddFinish = async (ceremony: string, credential: any, name: string) =>
  asYou<{ passkey: string }>('/api/account/passkeys/finish', { ceremony, credential, name }, await browser())
export const removePasskeyWith = (touch: string, passkey: string) =>
  post<{ sign_ins_ended: number }>('/api/account/passkeys/remove', { touch, passkey })
/** Ends one of your other sign-ins, or, with no session, all of them. */
export const endSignInsWith = (touch: string, session?: string) =>
  post<{ ended: number }>('/api/account/sign-ins/end', session ? { touch, session } : { touch })
/** Sends a link to a new email; the answer is the same whether or not it has an account. */
export const emailChangeStart = (touch: string, email: string) =>
  post<{ ok: true; said: string }>('/api/account/email/start', { touch, email })
/** The link sent to a new email: it needs no sign-in, as the link proves the address. */
export const emailChangeFinish = (token: string) => opening<{ ok: true }>('/api/account/email/finish', { token })

// ——— Roles and the record (agreed 9 Nov, step 5) ———

/** Who holds each role, where and since when, if you may view them (owners may). */
export interface RoleHeld { path: string; name: string; state: string; revision: number; holders: { handle: string; kind: string; scope: string; granted_at: string }[] }
export async function rolesHeld(): Promise<Answer<RoleHeld[]>> {
  const r = await get<{ roles: RoleHeld[] }>('/api/roles')
  return r.ok ? { ok: true, data: r.data.roles } : r
}

/** One entry of the record, with what its words need: who, to whom, which role where, and why a
    refusal was a refusal. */
export interface RecordEntry extends Change { who: string | null; action: string | null; places: string[]; allowed: boolean; reason: string }
/** The record page's views: everything (Governance no longer records an allowed read), changes,
    sign-ins, or refusals; one person's part; older than an entry. */
export interface RecordQuery { show?: 'everything' | 'changes' | 'sign-ins' | 'refused'; who?: string; before?: number }
export async function recordPage(q: RecordQuery): Promise<Answer<{ entries: RecordEntry[]; next: number | null }>> {
  const params = new URLSearchParams()
  if (q.show) params.set('show', q.show)
  if (q.who) params.set('who', q.who)
  if (q.before) params.set('before', String(q.before))
  return get(`/api/record?${params}`)
}

/** Ends one of someone's roles, with a fresh touch for end-grant on their account (owners). */
export const endGrantWith = (touch: string, grant: string) => post<{ ok: true }>('/api/grants/end', { touch, grant })
/** Ends every sign-in of someone's, and an agent's runs, with a fresh touch for end-session (owners). */
export const endSessionsWith = (touch: string, handle: string) => post<{ ended: number }>('/api/sessions/end', { touch, handle })

// ——— Roles and rules, kept by Governance (step 3, agreed 9 Nov: "Where Roles and Rules Live") ———

/** One version of a role or rule, as Governance keeps it: every version is kept. */
export interface Version {
  seq: number; path: string; revision: number; kind: 'role' | 'rule'
  name: string; definition: string; responsibility: string
  system: string | null; cedar: string
  state: 'proposed' | 'registered' | 'active' | 'deprecated' | 'retired'
  at: string
  /** Approved in Governance, moved from Mero with its history, written at setup, or by the recovery command. */
  came: 'approved' | 'moved' | 'setup' | 'recovery'
  approved_by: string | null; why: string | null; proposal: string | null
  /** For a version moved from Mero: Mero's ID, the path then, who and what. */
  mero: { uid: string; path: string; by: string; action: string; reference: string } | null
  /** A role's verbs. */
  verbs?: string[]
}
/** Every role and rule in force, and how current they are (the newest version's number). */
export interface RolesAndRules { roles: Version[]; rules: Version[]; version: number | null }

/** Every role and rule in force, for whoever may read them: signed in, or a visitor where visitors
    hold reading. Read once per request. */
export const rolesAndRules = cache(async (): Promise<Answer<RolesAndRules>> => {
  const r = await call<RolesAndRules>('/api/roles-and-rules', (await yours()) ?? {})
  return r.ok ? { ok: true, data: r.data } : r
})

/** The roles in force, by the name rules use (`owner`) and their own (`Owner`). Empty when
    Governance won't say. */
export async function roleNames(): Promise<{ id: string; name: string }[]> {
  const r = await rolesAndRules()
  return r.ok ? r.data.roles.map(v => ({ id: v.path.slice('noi.gov.roles.'.length), name: v.name })) : []
}

/** Every version of one role or rule, newest first. */
export async function versionsOf(path: string): Promise<Answer<Version[]>> {
  const r = await call<{ versions: Version[] }>(`/api/roles-and-rules/versions?path=${encodeURIComponent(path)}`, (await yours()) ?? {})
  return r.ok ? { ok: true, data: r.data.versions } : r
}

/** What a proposal does to a role or rule. */
export type Operation = 'add' | 'change' | 'set-aside' | 'bring-back' | 'retire'
/** A change to roles and rules, waiting in Governance or decided there (decision 2). */
export interface GovProposal {
  id: string; path: string; kind: 'role' | 'rule'; operation: Operation; base_revision: number | null
  name: string; definition: string; responsibility: string; system: string | null; cedar: string
  by_hand: boolean; why: string
  proposed_by: string; proposed_at: string
  state: 'waiting' | 'approved' | 'sent-back' | 'rejected'
  decided_by: string | null; decided_at: string | null; note: string | null
  /** The version it changes, as it is now. */
  before: Version | null
  /** The role or rule changed since: it can only be sent back or rejected. */
  stale: boolean
}

/** Governance's proposals, newest first, for Review (decision 3): every one, or only what waits.
    Signed out, Review is closed, so nothing is asked. */
export async function govProposals(all = true): Promise<Answer<GovProposal[]>> {
  if (!(await yours())) return { ok: false, error: SIGNED_OUT }
  const r = await get<{ proposals: GovProposal[] }>(`/api/proposals${all ? '?all=true' : ''}`)
  return r.ok ? { ok: true, data: r.data.proposals } : r
}
/** How many proposals wait in Governance, for Review's badge. Undefined when Governance won't say. */
export async function govWaiting(): Promise<number | undefined> {
  const r = await govProposals(false)
  return r.ok ? r.data.length : undefined
}
export const govProposal = (id: string) => get<GovProposal>(`/api/proposals/${encodeURIComponent(id)}`)

/** What a proposer sends: a new role or rule, or a change, says all of what it will say. */
export interface Draft {
  operation: Operation; path: string; base_revision?: number
  name?: string; definition?: string; responsibility?: string; system?: string; cedar?: string
  why: string
}
/** Proposes a change to roles and rules, with a touch when its Cedar is written by hand. */
export const proposeToGovernance = (proposal: Draft, touch?: string) =>
  post<GovProposal>('/api/proposals', touch ? { proposal, touch } : { proposal })

/** How a proposal is decided, as in Mero's Review. */
export type GovDecision = 'approve' | 'send-back' | 'reject'
/** What a touch to decide a proposal names beyond its place: the decision and the proposal. */
export const decideAbout = (decision: GovDecision, proposal: string) => ({ decision, proposals: [proposal] })
/** Approves, sends back or rejects a proposal, with the touch made for exactly that. */
export const decideInGovernance = (proposal: string, decision: GovDecision, note: string, touch: string) =>
  post<{ proposal: string; decision: GovDecision; revision?: number; state?: string; ended_grants?: number }>(
    '/api/proposals/decide', { proposal, decision, note, touch })

/** Reads roles' and rules' Cedar into the form, and every system's verbs (signed in only). */
export const cedarRead = (items: unknown[]) =>
  post<{ readings: import('./sentence').Reading<import('./sentence').AnyReadingForm>[]; verbs: Record<string, string[]> }>('/api/cedar/read', { items })
/** The Cedar a form says, checked as Governance checks it when it is proposed. */
export const cedarWrite = (kind: 'rule' | 'role', form: unknown) => post<{ cedar: string }>('/api/cedar/write', { kind, form })
