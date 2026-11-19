import type { ReactNode } from 'react'
import { Panes } from '@noi/eio-react'
import { notHostedYet } from '../../../lib/backend'
import { NOT_ANSWERING, profile } from '../../../lib/governance'
import { waitingCount } from '../../../lib/mero'
import { NotHostedYet } from '../../NotHostedYet'
import { SignedOut } from '../../SignedOut'
import { TopBar } from '../../TopBar'
import { origins } from '../../../lib/where'
import { GovNav } from '../GovNav'
import styles from '../../merons/merons.module.css'

export const dynamic = 'force-dynamic'

// Governance's pages for signed-in people (Roles, Accounts, the record, Problems; the home is open
// to everyone), with Governance's own list beside them (9 Nov). Who you are comes from Governance,
// not Mero, so these work with Mero down, Problems too (9 Nov, step 6).
export default async function GovLayout({ children }: { children: ReactNode }) {
  // Hosted before Governance is (20 Nov): nobody can sign in yet, so say so plainly.
  if (notHostedYet('Governance')) return <><TopBar view="gov" /><NotHostedYet server="Governance" /></>
  const [p, waiting, at] = await Promise.all([profile(), waitingCount(), origins()])
  if (!p.ok) {
    if (p.error === NOT_ANSWERING) throw new Error(p.error)
    return <SignedOut reason={p.error} what="Governance" />
  }
  const you = p.data
  const owner = you.roles.some(r => r.role === 'owner')
  const list = <GovNav at={at} owner={owner} handle={you.handle} />
  return (
    <>
      <TopBar view="gov" waiting={waiting} list={list} />
      <Panes list={<div className={styles.left}>{list}</div>}>
        <div className={styles.right}>{children}</div>
      </Panes>
    </>
  )
}
