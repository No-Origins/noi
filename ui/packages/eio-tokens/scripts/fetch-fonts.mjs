// Downloads the Eidos fonts from Google Fonts for offline use and writes fonts.css beside tokens.css.
// Keeps only the scripts each font meron lists in Mero; every file is checked to be woff2 before it is kept.
// Run from this package: node scripts/fetch-fonts.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = fileURLToPath(new URL('..', import.meta.url))
// A browser user agent, so Google Fonts answers with woff2 files.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const FONTS = [
  { query: 'Geist:ital,wght@0,100..900;1,100..900', family: 'Geist', slug: 'geist', scripts: ['latin', 'cyrillic', 'vietnamese'], ofl: 'geist' },
  { query: 'Geist+Mono:ital,wght@0,100..900;1,100..900', family: 'Geist Mono', slug: 'geist-mono', scripts: ['latin', 'cyrillic', 'vietnamese'], ofl: 'geistmono' },
  { query: 'Tenor+Sans', family: 'Tenor Sans', slug: 'tenor-sans', scripts: ['latin', 'cyrillic'], ofl: 'tenorsans' },
  { query: 'Yatra+One', family: 'Yatra One', slug: 'yatra-one', scripts: ['latin', 'devanagari'], ofl: 'yatraone' },
]
// A subset belongs to a listed script when it is that script or its -ext companion.
const wanted = (subset, scripts) => scripts.some(s => subset === s || subset === `${s}-ext`)

const rules = []
let total = 0
for (const f of FONTS) {
  const sheet = await fetch(`https://fonts.googleapis.com/css2?family=${f.query}&display=swap`, { headers: { 'user-agent': UA } })
  if (!sheet.ok) throw new Error(`${f.family} stylesheet: ${sheet.status}`)
  const css = await sheet.text()
  for (const m of css.matchAll(/\/\* ([a-z0-9-]+) \*\/\s*@font-face \{([^}]+)\}/g)) {
    const [, subset, body] = m
    if (!wanted(subset, f.scripts)) continue
    const style = body.match(/font-style: (\w+)/)[1]
    const weight = body.match(/font-weight: ([\d ]+);/)[1]
    const url = body.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/)[1]
    const range = body.match(/unicode-range: ([^;]+);/)[1]
    const file = `${f.slug}${style === 'italic' ? '-italic' : ''}-${subset}.woff2`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`${url} is not woff2`)
    writeFileSync(join(PKG, 'fonts', file), bytes)
    total += bytes.length
    rules.push(`/* ${f.family} · ${subset}${style === 'italic' ? ' · italic' : ''} */\n@font-face {\n  font-family: '${f.family}';\n  font-style: ${style};\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('./fonts/${file}') format('woff2');\n  unicode-range: ${range};\n}`)
  }
  const license = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${f.ofl}/OFL.txt`)
  if (!license.ok) throw new Error(`${f.family} license: ${license.status}`)
  const text = await license.text()
  if (!/SIL OPEN FONT LICENSE/i.test(text)) throw new Error(`${f.family} license text is not the OFL`)
  writeFileSync(join(PKG, 'fonts', `LICENSE-${f.slug}.txt`), text)
}
writeFileSync(join(PKG, 'fonts.css'), `/* Eidos fonts, bundled for offline use. From Google Fonts, under the SIL Open Font License 1.1 (fonts/LICENSE-*.txt).\n   Written by fetch-fonts; the scripts kept are the ones each font meron lists in Mero. */\n\n${rules.join('\n\n')}\n`)
console.log(`${rules.length} font files, ${(total / 1024).toFixed(0)} KB in total`)
