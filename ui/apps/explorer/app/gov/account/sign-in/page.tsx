// gov.no-origins.localhost:3000/account/sign-in, later gov.no-origins.com/account/sign-in: the one
// place you sign in, for every part of No Origins (agreed 8 Nov; under /account since 9 Nov). Signed
// in already, it says who and offers Sign out. Afterwards it sends you back to the page you came
// from, on any of our own names.
import { signedIn } from '../../../../lib/governance'
import { backTo } from '../../../../lib/hosts'
import { origins } from '../../../../lib/where'
import { notHostedYet } from '../../../../lib/backend'
import { NotHostedYet } from '../../../NotHostedYet'
import { TopBar } from '../../../TopBar'
import { SignedInCard, SignInForm } from '../../SignIn'
import styles from '../../gov.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sign in · Governance' }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  // Hosted before Governance is (20 Nov): say so plainly, instead of a form that cannot work.
  if (notHostedYet('Governance')) return <><TopBar view="gov" /><NotHostedYet server="Governance" doing="Signing in" /></>
  const [at, you] = await Promise.all([origins(), signedIn()])
  const back = backTo((await searchParams).back, `${at.mero}/merons`)
  return (
    <>
      <TopBar view="gov" />
      <main className={styles.page}>
        {you ? <SignedInCard handle={you.handle} name={you.display_name} back={back} /> : <SignInForm back={back} />}
      </main>
    </>
  )
}
