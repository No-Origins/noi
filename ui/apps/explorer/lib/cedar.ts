// Roles and rules as a form: Governance reads Cedar into the five parts and writes it back (agreed 8
// Nov; Mero did, until roles and rules moved into Governance in step 3). Server-side only, with your
// sign-in, like every other call to Governance.
import 'server-only'
import { cedarRead, cedarWrite, type Version } from './governance'
import type { Meron } from './mero'
import type { Reading, RoleForm, RuleForm } from './sentence'

/** Every system's verbs, for the form's checkboxes. */
export type Verbs = Record<string, string[]>

/** A role's or rule's Cedar, as the form reads it. */
export type CedarText = { kind: 'role'; system: string; cedar: string } | { kind: 'rule'; cedar: string }

/** Whether a meron is one of the role or rule merons Mero kept before the move, whose Cedar the
 * form may show. */
export const cedarKind = (m: { classification: Meron['classification']; spec?: Meron['spec'] }): 'role' | 'rule' | undefined =>
  m.classification.type === 'rule' && typeof m.spec?.cedar === 'string'
    ? (m.classification.subtype === 'role' ? 'role' : 'rule')
    : undefined

/** The Cedar of a role or rule meron, as the form reads it. */
export const meronText = (m: { classification: Meron['classification']; spec?: Meron['spec'] }): CedarText =>
  cedarKind(m) === 'role'
    ? { kind: 'role', system: m.spec.system, cedar: m.spec.cedar }
    : { kind: 'rule', cedar: m.spec?.cedar }

/** The Cedar of a role or rule Governance keeps, as the form reads it. */
export const versionText = (v: Pick<Version, 'kind' | 'system' | 'cedar'>): CedarText =>
  v.kind === 'role' ? { kind: 'role', system: v.system ?? '', cedar: v.cedar } : { kind: 'rule', cedar: v.cedar }

export type AnyReading = Reading<RuleForm> | Reading<RoleForm>

/** Reads these roles and rules into the form. Undefined when Governance can't say (signed out, or
 * down): pages then show the Cedar alone. */
export async function readCedar(items: CedarText[]): Promise<{ readings: AnyReading[]; verbs: Verbs } | undefined> {
  const r = await cedarRead(items)
  return r.ok ? (r.data as { readings: AnyReading[]; verbs: Verbs }) : undefined
}

/** The Cedar a form says, checked as Governance checks it when it is proposed. */
export async function writeCedar(kind: 'rule', form: RuleForm): Promise<{ ok: true; cedar: string } | { ok: false; error: string }>
export async function writeCedar(kind: 'role', form: RoleForm): Promise<{ ok: true; cedar: string } | { ok: false; error: string }>
export async function writeCedar(kind: 'rule' | 'role', form: RuleForm | RoleForm) {
  const r = await cedarWrite(kind, form)
  return r.ok ? { ok: true as const, cedar: r.data.cedar } : r
}
