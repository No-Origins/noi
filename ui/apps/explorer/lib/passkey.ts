// Passkeys in the browser, to sign in, to add your passkey and for a touch: Governance sends
// WebAuthn options with binary fields in base64url, the browser wants bytes, and the answer goes
// back in base64url. No secret passes through here: the passkey's private half never leaves the
// device.

/** base64url → bytes. */
export function dec(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

/** bytes → base64url. */
export function enc(b: ArrayBuffer | Uint8Array): string {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

/** Governance's request options, as the browser takes them. */
export function requestOptions(options: Json): CredentialRequestOptions {
  const p = structuredClone(options.publicKey)
  p.challenge = dec(p.challenge)
  for (const c of p.allowCredentials ?? []) c.id = dec(c.id)
  return { publicKey: p }
}

/** Governance's options for making a passkey, as the browser takes them. */
export function creationOptions(options: Json): CredentialCreationOptions {
  const p = structuredClone(options.publicKey)
  p.challenge = dec(p.challenge)
  p.user.id = dec(p.user.id)
  for (const c of p.excludeCredentials ?? []) c.id = dec(c.id)
  return { publicKey: p }
}

/** The new passkey's public half, as Governance takes it. */
export function registered(c: Json): Json {
  return {
    id: c.id,
    rawId: enc(c.rawId),
    type: c.type,
    extensions: c.getClientExtensionResults ? c.getClientExtensionResults() : {},
    response: {
      attestationObject: enc(c.response.attestationObject),
      clientDataJSON: enc(c.response.clientDataJSON),
      transports: c.response.getTransports ? c.response.getTransports() : undefined,
    },
  }
}

/** The browser's answer, as Governance takes it. */
export function asserted(c: Json): Json {
  return {
    id: c.id,
    rawId: enc(c.rawId),
    type: c.type,
    extensions: c.getClientExtensionResults ? c.getClientExtensionResults() : {},
    response: {
      authenticatorData: enc(c.response.authenticatorData),
      clientDataJSON: enc(c.response.clientDataJSON),
      signature: enc(c.response.signature),
      userHandle: c.response.userHandle ? enc(c.response.userHandle) : null,
    },
  }
}

/** Says what went wrong with a touch, in words. */
export function touchError(e: unknown): string {
  const name = (e as { name?: string })?.name
  // Making a passkey, the browser refuses when it already holds one for this account (9 Nov).
  if (name === 'InvalidStateError') {
    return 'This browser already has a passkey for this account, so it made no second one. Sign in with the one it has.'
  }
  if (name === 'NotAllowedError' || name === 'NotSupportedError' || name === 'SecurityError') {
    return 'No touch: it was cancelled, or this browser can’t use your passkey. Your passkey is in Apple Passwords, so use Safari (or Chrome), not the browser inside the Claude app.'
  }
  return (e as Error)?.message || 'The touch did not work.'
}
