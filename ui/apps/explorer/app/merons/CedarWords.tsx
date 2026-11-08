// A role or rule in words, above its Cedar (agreed 8 Nov). Mero reads the Cedar into the five
// parts; when the form can't show it, it is written by hand and reads as Cedar alone.
import { cedarKind, readCedar, rolesIn } from '../../lib/cedar'
import type { Meron, Snapshot } from '../../lib/mero'
import { roleSentence, ruleSentence, type RoleForm, type RuleForm } from '../../lib/sentence'
import { Sentence } from './Sentence'
import styles from './cedar.module.css'

export async function CedarWords({ s, m }: { s: Snapshot; m: Meron }) {
  const kind = cedarKind(m)
  const read = kind ? await readCedar([m]) : undefined
  if (!kind || !read) return null
  const r = read.readings[0]
  const label = <span className={[styles.muted, 'eio-type-style-label'].join(' ')}>{'form' in r ? 'In words' : 'Written by hand'}</span>
  if ('by_hand' in r) {
    return (
      <div className={styles.side}>
        {label}
        <p className={[styles.muted, 'eio-type-style-body'].join(' ')}>The form can’t show this {kind}: {r.by_hand}. Read it as Cedar below.</p>
      </div>
    )
  }
  const names = { roles: Object.fromEntries(rolesIn(s).map(x => [x.id, x.name])) }
  return (
    <div className={styles.side}>
      {label}
      <Sentence segs={kind === 'rule' ? ruleSentence(r.form as RuleForm, names) : roleSentence(r.form as RoleForm)} />
    </div>
  )
}
