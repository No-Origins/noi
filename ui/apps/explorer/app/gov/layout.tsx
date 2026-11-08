import type { ReactNode } from 'react'
import { Panes } from '@noi/eio-react'
import { Refused, snapshot, waitingCount } from '../../lib/mero'
import { SignedOut } from '../SignedOut'
import { TopBar } from '../TopBar'
import styles from '../merons/merons.module.css'

export const dynamic = 'force-dynamic'

// Governance's plain page in the one app (agreed 8 Nov): agents and roles, until the layout.
export default async function GovLayout({ children }: { children: ReactNode }) {
  try {
    await snapshot()
  } catch (e) {
    if (e instanceof Refused) return <SignedOut reason={e.message} />
    throw e
  }
  const [s, waiting] = await Promise.all([snapshot(), waitingCount()])
  const list = (
    <nav className={styles.left} aria-label="Governance">
      <a className={[styles.chip, 'eio-type-style-label'].join(' ')} href="/gov#agent">Add an agent</a>
      <a className={[styles.chip, 'eio-type-style-label'].join(' ')} href="/gov#grant">Give a role</a>
      <a className={[styles.chip, 'eio-type-style-label'].join(' ')} href="/gov#accounts">Accounts</a>
      <a className={[styles.chip, 'eio-type-style-label'].join(' ')} href="/gov/problems">Problems</a>
      <a className={[styles.chip, 'eio-type-style-label'].join(' ')} href="/merons/noi/gov/roles?new">New role</a>
    </nav>
  )
  return (
    <>
      <TopBar view="gov" live={s.merons.length} waiting={waiting} list={list} />
      <Panes list={list}>
        <div className={styles.right}>{children}</div>
      </Panes>
    </>
  )
}
