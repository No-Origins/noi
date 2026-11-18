// gov.no-origins.localhost:3000/account/sign-up, later gov.no-origins.com/account/sign-up (agreed
// 8 Nov; under /account since 9 Nov): anyone may make an account, to look around as an Observer.
// Governance emails a link that confirms the email and adds the passkey; no account exists until then.
import { mailInbox } from '../../../../lib/hosts'
import { TopBar } from '../../../TopBar'
import { SignUpForm } from '../../SignIn'
import styles from '../../gov.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sign up · Governance' }

export default function SignUpPage() {
  return (
    <>
      <TopBar view="gov" />
      <main className={styles.page}>
        <SignUpForm inbox={mailInbox()} />
      </main>
    </>
  )
}
