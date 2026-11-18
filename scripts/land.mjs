#!/usr/bin/env node
// Landing a branch on main (18 Nov, the user: "do you think we can also have the landing script?").
// One command that says whether a branch may land, and with --merge lands it. It stops at the first
// thing that is not right, and says what.
//
//   1. The branch: not main, nothing uncommitted; to merge, the same as on GitHub.
//   2. The checks GitHub runs, here first: Rust (format, clippy, tests; the database tests too when
//      NOI_TEST_ADMIN_URL is set), the component merons match the code, the type checks, the tests.
//   3. What you approved: when Mero's login is on this Mac (noi/mero.local.env), every component's
//      meron and the component rule in the branch are exactly what Mero holds, and Mero holds no
//      component the branch lacks. Code nobody approved does not land.
//   4. Its pull request to main: open, and GitHub's checks green.
//   5. With --merge: merges it, with a merge commit, so every commit stays as it was.
//
// Usage, from anywhere in the repository:
//   pnpm land               says whether the current branch may land
//   pnpm land --merge       and lands it
//   pnpm land --skip-local  leaves step 2 to GitHub (when the same commit was just checked here)
//
// Part B of "Components in Mero" will add the last step: telling Mero that what you approved has
// landed, so an approval takes effect only then.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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

// 3 · What you approved.
say('What you approved in Mero')
const login = join(NOI, 'mero.local.env')
const noi = join(NOI, 'target/debug/noi')
if (!existsSync(login) || !existsSync(noi)) {
  console.log('  (Mero is not reachable from here: GitHub cannot check this until part B)')
} else {
  const env = Object.fromEntries(readFileSync(login, 'utf8').split('\n')
    .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  const exported = read(NOI, noi, ['export'], env)
  if (!exported.ok) stop(`Mero could not be read: ${exported.err.split('\n')[0]}`)
  const held = new Map(JSON.parse(exported.out).merons.map(m => [m.identity.path, m]))
  const walk = dir => readdirSync(dir).flatMap(f => statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)])
  const files = [join(NOI, 'data/eio/component-invariant.json'), ...walk(join(NOI, 'data/eio/components')).filter(f => f.endsWith('.json'))]
  const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
  const problems = []
  const inBranch = new Set()
  for (const file of files) {
    const m = JSON.parse(readFileSync(file, 'utf8'))
    inBranch.add(m.path)
    const h = held.get(m.path)
    if (!h) problems.push(`${m.path}: not in Mero. Propose it, and approve it in Review`)
    else if (h.lifecycle.state !== 'active' && h.lifecycle.state !== 'deprecated') problems.push(`${m.path}: ${h.lifecycle.state} in Mero, not active`)
    else if (!same(h.spec, m.spec) || !same(h.semantics, m.semantics) || h.identity.name !== m.name) {
      problems.push(`${m.path}: not what you approved in Mero. Propose the change, and approve it in Review`)
    }
  }
  for (const [path, h] of held) {
    if (path.startsWith('noi.eio.components.') && ['active', 'deprecated'].includes(h.lifecycle.state) && !inBranch.has(path)) {
      problems.push(`${path}: ${h.lifecycle.state} in Mero, but the branch has no meron for it`)
    }
  }
  if (problems.length) stop(`what lands must be what you approved:\n  ${problems.join('\n  ')}`)
  console.log(`  ${files.length} merons, each exactly what Mero holds`)
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
console.log(`\n✓ ${branch} landed on main`)

/** The same object with its keys in one order, so two are compared by what they hold. */
function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])]))
  return v
}
