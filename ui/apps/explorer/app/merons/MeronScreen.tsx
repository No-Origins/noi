// One meron, or one group of merons, by path; /merons shows the root.
import { notFound } from 'next/navigation'
import { hrefOf, index, kindLabel, snapshot, type Index, type Meron, type Snapshot } from '../../lib/mero'
import { tree, type TreeNode } from '../../lib/tree'
import { Connections, cx, Header, Record } from './parts'
import { ChangeForm } from './ChangeForm'
import { cedarKind } from '../../lib/cedar'
import { mayHere } from '../../lib/governance'
import { ChildCards, KindView } from './views'
import { Stage3D } from '@noi/eio-3d'
import { Button } from '@noi/eio-react'
import { worldScene } from '../../lib/world'
import styles from './merons.module.css'

/** `path` is a meron or group path; without one, the root. `change` opens the Change form. Roles and
 * rules are proposed on Governance's pages since step 3, not here. */
export async function MeronScreen({ path, change }: { path?: string; change?: boolean }) {
  const s = await snapshot()
  const idx = index(s)
  const nodes = tree(s, idx)
  const node = path === undefined ? nodes.find(n => n.parent === null) : nodes.find(n => n.path === path)
  if (!node) notFound()
  const parent = node.parent ? nodes.find(n => n.path === node.parent) : undefined
  const m = idx.byPath.get(node.path)
  // Change only where Governance would let you propose (9 Nov, step 6): one question, as if you
  // touched, unrecorded. Governance decides again when you send. A role or rule meron is Mero's
  // record from before roles and rules moved into Governance (step 3): it is changed there.
  const changeable = m && m.lifecycle.state === 'active' && !cedarKind(m)
  const [writable = false] = changeable ? await mayHere([{ action: 'propose', targets: [{ path: m.identity.path }] }]) : []
  if (!m) return <GroupView idx={idx} nodes={nodes} node={node} parent={parent} />
  return writable && change
    ? <ChangeView m={m} />
    : <MeronView s={s} idx={idx} nodes={nodes} m={m} writable={writable} />
}

function GroupView({ idx, nodes, node, parent }: { idx: Index; nodes: TreeNode[]; node: TreeNode; parent?: TreeNode }) {
  return (
    <article className={styles.view}>
      <Header eyebrow="Group" title={node.name} path={node.path} />
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
  const change = writable
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

function ChangeView({ m }: { m: Meron }) {
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
      />
    </article>
  )
}
