import { Badge, Button, Card, Icon } from '@noi/eio-react'
import { DesignBar } from '../../DesignBar'
import styles from '../../designs.module.css'

// gov.no-origins.com/profile: your profile. Who you are, what you may do and where, your passkeys and sign-ins.
export default function Profile() {
  return (
    <>
      <DesignBar system="gov" view="Profile" />
      <main className={styles.reading}>
        <div className={styles.head}>
          <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>Profile · a person · since 7 Nov</p>
          <h1 className="eio-type-style-title">Ada</h1>
          <p className={[styles.muted, 'eio-type-style-mono'].join(' ')}>hiddenstack</p>
        </div>

        <section className={styles.section}>
          <h2 className="eio-type-style-heading">What you may do</h2>
          <Card>
            <div className={styles.line}>
              <Badge>Maintainer</Badge>
              <div className={styles.lineText}>
                <span className="eio-type-style-body">Every Mero action</span>
                <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>in all of NOI · granted at setup</span>
              </div>
            </div>
            <div className={styles.line}>
              <Badge>Owner</Badge>
              <div className={styles.lineText}>
                <span className="eio-type-style-body">Every Governance action</span>
                <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>in all of NOI · granted at setup</span>
              </div>
            </div>
          </Card>
        </section>

        <section className={styles.section}>
          <h2 className="eio-type-style-heading">Passkeys</h2>
          <Card>
            <div className={styles.line}>
              <Icon name="key" />
              <div className={styles.lineText}>
                <span className="eio-type-style-body">Touch ID on this Mac</span>
                <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>added 7 Nov · used today</span>
              </div>
            </div>
          </Card>
          <div className={styles.row}>
            <Button icon="plus">Add a passkey</Button>
            <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>Another device, or a security key. Needs a touch.</span>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className="eio-type-style-heading">Where you are signed in</h2>
          <Card>
            <div className={styles.line}>
              <Icon name="eye" />
              <div className={styles.lineText}>
                <span className="eio-type-style-body">Safari on this Mac</span>
                <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>this sign-in · until 21:21 today</span>
              </div>
              <div className={styles.lineEnd}>
                <Badge tone="success">Now</Badge>
              </div>
            </div>
            <div className={styles.line}>
              <Icon name="eye" />
              <div className={styles.lineText}>
                <span className="eio-type-style-body">Chrome on iPhone</span>
                <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>signed in 12:05 · until 00:05</span>
              </div>
              <div className={styles.lineEnd}>
                <Button>Sign out</Button>
              </div>
            </div>
          </Card>
          <div className={styles.row}>
            <Button variant="secondary">Sign out everywhere</Button>
          </div>
        </section>
      </main>
    </>
  )
}
