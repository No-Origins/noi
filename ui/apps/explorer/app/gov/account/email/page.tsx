// gov.no-origins.localhost:3000/account/email#<token>: the link sent to a new email (9 Nov). One
// press makes it your email; no sign-in is needed, as the touch that asked for it proved who you are
// and the link proves the address. The token is after #, which a browser never sends.
import { TopBar } from '../../../TopBar'
import { origins } from '../../../../lib/where'
import { ConfirmEmailForm } from '../../SignIn'
import styles from '../../gov.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Use this email · Governance' }

export default async function ConfirmEmailPage() {
  const at = await origins()
  return (
    <>
      <TopBar view="gov" />
      <main className={styles.page}>
        <ConfirmEmailForm account={`${at.gov}/account`} />
      </main>
    </>
  )
}
