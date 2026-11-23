// A role or rule meron in words, above its Cedar (agreed 8 Nov): the merons Mero kept before roles
// and rules moved to Governance (step 3). Governance reads the Cedar into the five parts; when the
// form can't show it, it is written by hand and reads as Cedar alone.
import { cedarKind, meronText, readCedar } from '../../lib/cedar'
import { roleNames } from '../../lib/governance'
import type { Meron } from '../../lib/mero'
import { roleSentence, ruleSentence, type RoleForm, type RuleForm } from '../../lib/sentence'
import { Sentence } from './Sentence'
import styles from './cedar.module.css'

export async function CedarWords({ m }: { m: Meron }) {
  const kind = cedarKind(m)
  const read = kind ? await readCedar([meronText(m)]) : undefined
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
  const names = { roles: Object.fromEntries((await roleNames()).map(x => [x.id, x.name])) }
  return (
    <div className={styles.side}>
      {label}
      <Sentence segs={kind === 'rule' ? ruleSentence(r.form as RuleForm, names) : roleSentence(r.form as RoleForm)} />
    </div>
  )
}
