// Review's own address: the next batch to decide, marked in the list of batches.
import { nextBatch, review } from '../../lib/mero'
import { BatchScreen } from './BatchScreen'
import styles from './review.module.css'

export const metadata = { title: 'Review · Explorer' }

export default async function Review() {
  const next = nextBatch((await review()).batches)
  if (next) return <BatchScreen batch={next.uid} />
  return (
    <div className={styles.empty}>
      <h1 className="eio-type-style-title">Nothing to review</h1>
      <p className="eio-type-style-body">
        Changes arrive here when an agent proposes them with <code className="eio-type-style-mono">noi propose</code>, or when you press
        Change on a meron. Nothing reaches Mero until it is approved here.
      </p>
    </div>
  )
}
