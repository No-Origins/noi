// The passkey helpers: base64url both ways, and Governance's options as the browser takes them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asserted, dec, enc, requestOptions, touchError } from '../lib/passkey.ts'

test('base64url round-trips, with - and _ and no padding', () => {
  const bytes = Uint8Array.from([251, 255, 191, 0, 1, 2, 62, 63])
  const s = enc(bytes)
  assert.equal(s, '-_-_AAECPj8')
  assert.deepEqual([...dec(s)], [...bytes])
  assert.deepEqual([...dec(enc(new Uint8Array(0)))], [])
})

test('request options carry bytes where WebAuthn wants them, and leave the rest alone', () => {
  const o = { publicKey: { challenge: enc(Uint8Array.from([1, 2, 3])), rpId: 'localhost', userVerification: 'required', allowCredentials: [{ type: 'public-key', id: enc(Uint8Array.from([9, 9])) }] } }
  const r = requestOptions(o)
  assert.deepEqual([...r.publicKey.challenge], [1, 2, 3])
  assert.deepEqual([...r.publicKey.allowCredentials[0].id], [9, 9])
  assert.equal(r.publicKey.rpId, 'localhost')
  assert.equal(typeof o.publicKey.challenge, 'string', 'the options it was given are not changed')
})

test('the answer goes back in base64url', () => {
  const buf = n => Uint8Array.from([n, n + 1]).buffer
  const a = asserted({ id: 'abc', rawId: buf(1), type: 'public-key', getClientExtensionResults: () => ({}), response: { authenticatorData: buf(3), clientDataJSON: buf(5), signature: buf(7), userHandle: null } })
  assert.deepEqual(a, { id: 'abc', rawId: 'AQI', type: 'public-key', extensions: {}, response: { authenticatorData: 'AwQ', clientDataJSON: 'BQY', signature: 'Bwg', userHandle: null } })
})

test('a cancelled or impossible touch says to use Safari', () => {
  assert.match(touchError({ name: 'NotAllowedError' }), /Safari/)
  assert.equal(touchError(new Error('the touch is used')), 'the touch is used')
})
