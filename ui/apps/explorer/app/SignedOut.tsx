// Shown instead of Mero when Mero says no to whoever is asking: signed out, a sign-in that ended,
// or no grant here. Sign-in itself comes into the Explorer in step 4; until then it is on
// Governance's own page, and the Explorer uses the same sign-in.
import { GOVERNANCE_URL } from '../lib/mero'

export function SignedOut({ reason }: { reason: string }) {
  return (
    <main className="noi-error">
      <p className="noi-error-muted eio-type-style-label">Explorer</p>
      <h1 className="eio-type-style-title">Sign in to see Mero</h1>
      <p className="eio-type-style-body">
        Mero asks Governance about everyone who reads it. Sign in on{' '}
        <a href={`${GOVERNANCE_URL}/sign-in`}>Governance’s page</a> with your passkey, then come back and reload.
      </p>
      <p className="noi-error-muted eio-type-style-caption">Mero said: {reason}</p>
    </main>
  )
}
