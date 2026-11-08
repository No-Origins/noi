import { Badge, Field, Icon, Tab, Tabs, type IconName } from '@noi/eio-react'
import { DesignBar } from '../../DesignBar'
import styles from '../../designs.module.css'

// gov.no-origins.com/record: every answer, sign-in and change. Nothing in it can be changed.
// These rows are today's real record, in words.
const ROWS: [string, string, IconName, string, string, boolean, string?][] = [
  ['15:25', 'hiddenstack', 'user', 'read', '116 merons in NOI', true],
  ['15:24', 'visitors', 'eye', 'read', 'noi', false, 'no grant allows read on noi'],
  ['15:24', 'Governance', 'layers', 'copied the roles and rules', '4 roles · 2 rules', true],
  ['14:51', 'hiddenstack', 'user', 'signed in', 'Safari on this Mac', true],
  ['14:51', 'hiddenstack', 'user', 'added a passkey', 'Touch ID on this Mac', true],
  ['14:49', 'operator', 'key', 'made a first-passkey link', 'hiddenstack', true],
  ['14:45', 'operator', 'key', 'set up the first owner', 'hiddenstack · Maintainer, Owner', true],
]

export default function Record() {
  return (
    <>
      <DesignBar system="gov" view="The record" />
      <main className={styles.wide}>
        <div className={styles.head}>
          <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>Governance · today</p>
          <h1 className="eio-type-style-title">The record</h1>
          <p className={[styles.muted, 'eio-type-style-body'].join(' ')}>Every answer, sign-in and change. Nothing here can be changed or deleted.</p>
        </div>
        <div className={styles.row}>
          <Field label="Filter" icon="search" placeholder="Filter by who or what" hint="/" />
          <Tabs label="Show">
            <Tab href="#" selected>All</Tab>
            <Tab href="#">Refused</Tab>
            <Tab href="#">Sign-ins</Tab>
            <Tab href="#">Changes to access</Tab>
          </Tabs>
        </div>
        <div className={styles.table} role="table" aria-label="The record">
          <div className={[styles.record, styles.recordHead, 'eio-type-style-label'].join(' ')} role="row">
            <span>When</span><span>Who</span><span>What</span><span>Where</span><span>Answer</span>
          </div>
          {ROWS.map(([when, who, icon, what, where, ok, why], i) => (
            <div key={i} className={styles.record} role="row">
              <span className={[styles.muted, 'eio-type-style-mono'].join(' ')}>{when}</span>
              <span className={[styles.who, 'eio-type-style-body'].join(' ')}><Icon name={icon} size="small" /><span className={styles.clip}>{who}</span></span>
              <span className="eio-type-style-body">{what}</span>
              <span className={[styles.muted, styles.clip, 'eio-type-style-caption'].join(' ')} title={why}>{why ?? where}</span>
              <span>{ok ? <Badge tone="success">Allowed</Badge> : <Badge tone="danger">Refused</Badge>}</span>
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
