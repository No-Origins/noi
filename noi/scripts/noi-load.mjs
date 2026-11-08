#!/usr/bin/env node
// Proposes every meron file under a data folder to Mero as one batch, as an agent. You approve it
// in the Explorer, with your touch: approval adds each meron, files it under its system, and
// registers and activates it, all or nothing. Merons already in Mero are skipped.
//
// Usage: node scripts/noi-load.mjs data/eio
// Needs DATABASE_URL (Mero's login, from mero.local.env) and Governance running. The agent is
// NOI_PROPOSER (default design-agent): an account an owner added, with a role that may propose
// there, vouched for by this Mac's key (NOI_VOUCH_KEY). NOI_BIN defaults to target/debug/noi.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const [dir] = process.argv.slice(2)
if (!dir) {
  console.error('usage: node scripts/noi-load.mjs DATA_DIR')
  process.exit(2)
}
const BIN = process.env.NOI_BIN ?? 'target/debug/noi'
const PROPOSER = process.env.NOI_PROPOSER ?? 'design-agent'

const noi = (...args) => {
  try {
    return { ok: JSON.parse(execFileSync(BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }).toString()) }
  } catch (e) {
    return { error: (e.stderr?.toString() || e.message).trim() }
  }
}

const files = []
const walk = d => readdirSync(d).sort().forEach(f => {
  const p = join(d, f)
  if (statSync(p).isDirectory()) walk(p)
  else if (p.endsWith('.json')) files.push(p)
})
walk(dir)
const fresh = files.filter(file => {
  const { path } = JSON.parse(readFileSync(file, 'utf8'))
  // Reading, as the operator.
  const got = noi('get', path)
  if (got.ok) return false
  if (!/NotFound/.test(got.error)) throw new Error(`${path}: ${got.error}`)
  return true
})
if (!fresh.length) {
  console.log(`nothing to load: every meron in ${dir} is already in Mero`)
  process.exit(0)
}
const sent = noi('propose', '--agent', PROPOSER, '--title', `Load ${relative(process.cwd(), dir) || dir}`, ...fresh)
if (sent.error) throw new Error(sent.error)
const failing = sent.ok.proposals.filter(p => !p.outcome.ok)
if (failing.length) {
  for (const p of failing) console.error(`${p.change.meron?.path ?? p.change.uid}: ${p.outcome.error}`)
  console.error(`batch ${sent.ok.uid} waits in Review; ${failing.length} of ${fresh.length} fail their test run`)
  process.exit(1)
}
console.log(`proposed ${fresh.length} merons from ${dir} as ${PROPOSER}: batch ${sent.ok.uid} waits in Review for your touch`)
