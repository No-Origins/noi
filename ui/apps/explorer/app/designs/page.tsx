import { Card, Icon, type IconName } from '@noi/eio-react'
import { DesignBar } from './DesignBar'
import styles from './designs.module.css'

const DESIGNS: [string, string, string, IconName][] = [
  ['Sign in', 'gov.no-origins.com/sign-in', '/designs/gov/sign-in', 'key'],
  ['Profile', 'gov.no-origins.com/profile', '/designs/gov/profile', 'user'],
  ['Accounts · an agent', 'gov.no-origins.com/accounts/claude-code', '/designs/gov/accounts', 'agent'],
  ['Roles · make a role', 'gov.no-origins.com/roles/new', '/designs/gov/roles', 'layers'],
  ['Rule editor · built 8 Nov', 'the Change page for roles and rules', '/designs/gov/rule', 'layers'],
  ['The record', 'gov.no-origins.com/record', '/designs/gov/record', 'doc'],
  ['Review · approve with Touch ID', 'mero.no-origins.com/review', '/designs/mero/review', 'check'],
]

export default function Designs() {
  return (
    <>
      <DesignBar system="gov" />
      <main className={styles.wide}>
        <div className={styles.head}>
          <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>Designs · 7 Nov · sample data</p>
          <h1 className="eio-type-style-title">Pages for each subdomain</h1>
        </div>
        <div className={styles.designs}>
          {DESIGNS.map(([name, where, href, icon]) => (
            <a key={href} href={href} className={styles.designLink}>
              <Card>
                <div className={styles.group}>
                  <Icon name={icon} />
                  <span className="eio-type-style-heading">{name}</span>
                  <span className={[styles.muted, 'eio-type-style-mono'].join(' ')}>{where}</span>
                </div>
              </Card>
            </a>
          ))}
        </div>
      </main>
    </>
  )
}
