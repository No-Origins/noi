// The role and rule editor on Governance's pages (agreed 8 Nov; Governance's since step 3): the form
// Governance read from the Cedar, every system's verbs, the roles by name, accounts for owners, and
// the places in Mero a rule may name (the app asks Mero for those; Governance never does).
import { CedarEditor } from '../../../merons/CedarEditor'
import { readCedar, versionText } from '../../../../lib/cedar'
import { accountNames, myRoles, roleNames, type Version } from '../../../../lib/governance'
import { index, snapshot } from '../../../../lib/mero'
import { tree } from '../../../../lib/tree'

/** Every place in Mero, for a rule's "where"; just noi when Mero can't say. */
async function placesInMero(): Promise<string[]> {
  try {
    const s = await snapshot()
    return tree(s, index(s)).map(n => n.path)
  } catch {
    return ['noi']
  }
}

/** The editor for this version of a role or rule; for a new role with none. */
export async function Editor({ v }: { v?: Version }) {
  const [read, mine, roles, places] = await Promise.all([readCedar(v ? [versionText(v)] : []), myRoles(), roleNames(), placesInMero()])
  if (!read) {
    return <p className="eio-type-style-body">Governance couldn’t read the Cedar just now, so the form can’t open. Try again in a moment.</p>
  }
  const owner = mine.some(r => r.role === 'owner')
  if (!v) {
    const form = { system: 'mero', pick: 'these' as const, verbs: ['read', 'propose'] }
    return <CedarEditor kind="role" form={form} cedar="" rest={{}} verbs={read.verbs} roles={[]} accounts={[]} places={places} owner={owner} fresh pickSystem />
  }
  const reading = read.readings[0]
  const accounts = owner ? await accountNames() : {}
  return (
    <CedarEditor
      kind={v.kind}
      form={'form' in reading ? reading.form : undefined}
      byHand={'by_hand' in reading ? reading.by_hand : undefined}
      cedar={v.cedar}
      rest={v.kind === 'role' ? { system: v.system } : {}}
      verbs={read.verbs}
      roles={roles}
      accounts={Object.entries(accounts).map(([id, handle]) => ({ id, handle }))}
      places={places}
      owner={owner}
    />
  )
}
