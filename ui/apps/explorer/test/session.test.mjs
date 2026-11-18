// Your sign-in as the app hands it on: Governance's session cookie read from its answer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionFrom, visitorOf } from '../lib/session.ts'

test('the session comes from Governance’s cookie, with its lifetime', () => {
  assert.deepEqual(sessionFrom(['noi_session=abc-123; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200']), { token: 'abc-123', maxAge: 43200 })
  assert.deepEqual(sessionFrom(['other=x; Path=/', 'noi_session=t=1; HttpOnly']), { token: 't=1' })
})

test('no session when no cookie carries one', () => {
  assert.equal(sessionFrom([]), undefined)
  assert.equal(sessionFrom(['noi_session=; HttpOnly; Max-Age=0']), undefined)
  assert.equal(sessionFrom(['noi_sessions=abc']), undefined)
})

test('the visitor comes only from the header the host sets, its last entry', () => {
  const headers = { 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '203.0.113.9', 'x-vercel-forwarded-for': '1.1.1.1, 203.0.113.9' }
  const get = name => headers[name] ?? null
  assert.equal(visitorOf(get, undefined), undefined, 'no setting: nobody, whatever the visitor sent')
  assert.equal(visitorOf(get, 'X-Real-IP'), '203.0.113.9')
  assert.equal(visitorOf(get, 'x-vercel-forwarded-for'), '203.0.113.9', 'the last entry, added by the nearest proxy')
  assert.equal(visitorOf(get, 'x-missing'), undefined)
})
