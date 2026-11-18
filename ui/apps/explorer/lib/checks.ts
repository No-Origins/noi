// What an invariant's checks ask of one meron, in words, worked out the same way noi-eio does.
// Mero already ran these checks before the meron became active; the Explorer only explains them.
import { contrast, resolve, type Theme } from './color'
import type { Index, Meron } from './mero'

/** One line of a check. `ok` is null when the rule does not apply. */
export interface Check { ok: boolean | null; text: string }

const n = (x: number) => String(+x.toFixed(2))
const title = (s: string) => s[0].toUpperCase() + s.slice(1)

export interface ContrastResult { theme: Theme; against: Meron; ratio: number; minimum: number; ok: boolean }

/** A color role against every surface it declares, in both themes. */
export function roleContrast(idx: Index, m: Meron, minimums: { text: number; ui: number }): ContrastResult[] {
  const self = resolve(idx, m.identity.path)
  const out: ContrastResult[] = []
  for (const theme of ['light', 'dark'] as const)
    for (const { against, kind } of m.spec.contrast ?? []) {
      const other = resolve(idx, against), surface = idx.byPath.get(against)
      if (!self || !other || !surface) continue
      const ratio = contrast(self[theme], other[theme]), minimum = minimums[kind as 'text' | 'ui']
      out.push({ theme, against: surface, ratio, minimum, ok: ratio >= minimum })
    }
  return out
}

export interface TypeMinimums { size: number; readingSize: number; readingLineHeight: number; devanagariLineHeight: number }

/** The text-style check, rule by rule. */
export function styleChecks(idx: Index, m: Meron, min: TypeMinimums): Check[] {
  const st = m.spec
  const font = idx.byPath.get(st.font)?.spec
  const fallback = st.fallback ? idx.byPath.get(st.fallback)?.spec : undefined
  const px: number | undefined = idx.byPath.get(st.size)?.spec.px
  const out: Check[] = []
  if (font) {
    const has = font.weights.includes(st.weight)
    out.push({ ok: has, text: has ? `${font.family} has a ${st.weight} weight.` : `${font.family} has no ${st.weight} weight.` })
  }
  if (fallback && font) {
    const added = fallback.scripts.filter((x: string) => !font.scripts.includes(x))
    out.push({
      ok: added.length > 0,
      text: added.length ? `${fallback.family} adds ${added.map(title).join(', ')}, which ${font.family} cannot draw.` : `${fallback.family} adds no script ${font.family} lacks.`,
    })
  }
  if (px === undefined) return out
  out.push({ ok: px >= min.size, text: px >= min.size ? `${px} px is at least the ${min.size} px minimum.` : `${px} px is below the ${min.size} px minimum.` })
  for (const f of [font, fallback]) if (f?.minSize) out.push({ ok: px >= f.minSize, text: `${f.family} is set at ${f.minSize} px and up; this style is ${px} px.` })
  out.push({ ok: st.lineHeight % 4 === 0, text: `The ${st.lineHeight} px line height is ${st.lineHeight % 4 === 0 ? 'on' : 'off'} the 4 px grid.` })
  const devanagari = [font, fallback].find(f => f?.scripts.includes('devanagari'))
  if (devanagari) {
    const need = min.devanagariLineHeight * px
    out.push({ ok: st.lineHeight >= need, text: `${devanagari.family} draws Devanagari, so the line must be at least ${n(min.devanagariLineHeight)} × ${px} = ${n(need)} px; it is ${st.lineHeight}.` })
  }
  if (st.reading) {
    const need = min.readingLineHeight * px
    out.push({ ok: px >= min.readingSize, text: `Reading text is at least ${min.readingSize} px; this is ${px}.` })
    out.push({ ok: st.lineHeight >= need, text: `Reading text needs a line of ${n(min.readingLineHeight)} × ${px} = ${n(need)} px; it is ${st.lineHeight}.` })
  } else {
    out.push({ ok: null, text: `Not reading text, so the ${min.readingSize} px and ${n(min.readingLineHeight)} × reading minimums do not apply.` })
  }
  return out
}

/** An invariant's checks as sentences people can read. Unknown checks show their name. */
export function describeCheck(c: { name: string; params?: Record<string, unknown> }): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = c.params as any
  switch (c.name) {
    case 'eio.color-role':
      return [
        'Both themes point at palette colors, or mix two of them.',
        `Text reads at least ${p.minimums.text}:1 against every surface the role declares.`,
        `Borders and focus rings read at least ${p.minimums.ui}:1.`,
      ]
    case 'eio.text-style':
      return [
        `Every style is at least ${p.minimums.size} px, and its weight is one its font has.`,
        `Reading text is at least ${p.minimums.readingSize} px, with a ${n(p.minimums.readingLineHeight)} × line.`,
        `A style that can show Devanagari needs a line of at least ${n(p.minimums.devanagariLineHeight)} × its size.`,
        'A fallback font must add a script the first font lacks.',
      ]
    case 'eio.reference':
      return [`\`${p.field}\` points at an active ${p.subtype} token.`]
    case 'eio.component':
      return [
        'Every Eidos value it reads is in Mero; Mero links the component to each, so a value in use can’t be retired.',
        `Every component it uses is in Mero, under ${p.under}, and none of them uses it back: uses go one way.`,
        'No file is listed by another component’s meron: every file of a package belongs to exactly one.',
        'A component names its states; the package’s own files have none.',
        'No group of its states gives a type name another component’s already gives, so Mero can always write the types the code uses.',
        // The rule's versions from 18 Nov ask it; earlier ones did not.
        ...(p.folders === true ? [`Each file of a component or a shared part sits in a folder named for it, as the code names it: src/Button/ for ${p.under}.button.`] : []),
      ]
    case 'gov.role':
      return [
        'One Cedar permit, with blanks for who (?principal) and where (?resource).',
        'It names only actions its system declares, and type-checks against Governance’s schema.',
      ]
    case 'gov.rule':
      return [
        'One Cedar policy with no blanks.',
        'It names only declared actions, entities and context, and type-checks against Governance’s schema.',
      ]
    default:
      return [`${c.name}${p ? ` ${JSON.stringify(p)}` : ''}`]
  }
}
