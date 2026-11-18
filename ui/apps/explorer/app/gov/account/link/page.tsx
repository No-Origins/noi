// gov.no-origins.localhost:3000/account/link#<token> (under /account since 9 Nov): a one-time link
// adds a passkey and signs you in, then lands on Governance's home (agreed 9 Nov). The token is
// after #, which a browser never sends, so it reaches no server's log.
import { TopBar } from '../../../TopBar'
import { origins } from '../../../../lib/where'
import { AddPasskeyForm } from '../../SignIn'
import styles from '../../gov.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Add your passkey · Governance' }

export default async function AddPasskeyPage() {
  const at = await origins()
  return (
    <>
      <TopBar view="gov" />
      <main className={styles.page}>
        <AddPasskeyForm home={`${at.gov}/?passkey=added`} />
      </main>
    </>
  )
}
