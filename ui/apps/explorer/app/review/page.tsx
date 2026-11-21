// Review's own address: the next batch to decide, marked in the list of batches. With nothing
// waiting in Mero, the oldest change waiting in Governance (step 3); then the newest batch.
import { govProposals } from '../../lib/governance'
import { nextBatch, review } from '../../lib/mero'
import { BatchScreen } from './BatchScreen'
import { GovProposalScreen } from './GovProposalScreen'
import styles from './review.module.css'

export const metadata = { title: 'Review · Explorer' }

export default async function Review() {
  const [r, gov] = await Promise.all([review(), govProposals(false)])
  const next = nextBatch(r.batches)
  const waitingInGov = gov.ok ? gov.data.at(-1) : undefined
  if (next?.proposals.some(p => p.state === 'waiting')) return <BatchScreen batch={next.uid} />
  if (waitingInGov) return <GovProposalScreen id={waitingInGov.id} />
  if (next) return <BatchScreen batch={next.uid} />
  return (
    <div className={styles.empty}>
      <h1 className="eio-type-style-title">{gov.ok ? 'Nothing to review' : 'Nothing from Mero to review'}</h1>
      <p className="eio-type-style-body">
        Changes arrive here when an agent proposes them with <code className="eio-type-style-mono">noi propose</code>, when you press
        Change on a meron, or when a role or rule is proposed on Governance’s Roles page. Nothing changes until it is approved here.
      </p>
      {!gov.ok && (
        <p className="eio-type-style-body" role="alert">Changes to roles and rules can’t be shown: {gov.error}</p>
      )}
    </div>
  )
}
