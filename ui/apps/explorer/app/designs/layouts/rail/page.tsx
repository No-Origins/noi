import { Button, Icon, Panes, WhenOnePane, WhenTwoPanes, type IconName } from '@noi/eio-react'
import { AccountList, AgentPage } from '../../gov/accounts/parts'
import styles from '../../designs.module.css'

// Layout idea B: the systems down a rail on the left, the one you are in open to its views. Room for
// as many systems as come; the page keeps the whole width to the right. Where one pane fills the
// window, the rail is behind the menu button and the crumbs keep only the last two steps.
const SYSTEMS: [string, IconName, string[]?, boolean?][] = [
  ['Mero', 'layers'],
  ['Governance', 'key', ['Profile', 'Accounts', 'Roles', 'The record']],
  ['Eidos', 'drop'],
  ['Hyperbase', 'agent', undefined, true],
]

export default function Rail() {
  return (
    <div className={styles.railLayout}>
      <WhenTwoPanes>
      <nav className={styles.rail} aria-label="Systems">
        <div className={styles.railBrand}>
          <span className={[styles.brandLabel, 'eio-type-style-label'].join(' ')} style={{ display: 'inline' }}>No Origins</span>
        </div>
        <div className={styles.railSystems}>
          {SYSTEMS.map(([name, icon, views, later]) => (
            <div key={name} className={styles.group}>
              <a href="#" className={[styles.railSystem, views && styles.railSystemOn, later && styles.railLater, 'eio-type-style-heading'].filter(Boolean).join(' ')}>
                <Icon name={icon} />
                {name}
                {later && <span className="eio-type-style-caption">later</span>}
              </a>
              {views && (
                <div className={styles.railViews}>
                  {views.map(v => (
                    <a key={v} href="#" className={[styles.railView, v === 'Accounts' && styles.railViewOn, 'eio-type-style-label'].filter(Boolean).join(' ')}>{v}</a>
                  ))}
                </div>
              )}
            </div>
          ))}
          <span className={[styles.faint, 'eio-type-style-caption'].join(' ')} style={{ padding: 'var(--eio-space-inset-control)' }}>More systems join this list as they come.</span>
        </div>
        <div className={styles.railFoot}>
          <span className={[styles.you, 'eio-type-style-label'].join(' ')}><Icon name="user" size="small" />Ada</span>
          <Button>Sign out</Button>
        </div>
      </nav>
      </WhenTwoPanes>
      <div className={styles.railMain}>
        <div className={[styles.crumbs, 'eio-type-style-label'].join(' ')}>
          <WhenOnePane>
            <Button icon="menu" aria-label="Menu" />
          </WhenOnePane>
          <WhenTwoPanes>
            Governance <Icon name="right" size="small" />
          </WhenTwoPanes>
          Accounts <Icon name="right" size="small" /> <span style={{ color: 'var(--eio-color-text-primary)' }}>claude-code</span>
        </div>
        <Panes list={<AccountList />}>
          <AgentPage />
        </Panes>
      </div>
    </div>
  )
}
