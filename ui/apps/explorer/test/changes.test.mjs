// Governance's changes in words (9 Nov): each kind Governance sends for its home reads as one
// plain sentence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changeWords, recordWords } from '../lib/changes.ts'

const c = (kind, more = {}) => ({ seq: 1, at: '2026-11-09T10:00:00Z', kind, by: 'hiddenstack', whom: null, role: null, scope: null, detail: {}, ...more })
const roles = { proposer: 'Proposer', observer: 'Observer' }

test('roles given and ended name who, which role and where', () => {
  assert.equal(changeWords(c('grant', { whom: 'claude-code', role: 'proposer', scope: 'noi' }), roles), 'hiddenstack gave claude-code Proposer in noi.')
  assert.equal(changeWords(c('end-grant', { whom: 'claude-code', role: 'proposer', scope: 'noi.eio' }), roles), 'hiddenstack ended claude-code’s Proposer in noi.eio.')
  assert.equal(changeWords(c('grant', { whom: 'ada', role: 'reader', scope: 'noi' })), 'hiddenstack gave ada Reader in noi.', 'a role Mero does not name')
})

test('accounts arriving say how', () => {
  assert.equal(changeWords(c('setup')), 'hiddenstack set up Governance, as its first owner.')
  assert.equal(changeWords(c('add-agent', { detail: { handle: 'claude-code', sponsor: 'hiddenstack' } })), 'hiddenstack added the agent claude-code, sponsored by hiddenstack.')
  assert.equal(changeWords(c('voucher-add', { by: null, detail: { name: 'hyperbase:this-mac' } })), 'hyperbase:this-mac may now vouch for agents.')
  assert.equal(changeWords(c('invite', { detail: { handle: 'steward' } })), 'hiddenstack invited steward.')
  assert.equal(changeWords(c('sign-up', { by: 'ada', whom: 'ada', detail: { handle: 'ada' } })), 'ada signed up.')
})

test('a copy from Mero names what got a new revision', () => {
  assert.equal(changeWords(c('copy', { by: null, changed: ['noi.gov.roles.observer@5'] }), roles), 'Observer (revision 5) changed in Mero.')
  assert.equal(
    changeWords(c('copy', { by: null, changed: ['noi.gov.roles.observer@5', 'noi.gov.rules.fresh-touch@4'] }), roles),
    'Observer (revision 5) and the rule fresh-touch (revision 4) changed in Mero.',
  )
  assert.equal(
    changeWords(c('copy', { by: null, changed: ['noi.gov.roles.a@1', 'noi.gov.roles.b@1', 'noi.gov.roles.c@1', 'noi.gov.roles.d@1', 'noi.gov.roles.e@1'] })),
    'A (revision 1), B (revision 1), C (revision 1) and 2 more changed in Mero.',
  )
})

// The record page (9 Nov, step 5): every entry in words, and a refusal's reason beside it.
const e = (kind, more = {}) => ({ ...c(kind), who: 'hiddenstack', action: null, places: [], allowed: true, reason: 'allowed', ...more })

test('decisions say who, what and where; a refusal keeps its reason', () => {
  assert.deepEqual(recordWords(e('decision', { action: 'review', places: ['noi.eio.color'] })), {
    text: 'hiddenstack was allowed to approve, send back or reject in Review: noi.eio.color.', why: undefined,
  })
  const refused = recordWords(e('decision', { by: 'visitors', action: 'read', places: ['noi'], allowed: false, reason: 'no grant allows read' }))
  assert.equal(refused.text, 'Someone signed out was refused reading: noi.')
  assert.equal(refused.why, 'no grant allows read')
  assert.equal(
    recordWords(e('decision', { action: 'grant', places: ['account:1'], whom: 'claude-code' })).text,
    'hiddenstack was allowed to grant roles: claude-code.',
  )
})

test('signing in, touches and Your account read as what happened', () => {
  assert.equal(recordWords(e('sign-in')).text, 'hiddenstack signed in.')
  assert.equal(recordWords(e('sign-in', { by: null, allowed: false, reason: 'that passkey is not one of this person’s' })).text, 'A sign-in failed.')
  assert.equal(recordWords(e('touch', { detail: { intent: { action: 'review' } } })).text, 'hiddenstack confirmed with Touch ID, for deciding in Review.')
  assert.equal(recordWords(e('touch', { detail: { intent: { action: 'remove-my-passkey' } } })).text, 'hiddenstack confirmed with Touch ID, for removing a passkey.')
  assert.equal(recordWords(e('passkey-remove', { detail: { name: 'hiddenstack', sign_ins_ended: 1 } })).text, 'hiddenstack removed a passkey “hiddenstack”, ending the sign-in it made.')
  assert.equal(recordWords(e('email-set', { reason: 'email changed, from a link sent to it' })).text, 'hiddenstack’s email changed, from a link sent to it.')
  assert.equal(recordWords(e('notice', { detail: { about: 'passkey-add' } })).text, 'A notice went to hiddenstack’s email: a passkey was added.')
  assert.equal(recordWords(e('sign-out', { reason: 'ended every other sign-in, on Your account' })).text, 'hiddenstack ended every other sign-in, on Your account.')
  assert.equal(recordWords(e('run-token', { by: 'claude-code', detail: { vouched_by: 'hyperbase:this-mac' } })).text, 'claude-code started a run, vouched for by hyperbase:this-mac.')
})

test('changes read as on the home; a copy that moved nothing says so', () => {
  assert.equal(recordWords(e('grant', { whom: 'claude-code', role: 'proposer', scope: 'noi' }), roles).text, 'hiddenstack gave claude-code Proposer in noi.')
  assert.equal(recordWords(e('copy', { by: null, changed: [] })).text, 'Mero’s roles and rules were copied; nothing changed.')
  assert.equal(recordWords(e('copy', { by: null, changed: ['noi.gov.roles.observer@5'] }), roles).text, 'Observer (revision 5) changed in Mero.')
})

test('roles and rules kept by Governance read as what was done to which (step 3)', () => {
  assert.equal(
    changeWords(c('approve', { detail: { path: 'noi.gov.roles.proposer', revision: 5, state: 'active' } }), roles),
    'hiddenstack approved Proposer (revision 5).',
  )
  assert.equal(
    changeWords(c('approve', { detail: { path: 'noi.gov.roles.observer', revision: 6, state: 'retired' } }), roles),
    'hiddenstack approved Observer (revision 6), retiring it.',
  )
  assert.equal(
    changeWords(c('move', { by: null, detail: { roles: 4, rules: 2 } })),
    'Roles and rules moved in from Mero, with every revision: 4 roles and 2 rules.',
  )
  const e = (kind, more = {}) => ({ ...c(kind), who: null, action: null, places: ['noi.gov.rules.fresh-touch'], allowed: true, reason: '', ...more })
  assert.equal(recordWords(e('propose')).text, 'hiddenstack proposed a change to the rule fresh-touch.')
  assert.equal(recordWords(e('reject')).text, 'hiddenstack rejected a change to the rule fresh-touch.')
  const refused = recordWords(e('approve', { allowed: false, reason: 'no one could change roles and rules after this' }))
  assert.equal(refused.text, 'hiddenstack could not approve a change to the rule fresh-touch.')
  assert.match(refused.why, /no one could change/)
  assert.match(recordWords(e('recover', { by: 'hiddenstack', places: ['noi.gov'], detail: { handle: 'hiddenstack' } })).text, /back within hiddenstack’s reach/)
})
