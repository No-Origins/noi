// Eidos color math, the same as noi-eio: OKLCH clipped to sRGB, mixes in OKLCH that keep the
// chromatic color's hue, and WCAG contrast. So the numbers here match the ones Mero checked.
import type { Index } from './mero'

export interface Oklch { l: number; c: number; h: number }

function linear({ l: L, c: C, h }: Oklch): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(v => Math.min(1, Math.max(0, v))) as [number, number, number]
}

export function hex(c: Oklch) {
  return '#' + linear(c).map(v => {
    const e = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, e)) * 255).toString(16).padStart(2, '0')
  }).join('').toUpperCase()
}

const luminance = (c: Oklch) => { const [r, g, b] = linear(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b }

export function contrast(a: Oklch, b: Oklch) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

export function mix(color: Oklch, percent: number, over: Oklch): Oklch {
  const p = percent / 100
  const h = over.c <= 0 ? color.h : color.c <= 0 ? over.h : (over.h + p * ((((color.h - over.h + 540) % 360) + 360) % 360 - 180) + 360) % 360
  return { l: over.l + p * (color.l - over.l), c: over.c + p * (color.c - over.c), h }
}

export type Theme = 'light' | 'dark'
export interface Resolved { light: Oklch; dark: Oklch }

/** Palette color or role, by path, as OKLCH in both themes. Undefined when it is neither. */
export function resolve(idx: Index, path: string): Resolved | undefined {
  const m = idx.byPath.get(path)
  if (!m) return undefined
  if (m.classification.subtype === 'color') {
    const [l, c, h] = m.spec.value.components
    return { light: { l, c, h }, dark: { l, c, h } }
  }
  if (m.classification.subtype === 'color-role') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (v: any): Oklch | undefined => {
      if (v.ref) return resolve(idx, v.ref)?.light
      const color = resolve(idx, v.mix.color)?.light, over = resolve(idx, v.mix.over)?.light
      return color && over ? mix(color, v.mix.percent, over) : undefined
    }
    const light = value(m.spec.light), dark = value(m.spec.dark)
    return light && dark ? { light, dark } : undefined
  }
  return undefined
}

/** What a role value reads, in words: "Lime" or "Lime 14% over White". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reads(idx: Index, v: any) {
  const name = (p: string) => idx.byPath.get(p)?.identity.name ?? p
  return v.ref ? name(v.ref) : `${name(v.mix.color)} ${v.mix.percent}% over ${name(v.mix.over)}`
}
