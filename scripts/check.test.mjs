import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runChecks } from './check.mjs'

function execute(args, { env = {}, result = () => ({ status: 0 }) } = {}) {
  const calls = []
  const messages = []
  const status = runChecks(args, {
    env,
    log: message => messages.push(message),
    error: message => messages.push(message),
    run: (command, argv, options) => {
      calls.push({ command, argv, options })
      return result(calls.length)
    },
  })
  return { status, calls, messages }
}

test('a failing check stops subsequent checks and preserves its exit code', () => {
  const { status, calls, messages } = execute(['--app'], { result: () => ({ status: 7 }) })
  assert.equal(status, 7)
  assert.equal(calls.length, 1)
  assert.match(messages.at(-1), /Failed: Component records/)
  assert.ok(!messages.some(message => message.includes('checks passed')))
})

test('missing tools and terminated processes fail instead of reporting success', () => {
  for (const result of [{ status: null, error: new Error('spawn ENOENT') }, { status: null, signal: 'SIGTERM' }]) {
    const { status, calls } = execute(['--rust'], { result: () => result })
    assert.equal(status, 1)
    assert.equal(calls.length, 1)
  }
})

test('invalid options and unavailable explicit database checks run nothing', () => {
  for (const args of [['--ap'], ['--database'], ['--app', '--database']]) {
    const { status, calls } = execute(args)
    assert.equal(status, 2)
    assert.equal(calls.length, 0)
  }
  const appOnly = execute(['--app', '--database'], { env: { NOI_TEST_ADMIN_URL: 'test-postgres' } })
  assert.equal(appOnly.status, 2)
  assert.equal(appOnly.calls.length, 0)
})

test('database tests are opt-in and the URL is never printed or passed as an argument', () => {
  const ordinary = execute(['--rust'])
  assert.ok(!ordinary.calls.some(call => call.argv.includes('--ignored')))
  const url = 'postgresql://test-secret@localhost/test'
  const database = execute(['--rust', '--database'], { env: { NOI_TEST_ADMIN_URL: url } })
  const call = database.calls.find(call => call.argv.includes('--ignored'))
  assert.ok(call)
  assert.equal(call.options.env.NOI_TEST_ADMIN_URL, url)
  assert.ok(!JSON.stringify(database.messages).includes(url))
  assert.ok(!JSON.stringify(database.calls.map(call => call.argv)).includes(url))
})

test('default checks include script tests and the production build; app-only runs no Cargo', () => {
  const all = execute([])
  assert.equal(all.status, 0)
  assert.ok(all.calls.some(call => call.argv.includes('scripts/merge-async.test.mjs')))
  assert.ok(all.calls.some(call => call.command === 'cargo'))
  assert.deepEqual(all.calls.at(-1).argv, ['--filter', 'explorer', 'build'])
  const app = execute(['--app'])
  assert.equal(app.status, 0)
  assert.ok(app.calls.every(call => call.command !== 'cargo'))
})

test('help needs no tools or services', () => {
  const { status, calls } = execute(['--help'])
  assert.equal(status, 0)
  assert.equal(calls.length, 0)
})
