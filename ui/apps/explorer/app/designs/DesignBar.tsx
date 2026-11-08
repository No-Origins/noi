// The top bar every subdomain would share (design, 7 Nov): No Origins, the systems, and you. Under
// it, the system's own views. Sample data only.
import { Badge, Button, Icon, Tab, Tabs, WhenOnePane, WhenTwoPanes } from '@noi/eio-react'
import styles from './designs.module.css'

type System = 'mero' | 'gov' | 'eidos'
const SYSTEMS: [System, string, string][] = [
  ['mero', 'Mero', '/designs/mero/review'],
  ['gov', 'Governance', '/designs/gov/profile'],
  ['eidos', 'Eidos', '/eidos'],
]
const VIEWS: Record<System, [string, string, number?][]> = {
  mero: [['Merons', '/merons'], ['Review', '/designs/mero/review', 1], ['Components', '/eidos']],
  gov: [['Profile', '/designs/gov/profile'], ['Accounts', '/designs/gov/accounts'], ['Roles', '/designs/gov/roles'], ['The record', '/designs/gov/record']],
  eidos: [],
}

export function DesignBar({ system, view, signedIn = true }: { system: System; view?: string; signedIn?: boolean }) {
  const name = SYSTEMS.find(([s]) => s === system)![1]
  return (
    <>
      <header className={styles.bar}>
        <WhenOnePane>
          {/* Where one pane fills the window, the systems, the views and Sign out are in the menu. */}
          <Button icon="menu" aria-label="Menu" />
        </WhenOnePane>
        <a className={styles.brand} href="/designs">
          <span className={[styles.brandLabel, 'eio-type-style-label'].join(' ')}>No Origins</span>
          <span className="eio-type-style-heading">{system === 'mero' ? 'Explorer' : name}</span>
        </a>
        <WhenTwoPanes>
          <div className={styles.systems}>
            <Tabs label="Systems">
              {SYSTEMS.map(([s, label, href]) => (
                <Tab key={s} href={href} selected={s === system}>{label}</Tab>
              ))}
            </Tabs>
          </div>
        </WhenTwoPanes>
        <div className={styles.end}>
          <WhenTwoPanes>
            <Badge>Design</Badge>
          </WhenTwoPanes>
          {signedIn ? (
            <>
              <a className={[styles.you, 'eio-type-style-label'].join(' ')} href="/designs/gov/profile">
                <Icon name="user" size="small" />
                Ada
              </a>
              <WhenTwoPanes>
                <Button>Sign out</Button>
              </WhenTwoPanes>
            </>
          ) : (
            <Button variant="secondary" icon="key">Sign in</Button>
          )}
        </div>
      </header>
      {signedIn && VIEWS[system].length > 0 && (
        <nav className={styles.views} aria-label={`${name} views`}>
          {VIEWS[system].map(([label, href, count]) => (
            <a key={label} href={href} className={[styles.view, label === view && styles.viewOn, 'eio-type-style-label'].filter(Boolean).join(' ')} aria-current={label === view ? 'page' : undefined}>
              {label}
              {count !== undefined && <span className={styles.muted}>{count}</span>}
            </a>
          ))}
        </nav>
      )}
    </>
  )
}
