import { Badge, Button, Checkbox, Field, Icon, Panes, Tab, Tabs, TreeRow } from '@noi/eio-react'
import { DesignBar } from '../../DesignBar'
import styles from '../../designs.module.css'

// gov.no-origins.com/roles/new: make a role. It is proposed to Mero, and you approve it in Review.
const VERBS: [string, string, boolean][] = [
  ['read', 'See merons and their history', true],
  ['propose', 'Send changes to Review', true],
  ['update', 'Change a meron’s definition', false],
  ['rename', 'Move a meron to a new path', false],
  ['transition', 'Change a meron’s state', false],
  ['relate', 'Link two merons', false],
  ['release', 'Plan a release', false],
  ['review', 'Approve, send back, reject', false],
]

export default function Roles() {
  const list = (
    <div className={styles.left}>
      <div className={styles.row}>
        <Button variant="primary" icon="plus">Make a role</Button>
      </div>
      <div role="tree" aria-label="Roles" className={styles.group}>
        <h2 className={[styles.groupName, 'eio-type-style-label'].join(' ')}>Roles</h2>
        <TreeRow name="Maintainer" preview={<Icon name="layers" />} count={1} href="/designs/gov/roles" />
        <TreeRow name="Owner" preview={<Icon name="layers" />} count={1} href="/designs/gov/roles" />
        <TreeRow name="New role" preview={<Icon name="plus" />} selected href="/designs/gov/roles" />
      </div>
      <div role="tree" aria-label="Deprecated" className={styles.group}>
        <h2 className={[styles.groupName, 'eio-type-style-label'].join(' ')}>Deprecated</h2>
        <TreeRow name="Observer" preview={<Icon name="dash" />} href="/designs/gov/roles" />
        <TreeRow name="Contributor" preview={<Icon name="dash" />} href="/designs/gov/roles" />
      </div>
    </div>
  )
  const chosen = VERBS.filter(([, , on]) => on).map(([v]) => `Action::"${v}"`).join(', ')
  return (
    <>
      <DesignBar system="gov" view="Roles" />
      <Panes list={list}>
        <form className={styles.right}>
          <div className={styles.head}>
            <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>New role</p>
            <h1 className="eio-type-style-title">Make a role</h1>
            <p className={[styles.muted, 'eio-type-style-body'].join(' ')}>
              A role is a set of verbs from one system. It says nothing about who or where: that comes when you grant it.
            </p>
          </div>
          <Field label="Name" icon="pen" placeholder="Its name" defaultValue="Proposer" />
          <section className={styles.section}>
            <h2 className="eio-type-style-heading">Which system</h2>
            <Tabs label="System">
              <Tab href="#" selected>Mero</Tab>
              <Tab href="#">Governance</Tab>
              <Tab href="#">Hyperbase</Tab>
            </Tabs>
          </section>
          <section className={styles.section}>
            <h2 className="eio-type-style-heading">What it allows</h2>
            <div className={styles.verbs}>
              {VERBS.map(([verb, what, on]) => (
                <Checkbox key={verb} tile detail={what} defaultChecked={on}>{verb}</Checkbox>
              ))}
            </div>
          </section>
          <section className={styles.section}>
            <div className={styles.row}>
              <h2 className="eio-type-style-heading">As Mero will keep it</h2>
              <Badge>Cedar</Badge>
            </div>
            <p className={[styles.cedar, 'eio-type-style-mono'].join(' ')}>
              {`permit (\n  principal == ?principal,\n  action in [${chosen}],\n  resource in ?resource\n);`}
            </p>
          </section>
          <div className={styles.row}>
            <Button variant="primary" size="large" icon="arrow">Propose to Mero</Button>
            <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>You approve it in Review, like any change, with your touch.</span>
          </div>
        </form>
      </Panes>
    </>
  )
}
