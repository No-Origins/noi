// gov.no-origins.localhost:3000/roles/new (step 3): a new role, proposed on Governance's pages and
// approved in Review by an owner, with a touch. For whoever may propose in noi.gov.roles.
import { mayHere } from '../../../../../lib/governance'
import { origins } from '../../../../../lib/where'
import { cx } from '../../../../merons/parts'
import { Editor } from '../Editor'
import { RoleForm } from '../RoleForm'
import styles from '../../../gov.module.css'
import merons from '../../../../merons/merons.module.css'

export const metadata = { title: 'New role · Governance' }

export default async function NewRole() {
  const [at, [may]] = await Promise.all([origins(), mayHere([{ action: 'propose', targets: [{ path: 'noi.gov.roles' }] }])])
  return (
    <article className={cx(merons.view, styles.reading)}>
      <div className={styles.head}>
        <p className={cx(styles.muted, 'eio-type-style-label')}>Governance · New role</p>
        <h1 className="eio-type-style-title">New role</h1>
        <p className={cx(styles.muted, 'eio-type-style-body')}>One system, and what it lets you do there. Who holds it, and where, are set when an owner gives it to someone.</p>
      </div>
      {may
        ? <RoleForm back={`${at.gov}/roles`} editor={<Editor />} />
        : <p className="eio-type-style-body">Proposing a role needs a role that may propose in noi.gov.</p>}
    </article>
  )
}
