// Roles and rules in words: the sentence the editor, the rule's page and Review show.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plain, roleSentence, ruleSentence } from '../lib/sentence.ts'

// The fresh-touch rule, as Mero reads it (the same JSON its Rust test checks).
const freshTouch = {
  effect: 'forbid',
  who: 'anyone',
  doing: [
    { system: 'mero', pick: 'these', verbs: ['review'] },
    { system: 'governance', pick: 'every', except: ['view'] },
  ],
  where: 'everywhere',
  unless: ['fresh-touch'],
}

test('the fresh-touch rule reads as one sentence', () => {
  assert.equal(
    plain(ruleSentence(freshTouch)),
    'No one may approve, send back or reject in Review, or do any Governance action, anywhere, unless they touched just now, or it’s viewing.',
  )
})

test('only owners approve in noi.gov', () => {
  const rule = { effect: 'forbid', who: 'anyone', doing: [{ system: 'mero', pick: 'these', verbs: ['review'] }], where: { place: 'noi.gov' }, unless: [{ holds: 'owner' }] }
  assert.equal(plain(ruleSentence(rule)), 'No one may approve, send back or reject in Review, in noi.gov, unless they hold Owner.')
})

test('who, with names where they are known', () => {
  const doing = [{ system: 'mero', pick: 'these', verbs: ['read', 'propose'] }]
  const names = { roles: { maintainer: 'Maintainer' }, accounts: { 'a1b2c3d4-0000-4000-8000-000000000000': 'hiddenstack' } }
  assert.equal(plain(ruleSentence({ effect: 'permit', who: 'anyone', doing, where: 'everywhere', unless: [] })), 'Anyone may read merons, or propose changes, anywhere.')
  assert.equal(plain(ruleSentence({ effect: 'forbid', who: { role: 'maintainer' }, doing, where: 'everywhere', unless: [] }, names)), 'Holders of Maintainer may not read merons, or propose changes, anywhere.')
  assert.equal(plain(ruleSentence({ effect: 'permit', who: { account: 'a1b2c3d4-0000-4000-8000-000000000000' }, doing, where: 'everywhere', unless: [] }, names)), 'hiddenstack may read merons, or propose changes, anywhere.')
  assert.equal(plain(ruleSentence({ effect: 'permit', who: { account: 'ffffffff-0000-4000-8000-000000000000' }, doing, where: 'everywhere', unless: [] })), 'the account ffffffff may read merons, or propose changes, anywhere.')
})

test('a change marks what it adds, and the other side what it removes', () => {
  const before = { ...freshTouch, doing: [freshTouch.doing[0], { system: 'governance', pick: 'every', except: [] }] }
  const after = ruleSentence(freshTouch, {}, before, 'added')
  assert.deepEqual(after.filter(s => s.mark), [{ text: 'it’s viewing', mark: 'added' }])
  const was = ruleSentence(before, {}, freshTouch, 'removed')
  assert.deepEqual(was.filter(s => s.mark), [])
  const tighter = { ...freshTouch, where: { place: 'noi.gov' } }
  assert.deepEqual(ruleSentence(tighter, {}, freshTouch).filter(s => s.mark), [{ text: 'in noi.gov', mark: 'added' }])
  assert.deepEqual(ruleSentence(freshTouch, {}, tighter, 'removed').filter(s => s.mark), [{ text: 'anywhere', mark: 'removed' }])
})

test('a role in words', () => {
  assert.equal(plain(roleSentence({ system: 'governance', pick: 'every', except: [] })), 'Lets its holders do any Governance action, including ones added later, wherever it’s granted.')
  const some = { system: 'mero', pick: 'these', verbs: ['read', 'propose'] }
  assert.equal(plain(roleSentence(some)), 'Lets its holders read merons, and propose changes, wherever it’s granted.')
  assert.deepEqual(roleSentence(some, { system: 'mero', pick: 'these', verbs: ['read'] }).filter(s => s.mark), [{ text: 'propose changes', mark: 'added' }])
})
