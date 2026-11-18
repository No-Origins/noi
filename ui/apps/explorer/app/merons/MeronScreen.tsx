// One meron, or one group of merons, by path; /merons shows the root.
import { notFound } from 'next/navigation'
import { hrefOf, index, kindLabel, snapshot, type Index, type Meron, type Snapshot } from '../../lib/mero'
import { tree, type TreeNode } from '../../lib/tree'
import { Connections, cx, Header, Record } from './parts'
import { ChangeForm } from './ChangeForm'
import { NewRoleForm } from './NewRoleForm'
import { CedarEditor } from './CedarEditor'
import { cedarKind, readCedar, rolesIn } from '../../lib/cedar'
import { accountNames, mayHere, myRoles } from '../../lib/governance'
import { ChildCards, KindView } from './views'
import { Stage3D } from '@noi/eio-3d'
import { Button } from '@noi/eio-react'
import { worldScene } from '../../lib/world'
import styles from './merons.module.css'

/** `path` is a meron or group path; without one, the root. `change` opens the Change form; `fresh`,
 * on the Roles group, the New role form. */
export async function MeronScreen({ path, change, fresh }: { path?: string; change?: boolean; fresh?: boolean }) {
  const s = await snapshot()
  const idx = index(s)
  const nodes = tree(s, idx)
  const node = path === undefined ? nodes.find(n => n.parent === null) : nodes.find(n => n.path === path)
  if (!node) notFound()
  const parent = node.parent ? nodes.find(n => n.path === node.parent) : undefined
  const m = idx.byPath.get(node.path)
  // Change and New role only where Governance would let you propose (9 Nov, step 6): one question,
  // as if you touched, unrecorded. Governance decides again when you send.
  const place = m ? m.identity.path : node.path === ROLES ? ROLES : undefined
  const [writable = false] = place ? await mayHere([{ action: 'propose', targets: [{ path: place }] }]) : []
  if (!m && node.path === ROLES && writable && fresh) return <NewRoleView nodes={nodes} />
  if (!m) return <GroupView idx={idx} nodes={nodes} node={node} parent={parent} writable={writable} />
  return writable && change
    ? <ChangeView nodes={nodes} s={s} m={m} />
    : <MeronView s={s} idx={idx} nodes={nodes} m={m} writable={writable} />
}

const ROLES = 'noi.gov.roles'

function GroupView({ idx, nodes, node, parent, writable }: { idx: Index; nodes: TreeNode[]; node: TreeNode; parent?: TreeNode; writable: boolean }) {
  // The Roles group is where a new role starts.
  const add = node.path === ROLES && writable
    ? <Button href={`${hrefOf(ROLES)}?new`} icon="plus">New role</Button>
    : undefined
  return (
    <article className={styles.view}>
      <Header eyebrow="Group" title={node.name} path={node.path} action={add} />
      <p className={cx(styles.lead, 'eio-type-style-body')}>
        {node.count} merons{parent ? ` in ${parent.name}` : ''}. A group is a part of the path, not a meron of its own.
      </p>
      <WorldModel idx={idx} path={node.path} />
      <ChildCards idx={idx} nodes={nodes} parent={node.path} />
    </article>
  )
}

function MeronView({ s, idx, nodes, m, writable }: { s: Snapshot; idx: Index; nodes: TreeNode[]; m: Meron; writable: boolean }) {
  // Change opens the form; what you send goes to Review, like an agent's proposal.
  const change = writable && m.lifecycle.state === 'active'
    ? <Button href={`${hrefOf(m.identity.path)}?change`} icon="pen">Change</Button>
    : undefined
  return (
    <article className={styles.view}>
      <Header eyebrow={kindLabel(m)} title={m.identity.name} path={m.identity.path} m={m} action={change} />
      <div className={styles.lead}>
        <p className="eio-type-style-body">{m.semantics.definition}</p>
        {m.semantics.responsibility && <p className={cx(styles.muted, 'eio-type-style-body')}>{m.semantics.responsibility}</p>}
      </div>
      <WorldModel idx={idx} path={m.identity.path} />
      <KindView s={s} idx={idx} nodes={nodes} m={m} />
      <Connections s={s} idx={idx} m={m} />
      <Record idx={idx} m={m} />
    </article>
  )
}

/** An element of the 3D world, drawn from what Mero holds (17 Nov): whole on its group's page, with one
 * measure marked on each of its numbers' pages. Nothing for other pages. */
function WorldModel({ idx, path }: { idx: Index; path: string }) {
  const model = worldScene(idx, path)
  return model ? <Stage3D scene={model.scene} label={model.label} /> : null
}

/** The role and rule editor for this meron, or nothing when it isn't one or Mero can't read it
 * (then the Change form keeps its JSON box). */
async function editorFor(s: Snapshot, nodes: TreeNode[], m: Meron) {
  const kind = cedarKind(m)
  if (!kind) return undefined
  const [read, mine] = await Promise.all([readCedar([m]), myRoles()])
  if (!read) return undefined
  const reading = read.readings[0]
  const owner = mine.some(r => r.role === 'owner')
  const accounts = owner ? await accountNames() : {}
  const { cedar, ...rest } = m.spec
  return (
    <CedarEditor
      kind={kind}
      form={'form' in reading ? reading.form : undefined}
      byHand={'by_hand' in reading ? reading.by_hand : undefined}
      cedar={cedar}
      rest={rest}
      verbs={read.verbs}
      roles={rolesIn(s)}
      accounts={Object.entries(accounts).map(([id, handle]) => ({ id, handle }))}
      places={nodes.map(n => n.path)}
      owner={owner}
    />
  )
}

/** A new role, with the role editor: one system, its verbs. */
async function NewRoleView({ nodes }: { nodes: TreeNode[] }) {
  const [read, mine] = await Promise.all([readCedar([]), myRoles()])
  const form = { system: 'mero', pick: 'these' as const, verbs: ['read', 'propose'] }
  return (
    <article className={styles.view}>
      <Header eyebrow="New · Rule · role" title="New role" path={`${ROLES}.…`} />
      <NewRoleForm
        back={hrefOf(ROLES)}
        editor={read && (
          <CedarEditor kind="role" form={form} cedar="" rest={{}} verbs={read.verbs} roles={[]} accounts={[]} places={nodes.map(n => n.path)} owner={mine.some(r => r.role === 'owner')} fresh pickSystem />
        )}
      />
    </article>
  )
}

async function ChangeView({ s, nodes, m }: { s: Snapshot; nodes: TreeNode[]; m: Meron }) {
  const spec = await editorFor(s, nodes, m)
  return (
    <article className={styles.view}>
      <Header eyebrow={`Change · ${kindLabel(m)}`} title={m.identity.name} path={m.identity.path} m={m} />
      <ChangeForm
        back={hrefOf(m.identity.path)}
        m={{
          uid: m.identity.uid,
          revision: m.revision,
          name: m.identity.name,
          definition: m.semantics.definition,
          responsibility: m.semantics.responsibility,
          spec: JSON.stringify(m.spec, null, 2),
        }}
        spec={spec}
      />
    </article>
  )
}
