// What a page says when Mero or Governance is not on the internet yet (20 Nov, the app on Vercel
// before they are hosted): only hosted, only with no address for that server, and in plain words.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notHostedWords, notHostedYet } from '../lib/backend.ts'

const HOSTED = 'no-origins.com'
const HERE = 'no-origins.localhost'

test('a server is not on the internet yet when the app is hosted and has no address for it', () => {
  assert.equal(notHostedYet('Mero', {}, HOSTED), true)
  assert.equal(notHostedYet('Governance', {}, HOSTED), true)
  assert.equal(notHostedYet('Mero', { MERO_URL: '' }, HOSTED), true, 'an empty setting is no address')
  assert.equal(notHostedYet('Mero', { MERO_URL: 'https://mero-api.no-origins.com' }, HOSTED), false)
  assert.equal(notHostedYet('Governance', { GOVERNANCE_API: 'https://gov-api.no-origins.com' }, HOSTED), false)
  assert.equal(notHostedYet('Mero', { GOVERNANCE_API: 'https://gov-api.no-origins.com' }, HOSTED), true, 'each server by its own setting')
})

test('on this Mac a server always has its own address', () => {
  assert.equal(notHostedYet('Mero', {}, HERE), false)
  assert.equal(notHostedYet('Governance', {}, HERE), false)
})

test('the words are plain, and never ask to try again', () => {
  assert.deepEqual(notHostedWords('Mero'), { title: 'Mero isn’t on the internet yet', line: 'This page works on the maintainer’s Mac for now.' })
  assert.deepEqual(notHostedWords('Governance', 'Signing in'), {
    title: 'Signing in comes later',
    line: 'Governance isn’t on the internet yet. Signing in works on the maintainer’s Mac for now.',
  })
  for (const w of [notHostedWords('Mero'), notHostedWords('Governance', 'Signing up')]) {
    assert.doesNotMatch(`${w.title} ${w.line}`, /try again/i)
  }
})
