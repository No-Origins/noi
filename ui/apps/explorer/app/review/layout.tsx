import type { ReactNode } from 'react'
import { Panes } from '@noi/eio-react'
import { nextBatch, Refused, review, snapshot } from '../../lib/mero'
import { SignedOut } from '../SignedOut'
import { TopBar } from '../TopBar'
import { BatchList } from './BatchList'
import styles from '../merons/merons.module.css'

export const dynamic = 'force-dynamic'

export default async function ReviewLayout({ children }: { children: ReactNode }) {
  // Mero answers only those Governance allows; anyone else is asked to sign in.
  try {
    await snapshot()
  } catch (e) {
    if (e instanceof Refused) return <SignedOut reason={e.message} />
    throw e
  }
  const [s, r] = await Promise.all([snapshot(), review()])
  const items = r.batches.map(b => {
    const count = (state: string) => b.proposals.filter(p => p.state === state).length
    return { uid: b.uid, title: b.title, proposer: b.proposer, waiting: count('waiting'), sentBack: count('sent-back'), open: count('waiting') + count('sent-back') }
  })
  // The batches: beside the page where two panes fit, in the menu where one pane fills the window.
  const list = <BatchList batches={items} next={nextBatch(r.batches)?.uid} writable={r.writable} reviewer={r.reviewer} />
  return (
    <>
      <TopBar view="review" live={s.merons.length} waiting={items.reduce((n, b) => n + b.waiting, 0)} list={list} />
      <Panes list={<div className={styles.left}>{list}</div>}>
        <div className={styles.right}>{children}</div>
      </Panes>
    </>
  )
}
