#!/usr/bin/env node
// Landing a branch on main (18 Nov, the user: "do you think we can also have the landing script?").
// One command that says whether a branch may land, and with --merge lands it. It stops at the first
// thing that is not right, and says what.
//
//   1. The branch: not main, nothing uncommitted; to merge, the same as on GitHub.
//   2. The checks GitHub runs, here first: Rust (format, clippy, tests; the database tests too when
//      NOI_TEST_ADMIN_URL is set), the component merons match the code, the type checks, the tests.
//   3. What you approved: Mero's own check (noi check-approved): every component's meron and the
//      component rule in the branch are exactly what Mero holds, and Mero holds no component the
//      branch lacks. On a pushed branch Mero posts the answer on GitHub as "Mero approved".
//   4. Its pull request to main: open, and GitHub's checks green.
//   5. With --merge: merges it, with a merge commit, so every commit stays as it was, and tells Mero,
//      so what you approved for this code takes effect (noi landed).
//
// Usage, from anywhere in the repository:
//   pnpm land               says whether the current branch may land
//   pnpm land --merge       and lands it
//   pnpm land --skip-local  leaves step 2 to GitHub (when the same commit was just checked here)
//
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NOI = join(ROOT, 'noi')
const merge = process.argv.includes('--merge')
const skipLocal = process.argv.includes('--skip-local')

const say = words => console.log(`\n· ${words}`)
const stop = words => {
  console.error(`\n✗ ${words}`)
  process.exit(1)
}
/** Runs a command where everyone can see it; stops on failure. */
const run = (cwd, cmd, args, env = {}) => {
  console.log(`  $ ${[cmd, ...args].join(' ')}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.status !== 0) stop(`${cmd} ${args.join(' ')} failed: fix it, commit, push, and run this again`)
}
/** Runs a command quietly and gives back what it printed. */
const read = (cwd, cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 28 })
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}
const git = (...args) => read(ROOT, 'git', args)

// 1 · The branch.
say('The branch')
const branch = git('branch', '--show-current').out
if (!branch) stop('not on a branch')
if (branch === 'main') stop('this is main: land a branch onto it')
if (git('status', '--porcelain').out) stop('there are uncommitted changes: commit them first')
read(ROOT, 'git', ['fetch', '-q', 'origin', branch, 'main'])
const here = git('rev-parse', 'HEAD').out
const there = git('rev-parse', `origin/${branch}`)
const pushed = there.ok && there.out === here
if (pushed) console.log(`  ${branch} at ${here.slice(0, 7)}, the same as on GitHub`)
else if (merge) stop(`${branch} here and on GitHub differ: push it first`)
else console.log(`  ${branch} at ${here.slice(0, 7)}, not yet the same on GitHub: checking it here only`)

// 2 · The checks GitHub runs.
if (skipLocal) {
  say('The checks: left to GitHub (--skip-local)')
} else {
  say('Rust: format, clippy, tests')
  run(NOI, 'cargo', ['fmt', '--all', '--', '--check'])
  run(NOI, 'cargo', ['clippy', '--locked', '--workspace', '--all-targets', '--all-features', '--', '-D', 'warnings'])
  run(NOI, 'cargo', ['test', '--locked', '--workspace', '--all-features'])
  if (process.env.NOI_TEST_ADMIN_URL) run(NOI, 'cargo', ['test', '--locked', '--workspace', '--all-features', '--', '--ignored'])
  else console.log('  (the database tests: set NOI_TEST_ADMIN_URL to run them here; GitHub runs them)')
  say('The app and the Eidos packages')
  run(ROOT, 'node', ['noi/scripts/eio-components.mjs', '--check'])
  run(ROOT, 'pnpm', ['-r', '--filter', './ui/**', 'run', 'typecheck'])
  run(ROOT, 'pnpm', ['-r', '--filter', './ui/**', 'test'])
}

// 3 · What you approved: Mero's own check (part B, decision 2), and on a pushed branch it posts the
//     answer on GitHub as "Mero approved", the check main requires (decision 3: Mero looks when asked).
say('What you approved in Mero')
const login = join(NOI, 'mero.local.env')
const noi = join(NOI, 'target/debug/noi')
if (!existsSync(login) || !existsSync(noi)) {
  console.log('  (Mero is not on this Mac: it cannot be asked here)')
} else {
  const env = Object.fromEntries(readFileSync(login, 'utf8').split('\n')
    .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  const asked = read(NOI, noi, ['check-approved', '--commit', here, ...(pushed ? ['--post'] : [])], env)
  let answer
  try { answer = JSON.parse(asked.out) } catch { stop(`Mero could not be asked: ${(asked.err || asked.out).split('\n')[0]}`) }
  if (!answer.approved) stop(`what lands must be what you approved:\n  ${answer.problems.join('\n  ')}`)
  console.log(`  ${answer.words}${answer.posted ? ', posted on GitHub as “Mero approved”' : ''}`)
}

// 4 · The pull request.
if (!pushed) {
  say('Ready on this Mac. Push it, and open its pull request to main, for GitHub to check it')
  process.exit(0)
}
say('Its pull request to main')
const pr = read(ROOT, 'gh', ['pr', 'view', branch, '--json', 'number,url,state,baseRefName,isDraft,statusCheckRollup'])
if (!pr.ok) stop(`no pull request for ${branch}: open one with  gh pr create --base main`)
const p = JSON.parse(pr.out)
if (p.state !== 'OPEN') stop(`pull request ${p.url} is ${p.state.toLowerCase()}`)
if (p.baseRefName !== 'main') stop(`pull request ${p.url} goes into ${p.baseRefName}, not main`)
if (p.isDraft) stop(`pull request ${p.url} is a draft`)
console.log(`  ${p.url}`)
const pending = () => (JSON.parse(read(ROOT, 'gh', ['pr', 'view', branch, '--json', 'statusCheckRollup']).out).statusCheckRollup ?? [])
const verdict = checks => {
  const failed = checks.filter(c => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(c.conclusion ?? c.state))
  const waiting = checks.filter(c => c.status && c.status !== 'COMPLETED')
  return { failed, waiting }
}
let { failed, waiting } = verdict(p.statusCheckRollup ?? [])
if (failed.length) stop(`GitHub's checks failed: ${failed.map(c => c.name ?? c.context).join(', ')}. See ${p.url}/checks`)
if (waiting.length && merge) {
  console.log(`  waiting for GitHub's checks: ${waiting.map(c => c.name ?? c.context).join(', ')}`)
  run(ROOT, 'gh', ['pr', 'checks', branch, '--watch', '--fail-fast'])
  ;({ failed, waiting } = verdict(pending()))
  if (failed.length) stop(`GitHub's checks failed: ${failed.map(c => c.name ?? c.context).join(', ')}`)
} else if (waiting.length) {
  console.log(`  GitHub's checks still running: ${waiting.map(c => c.name ?? c.context).join(', ')}`)
} else {
  console.log('  GitHub\'s checks green')
}

// 5 · Landing.
if (!merge) {
  say(`Ready to land: run  pnpm land --merge  to merge ${p.url}`)
  process.exit(0)
}
say('Landing')
run(ROOT, 'gh', ['pr', 'merge', String(p.number), '--merge', '--match-head-commit', here])
// What you approved for this code takes effect now, in Mero too (part B, decision 4).
if (existsSync(join(NOI, 'mero.local.env')) && existsSync(join(NOI, 'target/debug/noi'))) {
  const env = Object.fromEntries(readFileSync(join(NOI, 'mero.local.env'), 'utf8').split('\n')
    .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  const landed = read(NOI, join(NOI, 'target/debug/noi'), ['landed'], env)
  if (!landed.ok) stop(`merged, but Mero has not taken it yet: ${(landed.err || landed.out).split('\n')[0]}. Run noi landed`)
  const n = JSON.parse(landed.out).landed.length
  console.log(`  Mero took ${n} approved batch${n === 1 ? '' : 'es'} that waited for this code`)
}
console.log(`\n✓ ${branch} landed on main`)
