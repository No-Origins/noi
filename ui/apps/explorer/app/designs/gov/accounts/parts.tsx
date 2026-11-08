import { Badge, Button, Card, Icon, TreeRow } from '@noi/eio-react'
import styles from '../../designs.module.css'

// The Accounts design's two halves, shared with the layout ideas in ../../layouts.
/** Everyone who can act in NOI: people, agents and visitors. */
export function AccountList() {
  return (
    <div className={styles.left}>
      <div className={styles.row}>
        <Button icon="plus">Invite someone</Button>
        <Button icon="agent">Add an agent</Button>
      </div>
      {[
        ['People', [['Ada', 'user', false]]],
        ['Agents', [['claude-code', 'agent', true]]],
        ['Signed out', [['Visitors', 'eye', false]]],
      ].map(([group, rows]) => (
        <div key={group as string} role="tree" aria-label={group as string} className={styles.group}>
          <h2 className={[styles.groupName, 'eio-type-style-label'].join(' ')}>{group as string}</h2>
          {(rows as [string, 'user' | 'agent' | 'eye', boolean][]).map(([name, icon, selected]) => (
            <TreeRow key={name} name={name} preview={<Icon name={icon} />} selected={selected} href="/designs/gov/accounts" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** One account's page: claude-code, the agent. */
export function AgentPage() {
  return (
        <div className={styles.right}>
          <div className={styles.head}>
            <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>Agent · sponsored by Ada · since 7 Nov</p>
            <h1 className="eio-type-style-title">claude-code</h1>
            <p className="eio-type-style-body">Claude, working in your terminal on this Mac. It proposes changes to Mero; you approve them.</p>
            <div className={styles.row}>
              <Badge tone="success">Active</Badge>
              <Badge>Vouched for by this Mac</Badge>
            </div>
          </div>

          <section className={styles.section}>
            <h2 className="eio-type-style-heading">Roles it holds</h2>
            <Card>
              <div className={styles.line}>
                <Badge>Proposer</Badge>
                <div className={styles.lineText}>
                  <span className="eio-type-style-body">Read and propose, in Mero</span>
                  <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>
                    in <span className="eio-type-style-mono">noi.eio</span> · Eidos · granted by you, 7 Nov
                  </span>
                </div>
                <div className={styles.lineEnd}>
                  <Button>End</Button>
                </div>
              </div>
            </Card>
            <div className={styles.row}>
              <Button variant="primary" icon="plus">Grant a role</Button>
              <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>Granting and ending need your touch.</span>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className="eio-type-style-heading">Its runs</h2>
            <Card>
              <div className={styles.line}>
                <Icon name="agent" />
                <div className={styles.lineText}>
                  <span className="eio-type-style-body">Running now · started by Ada</span>
                  <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>run token until 16:25 · 3 proposals in this run</span>
                </div>
                <div className={styles.lineEnd}>
                  <Button>Stop this run</Button>
                </div>
              </div>
            </Card>
            <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>
              A run token lasts 15 minutes. If you stop being its sponsor, it can’t run until an owner names another.
            </p>
          </section>
        </div>
  )
}
