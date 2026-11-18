// gov.no-origins.localhost:3000/account/lost: a lost passkey (agreed 8 Nov; under /account since
// 9 Nov). Governance emails a one-time link to the account with that email, if any; the page says
// the same either way.
import { mailInbox } from '../../../../lib/hosts'
import { TopBar } from '../../../TopBar'
import { LostForm } from '../../SignIn'
import styles from '../../gov.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lost your passkey · Governance' }

export default function LostPage() {
  return (
    <>
      <TopBar view="gov" />
      <main className={styles.page}>
        <LostForm inbox={mailInbox()} />
      </main>
    </>
  )
}
