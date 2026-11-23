// Component States (agreed 18 Nov 2026), decision 4, for the 3D elements: every option Mero holds (a
// measure, a motion, a state, a setting, a colour) is read through a table typed from the file Mero writes;
// each character's model has the clips Mero lists; what happens to an element has a rule in its style file.
// Comments are taken out first: only what the code does counts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { states } from '../../eio-tokens/components.ts'

const PKG = fileURLToPath(new URL('../', import.meta.url))
const SRC = join(PKG, 'src')
/** Code without its comments (a // after a colon or a backslash is part of an address or a pattern). */
const uncommented = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
const all = readdirSync(SRC, { recursive: true })
const sources = Object.fromEntries(all.filter(f => /\.tsx?$/.test(f)).map(f => [f, uncommented(readFileSync(join(SRC, f), 'utf8'))]))
const code = Object.values(sources).join('\n')
const css = all.filter(f => f.endsWith('.css')).map(f => uncommented(readFileSync(join(SRC, f), 'utf8'))).join('\n')
/** The selectors of the style files' rules (inside @media too). */
const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim())
/** The classes the package's components give (styles.x). */
const given = new Set(Object.entries(sources).filter(([f]) => f.endsWith('.tsx')).flatMap(([, src]) => [...src.matchAll(/\bstyles\.(\w+)/g)].map(m => m[1])))
const pascal = s => s.split(/[.-]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('')
const RULE = { drag: /:active\b/, focus: /:focus-visible\b/ }
/** The names of the clips inside a model file (glTF binary: a header, then the JSON). */
function clips(file) {
  const b = readFileSync(file)
  const length = b.readUInt32LE(12)
  const json = JSON.parse(b.subarray(20, 20 + length).toString('utf8'))
  return (json.animations ?? []).map(a => a.name.toLowerCase())
}
const ours = Object.entries(states).filter(([path]) => path.startsWith('noi.eio.components.world.'))
/** Mero's types for each group, and the shorter names the code takes them under (… as Motion). */
const typesOf = group => {
  const types = ours.filter(([, gs]) => group in gs).map(([path]) => pascal(path.replace('noi.eio.components.world.', '')) + pascal(group))
  const aliases = types.flatMap(t => [...code.matchAll(new RegExp(`\\b${t}\\s+as\\s+(\\w+)`, 'g'))].map(m => m[1]))
  return [...types, ...aliases]
}

test('Mero holds states for the 3D elements', () => {
  // the character drawing and the three characters (17 Nov), and the new world's eight elements (23 Nov)
  assert.ok(ours.length >= 12, `found ${ours.length}`)
})

test('no table is forced into shape: a cast would let it leave keys out', () => {
  assert.doesNotMatch(code, /\bas\s+(?:Partial<\s*)?Record\s*</, 'a table cast with as')
  assert.doesNotMatch(code, /\bas\s+unknown\s+as\b/, 'a cast through unknown')
  assert.doesNotMatch(code, /Partial<\s*Record\s*</, 'a partial table may leave keys out')
})

for (const [path, groups] of ours) {
  const slug = path.replace('noi.eio.components.world.', '')
  const name = pascal(slug)
  for (const [group, keys] of Object.entries(groups)) {
    const type = name + pascal(group)
    if (group === 'clips') {
      test(`${path}: its model has the clips Mero lists`, () => {
        const have = clips(join(PKG, 'assets/characters', slug, `${slug}.glb`))
        for (const key of keys) assert.ok(have.includes(key), `${slug}.glb has no clip “${key}”: it has ${have.join(', ')}`)
      })
    } else if (group === 'interaction') {
      test(`${path}: a style rule for each thing that happens to it`, () => {
        // A rule counts when its selector names a class the package's components give.
        const mine = sel => [...given].some(c => new RegExp(`\\.${c}(?![\\w-])`).test(sel))
        for (const key of keys) {
          assert.ok(RULE[key], `no rule is known for “${key}”: add it to this test`)
          assert.ok(selectors.some(sel => RULE[key].test(sel) && mine(sel)), `nothing of its own draws “${key}”`)
        }
      })
    } else {
      test(`${path}: ${group} is read through a table of Mero’s ${type}`, () => {
        assert.match(code, new RegExp(`import type \\{[^}]*\\b${type}\\b[^}]*\\} from '@noi/eio-tokens/components'`), `${type} is not taken from Mero’s file`)
        // The code may take Mero's type under a shorter name of its own (… as Motion).
        const alias = code.match(new RegExp(`\\b${type}\\s+as\\s+(\\w+)`))?.[1]
        const named = `(?:${type}${alias ? `|${alias}` : ''})`
        // The table, and something that reads it: looks an option up in it (TABLE[key] or TABLE.key), or
        // goes through all of it in its order (Object.entries(TABLE)): in its own file, or anywhere in the
        // package if it is exported.
        const tables = Object.entries(sources).flatMap(([file, src]) =>
          [...src.matchAll(new RegExp(`(\\bexport\\s+)?\\b(?:const|let|var)\\s+(\\w+)\\s*:\\s*Record<${named},`, 'g'))]
            .map(([, exported, table]) => ({ file, table, exported: Boolean(exported) })))
        assert.ok(tables.length > 0, `no table Record<${type}, …> in the code`)
        for (const { file, table, exported } of tables) {
          assert.match(exported ? code : sources[file], new RegExp(`\\b${table}(?:\\[|\\.\\w)|\\bObject\\.(?:entries|keys|values)\\(${table}\\)`), `${file}: ${table} is never read`)
        }
      })
    }
  }
}
