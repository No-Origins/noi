import { DesignBar } from '../../DesignBar'
import { CedarEditor } from '../../../merons/CedarEditor'
import { Sentence } from '../../../merons/Sentence'
import { ruleSentence, type RuleForm } from '../../../../lib/sentence'
import styles from '../../designs.module.css'

// The real role and rule editor (agreed and built 8 Nov), with sample data: the fresh-touch rule.
// On the real Change page Mero reads the stored Cedar into this form and writes it back as you
// click; here, signed out, a click only shows what Mero answers then.
const VERBS = {
  mero: ['read', 'propose', 'update', 'evolve-breaking', 'rename', 'transition', 'relate', 'unrelate', 'release', 'transition-release', 'review'],
  governance: ['invite', 'add-agent', 'change-account', 'remove-passkey', 'grant', 'end-grant', 'end-session', 'view'],
}
const FRESH_TOUCH: RuleForm = {
  effect: 'forbid',
  who: 'anyone',
  doing: [
    { system: 'mero', pick: 'these', verbs: ['review'] },
    { system: 'governance', pick: 'every', except: ['view'] },
  ],
  where: 'everywhere',
  unless: ['fresh-touch'],
}
const BEFORE: RuleForm = { ...FRESH_TOUCH, doing: [FRESH_TOUCH.doing[0], { system: 'governance', pick: 'every', except: [] }] }
const CEDAR = `forbid (
  principal,
  action in [Action::"review",
             Action::"governance"],
  resource
) unless { context.fresh_signature || action == Action::"view" };`
const ROLES = [{ id: 'maintainer', name: 'Maintainer' }, { id: 'owner', name: 'Owner' }]

export default function RuleDesign() {
  return (
    <>
      <DesignBar system="gov" view="Roles" />
      <main className={styles.reading}>
        <section className={styles.section}>
          <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>Change · Rule · policy</p>
          <h1 className="eio-type-style-title">A fresh touch to approve or change access</h1>
        </section>
        <section className={styles.section}>
          <h2 className="eio-type-style-heading">What it says</h2>
          <CedarEditor kind="rule" form={FRESH_TOUCH} cedar={CEDAR} rest={{}} verbs={VERBS} roles={ROLES} accounts={[]} places={['noi', 'noi.gov', 'noi.eio', 'noi.inv']} owner />
        </section>
        <section className={styles.section}>
          <h2 className="eio-type-style-heading">In Review: what approving says</h2>
          <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>Before</p>
          <Sentence segs={ruleSentence(BEFORE, {}, FRESH_TOUCH, 'removed')} />
          <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>After</p>
          <Sentence segs={ruleSentence(FRESH_TOUCH, {}, BEFORE, 'added')} />
        </section>
      </main>
    </>
  )
}
