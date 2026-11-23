'use server'
// The editor asks Governance for the Cedar its form says, on the Explorer's server with your sign-in
// (Mero did until roles and rules moved into Governance, step 3).
import { writeCedar } from '../../lib/cedar'
import type { RoleForm, RuleForm } from '../../lib/sentence'

export async function cedarFor(kind: 'rule' | 'role', form: RuleForm | RoleForm): Promise<{ ok: true; cedar: string } | { ok: false; error: string }> {
  return kind === 'rule' ? writeCedar('rule', form as RuleForm) : writeCedar('role', form as RoleForm)
}
