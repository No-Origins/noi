import type { ReactNode } from 'react'
import { Panes } from '@noi/eio-react'
import { notHostedYet } from '../../lib/backend'
import { index, Refused, snapshot, waitingCount } from '../../lib/mero'
import { tree } from '../../lib/tree'
import { NotHostedYet } from '../NotHostedYet'
import { SignedOut } from '../SignedOut'
import { TopBar } from '../TopBar'
import { Navigator } from './Navigator'
import styles from './merons.module.css'

export const dynamic = 'force-dynamic'

export default async function MeronsLayout({ children }: { children: ReactNode }) {
  // Hosted before Mero is (20 Nov): say so plainly, with the top bar for the pages that work.
  if (notHostedYet('Mero')) return <><TopBar view="merons" /><NotHostedYet server="Mero" /></>
  // Mero answers only those Governance allows; anyone else is asked to sign in. The badge's count is
  // asked alongside, and never throws.
  let s, waiting
  try {
    ;[s, waiting] = await Promise.all([snapshot(), waitingCount()])
  } catch (e) {
    if (e instanceof Refused) return <SignedOut reason={e.message} />
    throw e
  }
  const nodes = tree(s, index(s))
  // The tree: beside the page where two panes fit, in the menu where one pane fills the window.
  const list = <Navigator nodes={nodes} />
  return (
    <>
      <TopBar view="merons" live={s.merons.length} waiting={waiting} list={list} />
      <Panes list={<div className={styles.left}>{list}</div>}>
        <div className={styles.right}>{children}</div>
      </Panes>
    </>
  )
}
