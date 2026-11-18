// Roles and rules as a form: Mero reads Cedar into the five parts and writes it back (agreed 8
// Nov). Server-side only, with your sign-in, like every other call to Mero.
import 'server-only'
import { cookies } from 'next/headers'
import { errorOf, notAnswering, READ_MS } from './backend'
import type { Meron, Snapshot } from './mero'
import type { Reading, RoleForm, RuleForm } from './sentence'

const MERO_URL = process.env.MERO_URL ?? 'http://127.0.0.1:8787'

async function post<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = (await cookies()).get('noi_session')?.value
  try {
    const res = await fetch(`${MERO_URL}/api/cedar/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Session ${token}` } : {}) },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(READ_MS),
    })
    const data = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, data } : { ok: false, error: errorOf('Mero', res.status, data.error) }
  } catch {
    return { ok: false, error: notAnswering('Mero') }
  }
}

/** The roles in Mero, by the name rules use (`owner`) and their own (`Owner`). */
export const rolesIn = (s: Snapshot) => s.merons
  .filter(r => r.identity.path.startsWith('noi.gov.roles.') && r.lifecycle.state === 'active')
  .map(r => ({ id: r.identity.path.slice('noi.gov.roles.'.length), name: r.identity.name }))

/** Every system's verbs, for the form's checkboxes. */
export type Verbs = Record<string, string[]>

/** Whether a meron is a role or a rule whose Cedar the form may show. */
export const cedarKind = (m: { classification: Meron['classification']; spec?: Meron['spec'] }): 'role' | 'rule' | undefined =>
  m.classification.type === 'rule' && typeof m.spec?.cedar === 'string'
    ? (m.classification.subtype === 'role' ? 'role' : 'rule')
    : undefined

export type AnyReading = Reading<RuleForm> | Reading<RoleForm>

/** Reads these roles and rules into the form. Undefined when Mero can't say (signed out, or down):
 * pages then show the Cedar alone. */
export async function readCedar(merons: { classification: Meron['classification']; spec?: Meron['spec'] }[]): Promise<{ readings: AnyReading[]; verbs: Verbs } | undefined> {
  const items = merons.map(m => cedarKind(m) === 'role'
    ? { kind: 'role', system: m.spec.system, cedar: m.spec.cedar }
    : { kind: 'rule', cedar: m.spec?.cedar })
  const r = await post<{ readings: AnyReading[]; verbs: Verbs }>('read', { items })
  return r.ok ? r.data : undefined
}

/** The Cedar a form says, checked as Mero checks it when it is proposed. */
export async function writeCedar(kind: 'rule', form: RuleForm): Promise<{ ok: true; cedar: string } | { ok: false; error: string }>
export async function writeCedar(kind: 'role', form: RoleForm): Promise<{ ok: true; cedar: string } | { ok: false; error: string }>
export async function writeCedar(kind: 'rule' | 'role', form: RuleForm | RoleForm) {
  const r = await post<{ cedar: string }>('write', { kind, form })
  return r.ok ? { ok: true as const, cedar: r.data.cedar } : r
}
