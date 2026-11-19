// gov.no-origins.localhost:3000/account/lost: a lost passkey (agreed 8 Nov; under /account since
// 9 Nov). Governance emails a one-time link to the account with that email, if any; the page says
// the same either way.
import { mailInbox } from '../../../../lib/hosts'
import { notHostedYet } from '../../../../lib/backend'
import { NotHostedYet } from '../../../NotHostedYet'
import { TopBar } from '../../../TopBar'
import { LostForm } from '../../SignIn'
import styles from '../../gov.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lost your passkey · Governance' }

export default function LostPage() {
  // Hosted before Governance is (20 Nov): say so plainly, instead of a form that cannot work.
  if (notHostedYet('Governance')) return <><TopBar view="gov" /><NotHostedYet server="Governance" doing="Getting a new passkey" /></>
  return (
    <>
      <TopBar view="gov" />
      <main className={styles.page}>
        <LostForm inbox={mailInbox()} />
      </main>
    </>
  )
}
