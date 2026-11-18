#!/usr/bin/env node
// The component merons in data/eio/components, brought in line with the code ("Components in Mero",
// agreed 17 Nov 2026). A person writes each meron's name, job, states and the files it holds; this
// script fills in what the code itself says, so nobody types it by hand:
//   files  each file's fingerprint: the SHA-256 of its bytes;
//   reads  the Eidos values its files name: a CSS variable (var(--eio-…)), a text style's class
//          (eio-type-style-…), or a value's path in Mero (noi.eio.…; a group's path means every value
//          in it);
//   uses   the merons whose files its files import, or name by their place in the package (the
//          characters' model files).
// It also says which files of each package no meron lists, or two do, and which file of a component
// sits outside its folder.
//
// Usage, from noi/:  node scripts/eio-components.mjs          writes the merons' files
//                    node scripts/eio-components.mjs --check  only says what differs; fails if anything does
//                    node scripts/eio-components.mjs --order  prints the merons' files in the order to
//                      propose them: each after the components it uses (a batch adds them in order)
//
// Mero, not this script, holds what you approved: these files are what an agent proposes.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const NOI = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = join(NOI, '..')
const DATA = join(NOI, 'data/eio')
const COMPONENTS = join(DATA, 'components')
const PACKAGES = { '@noi/eio-react': 'ui/packages/eio-react', '@noi/eio-3d': 'ui/packages/eio-3d' }
const check = process.argv.includes('--check')
const order = process.argv.includes('--order')

const walk = (dir, keep = () => true) =>
  readdirSync(dir).flatMap(name => {
    if (name.startsWith('.') || name === 'node_modules') return []
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p, keep) : keep(p) ? [p] : []
  })

// Every meron in data/eio: its kind and subtype, by path.
const merons = new Map()
for (const f of walk(DATA, p => p.endsWith('.json'))) {
  const m = JSON.parse(readFileSync(f, 'utf8'))
  if (m.path) merons.set(m.path, { file: f, kind: m.classification?.type, subtype: m.classification?.subtype, meron: m })
}
const values = [...merons].filter(([, m]) => m.kind === 'token').map(([p]) => p).sort()
const styles = values.filter(p => merons.get(p).subtype === 'text-style')
const cssName = p => `--eio-${p.replace(/^noi\.eio\./, '').replaceAll('.', '-')}`
const byCss = new Map(values.map(p => [cssName(p), p]))
// The window variables switch with the window class; each class sets the margin role named after it.
const windows = values.filter(p => merons.get(p).subtype === 'window')
const margins = windows.map(p => `noi.eio.space.margin.${p.split('.').pop()}`)

/** The values a CSS variable stands for, or null when Eidos has no such variable. */
function cssValues(name) {
  if (byCss.has(name)) return [byCss.get(name)]
  const style = styles.find(p => name.startsWith(cssName(p) + '-'))
  if (style) return [style]
  if (name === '--eio-window-margin') return [...windows, ...margins]
  if (/^--eio-window-(panes|one-pane|two-panes)$/.test(name)) return windows
  return null
}

/** The values a file's text names. */
function reads(text, where, problems) {
  const out = new Set()
  for (const [, name] of text.matchAll(/var\(\s*(--eio-[a-z0-9-]+)/g)) {
    const v = cssValues(name)
    if (v) v.forEach(p => out.add(p))
    else problems.push(`${where}: Eidos has no ${name}`)
  }
  for (const [, name] of text.matchAll(/\beio-type-style-([a-z0-9]+)\b/g)) {
    const p = `noi.eio.type.style.${name}`
    if (styles.includes(p)) out.add(p)
    else problems.push(`${where}: Eidos has no text style ${name}`)
  }
  for (const [path] of text.matchAll(/\bnoi\.eio(?:\.[a-z][a-z0-9-]*)+/g)) {
    if (path === 'noi.eio.components' || path.startsWith('noi.eio.components.')) continue
    const group = values.filter(p => p === path || p.startsWith(path + '.'))
    if (group.length) group.forEach(p => out.add(p))
    else problems.push(`${where}: names ${path}, which is not a value in Eidos`)
  }
  return out
}

// The component merons, and the files each lists.
const components = walk(COMPONENTS, p => p.endsWith('.json')).sort().map(file => ({ file, meron: JSON.parse(readFileSync(file, 'utf8')) }))
const problems = []
const owners = new Map() // "package file" → meron paths
const key = (pkg, path) => `${pkg} ${path}`
// One folder per meron (18 Nov, the user: "Yes, move them"): a component's or a shared part's files sit
// in a folder named for it, as the code names it (Button/ for noi.eio.components.button, character-drawing/
// for …world.character-drawing). The package's own files sit outside every such folder.
const folderOf = path => path.split('/').slice(-2, -1)[0] ?? ''
const sameName = (a, b) => a.toLowerCase().replaceAll('-', '') === b.toLowerCase().replaceAll('-', '')
for (const { meron } of components) {
  const { package: pkg, files, part } = meron.spec
  if (!PACKAGES[pkg]) problems.push(`${meron.path}: no package ${pkg}`)
  for (const { path } of files) owners.set(key(pkg, path), [...(owners.get(key(pkg, path)) ?? []), meron.path])
  const slug = meron.path.split('.').at(-1)
  for (const { path } of part === 'package' ? [] : files) {
    if (!sameName(folderOf(path), slug)) problems.push(`${meron.path} ${path}: not in its folder (one named ${slug})`)
  }
}
for (const [pkg, dir] of Object.entries(PACKAGES)) {
  const onDisk = walk(join(ROOT, dir)).map(f => relative(join(ROOT, dir), f).split('\\').join('/'))
  for (const f of onDisk) {
    const o = owners.get(key(pkg, f)) ?? []
    if (o.length === 0) problems.push(`${pkg} ${f}: no meron lists it`)
    if (o.length > 1) problems.push(`${pkg} ${f}: listed by ${o.join(' and ')}`)
  }
  for (const k of owners.keys()) {
    const [p, f] = k.split(' ')
    if (p === pkg && !onDisk.includes(f)) problems.push(`${pkg} ${f}: listed, but not in the package`)
  }
}

/** The package file an import or a mention points at, if any. An import written with .js or .jsx names
 * the .ts or .tsx file it is compiled from. */
function target(dir, pkgFiles, from, spec) {
  const base = normalize(join(dirname(from), spec)).split('\\').join('/')
  const stems = [base, base.replace(/\.jsx?$/, '')]
  for (const stem of stems) {
    for (const ext of ['', '.ts', '.tsx', '.mjs', '.css', '/index.ts', '/index.tsx']) if (pkgFiles.includes(stem + ext)) return stem + ext
  }
  return null
}

// Relative imports: `from './x'`, `import('./x')`, and an import for its effect only, `import './x.css'`.
const IMPORTS = [
  /\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g,
  /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
  /\bimport\s+['"](\.{1,2}\/[^'"]+)['"]/g,
]

let changed = 0
for (const c of components) {
  const { meron } = c
  const { package: pkg } = meron.spec
  const dir = join(ROOT, PACKAGES[pkg] ?? '')
  const pkgFiles = [...owners.keys()].filter(k => k.startsWith(pkg + ' ')).map(k => k.split(' ')[1])
  const read = new Set(), uses = new Set(), files = []
  for (const { path } of [...meron.spec.files].sort((a, b) => a.path.localeCompare(b.path))) {
    const full = join(dir, path)
    if (!existsSync(full)) {
      files.push({ path, sha256: '' })
      continue
    }
    const bytes = readFileSync(full)
    files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') })
    if (!/\.(ts|tsx|mjs|css|json)$/.test(path)) continue
    const text = bytes.toString('utf8')
    reads(text, `${meron.path} ${path}`, problems).forEach(p => read.add(p))
    const imported = IMPORTS.flatMap(re => [...text.matchAll(re)].map(m => m[1]))
    // An import inside the package that leads to no listed file would drop a use without a word (a file
    // starting with "." cannot be listed at all): say so. An import of another package is not a use.
    const inside = spec => !normalize(join(dirname(path), spec)).split('\\').join('/').startsWith('../')
    for (const spec of imported.filter(inside)) {
      if (!target(dir, pkgFiles, path, spec)) problems.push(`${meron.path} ${path}: imports ${spec}, which is no listed file of ${pkg}`)
    }
    const found = [
      ...imported.map(spec => target(dir, pkgFiles, path, spec)),
      // A file named by its place in the package, such as a character's model ('clay/clay.glb').
      ...pkgFiles.filter(f => f !== path && f.split('/').length > 2 && text.includes(`'${f.split('/').slice(-2).join('/')}'`)),
    ]
    for (const f of found.filter(Boolean)) for (const o of owners.get(key(pkg, f)) ?? []) if (o !== meron.path) uses.add(o)
  }
  const spec = { ...meron.spec, reads: [...read].sort(), uses: [...uses].sort(), files }
  const before = JSON.stringify(meron.spec)
  if (JSON.stringify(spec) !== before) {
    changed++
    for (const field of ['reads', 'uses', 'files'])
      if (JSON.stringify(spec[field]) !== JSON.stringify(meron.spec[field])) problems.push(`${meron.path}: its ${field} differ from the code`)
    if (!check && !order) writeFileSync(c.file, JSON.stringify({ ...meron, spec }, null, 2) + '\n')
  }
}

if (order) {
  // Nothing to order while the data is wrong.
  const wrong = problems.filter(p => !p.includes('differ from the code'))
  if (wrong.length) {
    for (const p of wrong) console.error(p)
    process.exit(1)
  }
  // Each meron after the ones it uses, so that what it uses is already in Mero when it is added.
  const left = new Map(components.map(c => [c.meron.path, c]))
  const done = new Set()
  while (left.size) {
    const ready = [...left.values()].filter(c => c.meron.spec.uses.every(u => done.has(u) || !left.has(u)))
    if (!ready.length) throw new Error(`a circle among ${[...left.keys()].join(', ')}`)
    for (const c of ready) {
      console.log(relative(NOI, c.file))
      done.add(c.meron.path)
      left.delete(c.meron.path)
    }
  }
  process.exit(0)
}

const shown = check ? problems : problems.filter(p => !p.includes('differ from the code'))
for (const p of shown) console.log(p)
console.log(`${components.length} component merons, ${owners.size} files listed; ${check ? `${changed} differ from the code` : `${changed} written`}.`)
if (shown.length) process.exit(1)
