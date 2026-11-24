#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HELP = `Usage: pnpm check [--scripts] [--app] [--rust] [--database]

With no scope, runs all checks: development scripts, app and Rust.
--app       Component records, TypeScript, UI tests and production build
--rust      Formatting, Clippy and Rust tests with all features
--scripts   Development script tests
--database  Require NOI_TEST_ADMIN_URL and run Rust's database tests too

Database tests also run when Rust is selected and NOI_TEST_ADMIN_URL is set.
Browser fit checks need running services: pnpm --filter explorer test:fit.
Mero approval and landing are checked separately by pnpm land.
`

/** Local verification, independent of branch, GitHub credentials and running application servers. */
export function runChecks(args, { env = process.env, run = spawnSync, log = console.log, error = console.error } = {}) {
  const known = new Set(['--scripts', '--app', '--rust', '--database', '--help', '-h'])
  const unknown = args.filter(arg => !known.has(arg))
  if (unknown.length) {
    error(`Unknown option: ${unknown.join(', ')}\n${HELP}`)
    return 2
  }
  if (args.includes('--help') || args.includes('-h')) {
    log(HELP)
    return 0
  }
  const scopes = args.filter(arg => ['--scripts', '--app', '--rust'].includes(arg))
  const selected = scope => scopes.length === 0 || scopes.includes(`--${scope}`)
  if (args.includes('--database') && (!selected('rust') || !env.NOI_TEST_ADMIN_URL)) {
    error('--database needs the Rust checks and NOI_TEST_ADMIN_URL pointing to a test Postgres server.')
    return 2
  }

  const checks = []
  const add = (name, cwd, command, ...argv) => checks.push({ name, cwd, command, argv })
  if (selected('scripts')) {
    const tests = readdirSync(join(ROOT, 'scripts')).filter(name => name.endsWith('.test.mjs')).sort()
    add('Development script tests', ROOT, process.execPath, '--test', ...tests.map(name => join('scripts', name)))
  }
  if (selected('rust')) {
    const noi = join(ROOT, 'noi')
    add('Rust formatting', noi, 'cargo', 'fmt', '--all', '--', '--check')
    add('Rust lint', noi, 'cargo', 'clippy', '--locked', '--workspace', '--all-targets', '--all-features', '--', '-D', 'warnings')
    add('Rust tests', noi, 'cargo', 'test', '--locked', '--workspace', '--all-features')
    if (env.NOI_TEST_ADMIN_URL) {
      add('Rust database tests', noi, 'cargo', 'test', '--locked', '--workspace', '--all-features', '--', '--ignored')
    } else {
      log('Database tests skipped: NOI_TEST_ADMIN_URL is unset; CI runs them against Postgres.')
    }
  }
  if (selected('app')) {
    add('Component records match the code', ROOT, process.execPath, 'noi/scripts/eio-components.mjs', '--check')
    add('TypeScript', ROOT, 'pnpm', '-r', '--filter', './ui/**', 'run', 'typecheck')
    add('UI tests', ROOT, 'pnpm', '-r', '--filter', './ui/**', 'test')
    add('Explorer production build', ROOT, 'pnpm', '--filter', 'explorer', 'build')
  }
  for (const { name, cwd, command, argv } of checks) {
    log(`\n· ${name}`)
    const result = run(command, argv, { cwd, stdio: 'inherit', env: { ...env, NEXT_TELEMETRY_DISABLED: '1' } })
    if (result.error || result.signal || result.status !== 0) {
      error(`Failed: ${name}${result.error ? ` (${result.error.message})` : result.signal ? ` (${result.signal})` : ''}`)
      return result.status || 1
    }
  }
  log('\n✓ Selected checks passed')
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runChecks(process.argv.slice(2))
}
