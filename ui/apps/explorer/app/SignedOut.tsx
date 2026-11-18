// Shown instead of Mero when Mero says no to whoever is asking: signed out, a sign-in that ended,
// or no grant here. Sign in on Governance's page, on gov's own name, and it brings you back here.
import { origins } from '../lib/where'
import { SignInHere } from './SignInHere'

export async function SignedOut({ reason, what = 'Mero' }: { reason: string; what?: 'Mero' | 'Review' | 'Governance' }) {
  const at = await origins()
  const why = {
    Mero: 'Mero asks Governance about everyone who reads it.',
    Review: 'Review shows what waits and who proposed it, so it is for people signed in.',
    Governance: 'These pages of Governance are for people signed in.',
  }[what]
  return (
    <main className="noi-error">
      <p className="noi-error-muted eio-type-style-label">Explorer</p>
      <h1 className="eio-type-style-title">Sign in to see {what}</h1>
      <p className="eio-type-style-body">
        {why}{' '}
        <SignInHere signIn={`${at.gov}/account/sign-in`}>Sign in with your passkey</SignInHere>, and you come back here.
      </p>
      <p className="noi-error-muted eio-type-style-caption">{what === 'Governance' ? 'Governance' : 'Mero'} said: {reason}</p>
    </main>
  )
}
