import { Button, Field, Icon, Panes, WhenOnePane, WhenTwoPanes, type IconName } from '@noi/eio-react'
import { AccountList, AgentPage } from '../../gov/accounts/parts'
import styles from '../../designs.module.css'

// Layout idea C: one switcher for the system you are in, and one search that goes anywhere: an
// account, a meron, a role. The bar stays the same however many systems there are. Shown with the
// switcher open. Where one pane fills the window, the search is a button, and you and Sign out are at
// the foot of the switcher, as the shared bar keeps Sign out in the menu.
const SYSTEMS: [string, IconName, string, boolean?][] = [
  ['Mero', 'layers', 'Every meron, and Review'],
  ['Governance', 'key', 'Profile, accounts, roles, the record', true],
  ['Eidos', 'drop', 'The design system'],
  ['Hyperbase', 'agent', 'Agents and their runs · later'],
]

export default function Switcher() {
  return (
    <>
      <header className={[styles.bar, styles.switchBar].join(' ')}>
        <span className={[styles.switch, 'eio-type-style-heading'].join(' ')}>
          <span className={[styles.brandLabel, 'eio-type-style-label'].join(' ')}>No Origins</span>
          <span>Governance</span>
          <Icon name="down" size="small" />
        </span>
        <WhenTwoPanes>
          <div className={styles.search}>
            <Field label="Go to" icon="search" placeholder="Go to an account, a meron, a role…" hint="⌘K" />
          </div>
        </WhenTwoPanes>
        <div className={styles.end}>
          <WhenOnePane>
            <Button icon="search" aria-label="Go to" />
          </WhenOnePane>
          <WhenTwoPanes>
            <span className={[styles.you, 'eio-type-style-label'].join(' ')}><Icon name="user" size="small" />Ada</span>
            <Button>Sign out</Button>
          </WhenTwoPanes>
        </div>
        <div className={styles.switchMenu} role="menu" aria-label="Systems">
          {SYSTEMS.map(([name, icon, what, on]) => (
            <a key={name} href="#" role="menuitem" className={[styles.switchItem, on && styles.switchItemOn].filter(Boolean).join(' ')}>
              <Icon name={icon} />
              <span className={styles.lineText}>
                <span className="eio-type-style-heading">{name}</span>
                <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>{what}</span>
              </span>
            </a>
          ))}
          <WhenOnePane>
            <div className={styles.switchFoot}>
              <span className={[styles.you, 'eio-type-style-label'].join(' ')}><Icon name="user" size="small" />Ada</span>
              <Button>Sign out</Button>
            </div>
          </WhenOnePane>
        </div>
      </header>
      <nav className={styles.views} aria-label="Governance views">
        {['Profile', 'Accounts', 'Roles', 'The record'].map(v => (
          <a key={v} href="#" className={[styles.view, v === 'Accounts' && styles.viewOn, 'eio-type-style-label'].filter(Boolean).join(' ')}>{v}</a>
        ))}
      </nav>
      <Panes list={<AccountList />}>
        <AgentPage />
      </Panes>
    </>
  )
}
