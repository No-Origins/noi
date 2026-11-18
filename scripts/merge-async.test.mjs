// GitHub's asynchronous merge as pnpm land uses it, against GitHub's answers written out (the pending
// one is what GitHub gave when #4 was merged, 19 Nov). Run with: node --test scripts/merge-async.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeAsync } from './merge-async.mjs'

const SHA = '7bed3c5f330524d2d0a6e18a30f4e6bbdb65435f'
const UUID = '8b43b993-29f2-4291-955e-e5fc840cdede'
const PATH = 'repos/{owner}/{repo}/pulls/4/merge-async'
const pending = (head = SHA, message = 'Merge request enqueued.') => ({
  status: 'pending',
  details: { message, uuid: UUID, merge_method: 'merge', merge_action: 'direct_merge', expected_head_sha: head, bypass_rules: false },
})
const merged = { status: 'merged', details: { message: 'Pull request was merged.', sha: '4ed62c3e1cce6a984b2dc56910ef2d48a58d075f' } }

/** A stand-in for gh api: gives the answers in turn, and keeps what it was asked. */
function github(...answers) {
  const asked = []
  const api = args => {
    asked.push(args)
    const a = answers.shift()
    if (a === undefined) throw new Error(`asked more than GitHub answered: ${args.join(' ')}`)
    return typeof a === 'string' ? { ok: false, out: '', err: a } : { ok: a.ok ?? true, out: JSON.stringify(a.body ?? a), err: '' }
  }
  return { api, asked }
}
const go = (gh, more = {}) => mergeAsync({ api: gh.api, sleep: () => {}, number: 4, sha: SHA, ...more })

test('asks for a merge commit, only at the commit checked, and waits until it is merged', () => {
  const gh = github(pending(), pending(SHA, 'Merge request is in progress.'), merged)
  assert.deepEqual(go(gh), { merged: merged.details.sha })
  assert.deepEqual(gh.asked[0], ['-X', 'PUT', PATH, '-f', 'merge_method=merge', '-f', 'merge_action=direct_merge', '-f', `sha=${SHA}`])
  assert.deepEqual(gh.asked.slice(1), [[`${PATH}/${UUID}`], [`${PATH}/${UUID}`]])
})

test('already merged: says so at once', () => {
  assert.deepEqual(go(github(merged)), { merged: merged.details.sha })
})

test('a merge of it already asked for at the same commit (409) is followed to its end', () => {
  const gh = github({ ok: false, body: pending() }, merged)
  assert.deepEqual(go(gh), { merged: merged.details.sha })
})

test('a merge of it already asked for at another commit is not taken as this one', () => {
  const other = 'aaaaaaa0000000000000000000000000000000000'
  assert.deepEqual(go(github({ ok: false, body: pending(other) })), { error: 'a merge of it at another commit (aaaaaaa) is already asked for' })
})

test('what GitHub refuses, it says why, in its words', () => {
  assert.deepEqual(go(github({ ok: false, body: { message: 'Pull Request is not mergeable' } })), { error: 'Pull Request is not mergeable' })
  assert.deepEqual(go(github(pending(), { status: 'failed', details: { message: 'Head branch was modified' } })), { error: 'Head branch was modified' })
  assert.deepEqual(go(github('gh: could not reach api.github.com\nmore')), { error: 'gh: could not reach api.github.com' })
})

test('a merge queue is not a merge', () => {
  assert.match(go(github({ status: 'enqueued', details: {} })).error, /merge queue/)
})

test('it stops waiting in the end', () => {
  const gh = github(pending(), pending(), pending(), pending())
  assert.deepEqual(go(gh, { tries: 3, every: 2000 }), { error: 'GitHub had not merged it after 6 s: see the pull request' })
  assert.equal(gh.asked.length, 4)
})
