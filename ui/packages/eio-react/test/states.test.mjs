// Component States (agreed 18 Nov 2026), decision 4, the half a test can see: every option Mero holds
// for a component is read through a table that names every key (Record<Type, …>), with Type from the
// file Mero writes (@noi/eio-tokens/components.ts), so the type check ties the keys to the code; and
// everything that happens to a component (hovered, focused, disabled …) has a rule in its style file.
// Comments are taken out first: only what the code does counts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { posix } from 'node:path'
import { states } from '../../eio-tokens/components.ts'

const SRC = new URL('../src/', import.meta.url)
/** Code without its comments (a // after a colon or a backslash is part of an address or a pattern). */
const uncommented = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
const read = f => uncommented(readFileSync(new URL(f, SRC), 'utf8'))
// Every file, by its place under src/: each component in its own folder (Button/Button.tsx).
const files = readdirSync(SRC, { recursive: true })
const sources = Object.fromEntries(files.filter(f => /\.tsx?$/.test(f)).map(f => [f, read(f)]))
const code = Object.values(sources).join('\n')
const pascal = s => s.split(/[.-]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('')
/** The selectors of a style file's rules (inside @media too). */
const selectors = css => [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim())
// What happens to a component, and the selector that draws it.
const RULE = {
  hover: /:hover\b/, focus: /:focus-visible\b|:focus-within\b/, disabled: /:disabled\b/, checked: /:checked\b/,
  open: /\[open\]/, arriving: /\[data-motion='in'\]/, leaving: /\[data-motion='out'\]/,
}
const ours = Object.entries(states).filter(([path]) => !path.startsWith('noi.eio.components.world.'))

test('Mero holds states for the components of this package', () => {
  assert.ok(ours.length >= 18, `found ${ours.length}`)
})

test('no table is forced into shape: a cast would let it leave keys out', () => {
  assert.doesNotMatch(code, /\bas\s+(?:Partial<\s*)?Record\s*</, 'a table cast with as')
  assert.doesNotMatch(code, /\bas\s+unknown\s+as\b/, 'a cast through unknown')
  assert.doesNotMatch(code, /Partial<\s*Record\s*</, 'a partial table may leave keys out')
})

for (const [path, groups] of ours) {
  const name = pascal(path.replace('noi.eio.components.', ''))
  const own = sources[`${name}/${name}.tsx`] ?? ''
  for (const [group, keys] of Object.entries(groups)) {
    const type = name + pascal(group)
    if (group === 'interaction') {
      test(`${path}: a style rule of its own for each thing that happens to it`, () => {
        // Its own style file, and those it imports (Checkbox and Radio draw with the Choice box); a rule
        // counts when its selector names a class the component's code gives.
        const sheets = [...own.matchAll(/import (\w+) from '(\.{1,2}\/[\w/.-]+\.module\.css)'/g)]
          .map(([, as, spec]) => ({ as, file: posix.normalize(`${name}/${spec}`) }))
        let given = null
        if (own) given = new Set(sheets.flatMap(({ as }) => [...own.matchAll(new RegExp(`\\b${as}\\.(\\w+)`, 'g'))].map(m => m[1])))
        else if (existsSync(new URL(`${name}/${name}.module.css`, SRC))) sheets.push({ file: `${name}/${name}.module.css` })
        const rules = sheets.flatMap(({ file }) => selectors(read(file)))
        assert.ok(rules.length, `${name} has no style file`)
        const mine = sel => given === null || [...given].some(c => new RegExp(`\\.${c}(?![\\w-])`).test(sel))
        for (const key of keys) {
          assert.ok(RULE[key], `no rule is known for “${key}”: add it to this test`)
          assert.ok(rules.some(sel => RULE[key].test(sel) && mine(sel)), `${name}: no rule of its own draws “${key}”`)
        }
      })
    } else {
      test(`${path}: ${group} is read through a table of Mero’s ${type}`, () => {
        assert.match(code, new RegExp(`import type \\{[^}]*\\b${type}\\b[^}]*\\} from '@noi/eio-tokens/components'`), `${type} is not taken from Mero’s file`)
        // The table, and something that looks an option up in it (TABLE[key] or TABLE.key): in its own file, or anywhere if it is exported.
        const tables = Object.entries(sources).flatMap(([file, src]) =>
          [...src.matchAll(new RegExp(`(\\bexport\\s+)?\\b(?:const|let|var)\\s+(\\w+)\\s*:\\s*Record<${type},`, 'g'))]
            .map(([, exported, table]) => ({ file, table, exported: Boolean(exported) })))
        assert.ok(tables.length > 0, `no table Record<${type}, …> in the code`)
        for (const { file, table, exported } of tables) {
          assert.match(exported ? code : sources[file], new RegExp(`\\b${table}(?:\\[|\\.\\w)`), `${file}: ${table} is never read`)
        }
        // A prop named for the group takes Mero's type, never a string of its own.
        for (const [, body] of own.matchAll(/\binterface\s+\w+[^{]*\{([\s\S]*?)\n\}/g)) {
          const member = body.match(new RegExp(`^\\s*(?:readonly\\s+)?${group}\\??:\\s*([^\\n]+)$`, 'm'))
          if (member) assert.match(member[1], new RegExp(`\\b${type}\\b`), `${name}’s ${group} is not typed as Mero’s ${type}`)
        }
      })
    }
  }
}
