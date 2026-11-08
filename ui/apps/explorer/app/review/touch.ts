// A touch in the browser: Mero says which places a decision covers, Governance starts a touch for
// exactly those, you touch Touch ID, and Governance gives back a touch that counts once, within a
// minute, for those places and nothing else.
import { asserted, requestOptions, touchError } from '../../lib/passkey'
import { askTouch, finishTouch, type Decision } from './actions'

export type Touched = { touch: string; places: string[] } | { error: string }

export async function touchFor(decision: Decision, proposals: string[], asking: (places: string[]) => void): Promise<Touched> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return { error: 'This browser can’t use passkeys. Open the Explorer in Safari.' }
  }
  const started = await askTouch(decision, proposals)
  if (!started.ok) return { error: started.error }
  asking(started.places)
  let credential
  try {
    credential = await navigator.credentials.get(requestOptions(started.options))
  } catch (e) {
    return { error: touchError(e) }
  }
  if (!credential) return { error: 'No touch came back.' }
  const finished = await finishTouch(started.ceremony, asserted(credential))
  return finished.ok ? { touch: finished.touch, places: started.places } : { error: finished.error }
}
