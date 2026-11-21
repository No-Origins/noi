// Changing a role or rule on Governance's pages (agreed 9 Nov, "Where Roles and Rules Live",
// decision 2): from its newest version, for whoever may propose there. The change waits in Review.
import { notFound } from 'next/navigation'
import { mayHere, rolesAndRules } from '../../../../lib/governance'
import { origins } from '../../../../lib/where'
import { cx } from '../../../merons/parts'
import { Editor } from './Editor'
import { RoleForm } from './RoleForm'
import styles from '../../gov.module.css'
import merons from '../../../merons/merons.module.css'

export async function ChangePage({ path }: { path: string }) {
  const [at, held] = await Promise.all([origins(), rolesAndRules()])
  if (!held.ok) return <p className="eio-type-style-body">{held.error}</p>
  const v = [...held.data.roles, ...held.data.rules].find(x => x.path === path)
  if (!v) notFound()
  const [may] = await mayHere([{ action: 'propose', targets: [{ path }] }])
  const what = v.kind === 'role' ? 'role' : 'rule'
  return (
    <article className={cx(merons.view, styles.reading)}>
      <div className={styles.head}>
        <p className={cx(styles.muted, 'eio-type-style-label')}>Governance · Change a {what} · revision {v.revision}</p>
        <h1 className="eio-type-style-title">{v.name}</h1>
        <p className={cx(styles.muted, styles.mono, 'eio-type-style-mono')}>{v.path}</p>
      </div>
      {may ? (
        <RoleForm
          back={`${at.gov}/roles`}
          changing={{ path: v.path, revision: v.revision, name: v.name, definition: v.definition, responsibility: v.responsibility }}
          editor={<Editor v={v} />}
        />
      ) : (
        <p className="eio-type-style-body">You may read this {what}. Changing it needs a role that may propose in noi.gov.</p>
      )}
    </article>
  )
}
