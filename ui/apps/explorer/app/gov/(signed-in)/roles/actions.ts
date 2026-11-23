'use server'
// Proposing a role or rule on Governance's pages (agreed 9 Nov, "Where Roles and Rules Live",
// decision 2): the form writes the Cedar, an owner may write it by hand with a touch, and the
// proposal waits in Review until an owner approves it there, with a touch. It runs on the
// Explorer's server and goes to Governance with your sign-in; Governance decides who may.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { proposeToGovernance, touchStart, type Draft } from '../../../../lib/governance'
import { origins } from '../../../../lib/where'
import type { Touching } from '../../touch'

export interface FormState { error?: string }
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

/** A role's last name in its place, from its name: "Proposer" → proposer. */
const slugOf = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Where a new role goes, from its name. */
const newRolePath = (name: string) => (slugOf(name) ? `noi.gov.roles.${slugOf(name)}` : undefined)

/** A new role, or a change to a role or rule, sent to Governance; then to its page in Review. */
export async function proposeRoleOrRule(_: FormState, form: FormData): Promise<FormState> {
  // The editor says when its Cedar isn't ready or isn't right.
  const specError = text(form, 'spec_error')
  if (specError) return { error: specError }
  let spec: { system?: string; cedar?: string }
  try {
    spec = JSON.parse(text(form, 'spec') || '{}')
  } catch (e) {
    return { error: `The Cedar could not be read: ${(e as Error).message}` }
  }
  const why = text(form, 'why')
  if (!why) return { error: 'Say why, so Review has a reason to read.' }
  const fresh = text(form, 'operation') === 'add'
  const path = fresh ? newRolePath(text(form, 'name')) : text(form, 'path')
  if (!path) return { error: 'Give it a name, such as Proposer.' }
  const draft: Draft = {
    operation: fresh ? 'add' : 'change',
    path,
    ...(fresh ? {} : { base_revision: Number(text(form, 'revision')) }),
    name: text(form, 'name'),
    definition: text(form, 'definition'),
    responsibility: text(form, 'responsibility'),
    ...(path.startsWith('noi.gov.roles.') ? { system: spec.system } : {}),
    cedar: spec.cedar,
    why,
  }
  // With a touch when the Cedar is written by hand (step 7); Governance asks for it then.
  const r = await proposeToGovernance(draft, text(form, 'touch') || undefined)
  if (!r.ok) return { error: r.error }
  revalidatePath('/', 'layout')
  const at = await origins()
  redirect(`${at.mero}/review/gov/${r.data.id}`)
}

/** A touch for writing Cedar by hand (agreed 9 Nov, step 7): only owners may, with Touch ID, for
 * this role or rule, named by its place or, for a new role, by its name. Governance asks for
 * exactly this when the Cedar the form didn't write is new or changed. */
export async function askWriteCedarTouch(of: { path: string } | { name: string }): Promise<Touching> {
  const path = 'path' in of ? of.path : newRolePath(of.name)
  if (!path) return { ok: false, error: 'Give it a name, such as Proposer.' }
  const started = await touchStart('write-cedar', [{ path }])
  return started.ok ? { ok: true, what: `writing the Cedar of ${path} by hand`, ...started.data } : started
}
