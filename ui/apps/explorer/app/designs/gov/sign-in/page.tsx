import { Button, Card, Field } from '@noi/eio-react'
import { DesignBar } from '../../DesignBar'
import styles from '../../designs.module.css'

// gov.no-origins.com/sign-in: the one place you sign in, for every subdomain.
export default function SignIn() {
  return (
    <>
      <DesignBar system="gov" signedIn={false} />
      <main className={styles.signIn}>
        <Card>
          <form className={styles.signInCard}>
            <div className={styles.head}>
              <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>Governance</p>
              <h1 className="eio-type-style-title">Sign in to No Origins</h1>
              <p className={[styles.muted, 'eio-type-style-body'].join(' ')}>
                Once, for Mero, Governance, Eidos and everything else on no-origins.com.
              </p>
            </div>
            <Field label="Handle" icon="user" placeholder="Your handle" defaultValue="hiddenstack" autoComplete="username" />
            <Button variant="primary" size="large" icon="key" wide>Sign in with Touch ID</Button>
            <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>
              Then back to <span className="eio-type-style-mono">mero.no-origins.com/review</span>
            </p>
          </form>
        </Card>
        <p className={[styles.muted, 'eio-type-style-caption'].join(' ')} style={{ marginTop: 'var(--eio-space-gap-group)' }}>
          No passkey yet? Open the one-time link you were given: it adds your passkey and signs you in.
        </p>
      </main>
    </>
  )
}
