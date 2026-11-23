import type { ReactNode } from 'react'
import { Panes } from '@noi/eio-react'
import { notHostedYet } from '../../lib/backend'
import { govProposals } from '../../lib/governance'
import { nextBatch, Refused, review, snapshot, type ReviewState, type Snapshot } from '../../lib/mero'
import { NotHostedYet } from '../NotHostedYet'
import { SignedOut } from '../SignedOut'
import { TopBar } from '../TopBar'
import { BatchList, type BatchItem } from './BatchList'
import { operationWords } from './GovProposalScreen'
import styles from '../merons/merons.module.css'

export const dynamic = 'force-dynamic'

export default async function ReviewLayout({ children }: { children: ReactNode }) {
  // Hosted before Mero is (20 Nov): say so plainly, with the top bar for the pages that work.
  if (notHostedYet('Mero')) return <><TopBar view="review" /><NotHostedYet server="Mero" /></>
  // Review is for people signed in (9 Nov, step 6): reading it is its own action, which signed out
  // you can never hold, though you may read Merons.
  let s: Snapshot, r: ReviewState
  try {
    ;[s, r] = await Promise.all([snapshot(), review()])
  } catch (e) {
    if (e instanceof Refused) return <SignedOut reason={e.message} what="Review" />
    throw e
  }
  // One Review page (step 3, decision 3): what waits in Governance shows beside Mero's batches, and
  // each is decided by the system that keeps it. Governance's list is empty when it won't say.
  const gov = await govProposals(true)
  const changes: BatchItem[] = (gov.ok ? gov.data : []).map(p => {
    const waiting = p.state === 'waiting' ? 1 : 0
    return {
      uid: p.id, href: `/review/gov/${p.id}`, governance: true, title: `${operationWords(p)}: ${p.name}`, proposer: p.proposed_by,
      waiting, sentBack: p.state === 'sent-back' ? 1 : 0, open: waiting,
    }
  })
  const batches: BatchItem[] = r.batches.map(b => {
    const count = (state: string) => b.proposals.filter(p => p.state === state).length
    return { uid: b.uid, href: `/review/${b.uid}`, title: b.title, proposer: b.proposer, waiting: count('waiting'), sentBack: count('sent-back'), open: count('waiting') + count('sent-back') }
  })
  const items = [...changes, ...batches]
  const next = nextBatch(r.batches)
  const first = next?.proposals.some(p => p.state === 'waiting') ? next.uid : (changes.findLast(c => c.waiting)?.uid ?? next?.uid)
  // The batches: beside the page where two panes fit, in the menu where one pane fills the window.
  // Governance not answering is said, not hidden (review, finding 8): changes may be waiting there.
  const govProblem = gov.ok ? undefined : `Changes to roles and rules can’t be shown: ${gov.error}`
  const list = <BatchList batches={items} next={first} writable={r.writable} reviewer={r.reviewer} problem={govProblem} />
  return (
    <>
      <TopBar view="review" live={s.merons.length} waiting={gov.ok ? items.reduce((n, b) => n + b.waiting, 0) : undefined} list={list} />
      <Panes list={<div className={styles.left}>{list}</div>}>
        <div className={styles.right}>{children}</div>
      </Panes>
    </>
  )
}
