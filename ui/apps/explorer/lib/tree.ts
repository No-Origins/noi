// The tree of merons by path. Every path prefix is a node, so groups such as noi.eio.color
// appear even though they are not merons themselves. Built on the server, sent to the navigator.
import { hex, resolve } from './color'
import type { Index, Meron, Snapshot } from './mero'

export type Preview =
  | { kind: 'swatch'; color: string }
  | { kind: 'role'; light: string; dark: string }
  | { kind: 'text'; font: string; weight: number }
  | { kind: 'icon'; name: 'layers' | 'doc' | 'drop' | 'comp' | 'agent' | 'fit' | 'arrow' }

export interface TreeNode {
  path: string
  name: string
  parent: string | null
  depth: number
  meron: boolean
  /** Merons inside this node. */
  count: number
  preview: Preview
  state?: Meron['lifecycle']['state']
}

// Names for path segments that are groups, not merons.
const GROUPS: Record<string, string> = {
  color: 'Color', palette: 'Palette', text: 'Text', surface: 'Surface', action: 'Action', border: 'Border', focus: 'Focus',
  state: 'State', type: 'Typography', font: 'Fonts', style: 'Text styles', space: 'Spacing', scale: 'Scale', gap: 'Gaps',
  inset: 'Insets', margin: 'Margins', size: 'Sizes', control: 'Controls', icon: 'Icons', target: 'Targets', width: 'Widths',
  layout: 'Layout', window: 'Windows', radius: 'Corners', inv: 'Invariants', motion: 'Motion', duration: 'Durations', easing: 'Curves',
  world: '3D world', ripples: 'Lime ripples',
}
const groupName = (path: string) => {
  const seg = path.split('.').pop()!
  if (path.endsWith('.type.size')) return 'Font sizes'
  return GROUPS[seg] ?? seg[0].toUpperCase() + seg.slice(1)
}

export function preview(idx: Index, m: Meron | undefined): Preview {
  if (!m) return { kind: 'icon', name: 'layers' }
  const sub = m.classification.subtype
  if (sub === 'color') return { kind: 'swatch', color: hex(resolve(idx, m.identity.path)!.light) }
  if (sub === 'color-role') {
    const r = resolve(idx, m.identity.path)
    return r ? { kind: 'role', light: hex(r.light), dark: hex(r.dark) } : { kind: 'icon', name: 'drop' }
  }
  if (sub === 'font-family') return { kind: 'text', font: m.spec.family, weight: 400 }
  if (sub === 'text-style') return { kind: 'text', font: idx.byPath.get(m.spec.font)?.spec.family ?? 'inherit', weight: m.spec.weight }
  if (m.classification.type === 'system') return { kind: 'icon', name: 'layers' }
  if (m.classification.type === 'invariant') return { kind: 'icon', name: 'doc' }
  if (m.classification.type === 'component') return { kind: 'icon', name: 'comp' }
  if (m.classification.type === 'agent') return { kind: 'icon', name: 'agent' }
  if (sub === 'length') return { kind: 'icon', name: 'fit' }
  if (sub === 'time' || sub === 'speed') return { kind: 'icon', name: 'arrow' }
  return { kind: 'icon', name: sub === 'window' ? 'fit' : 'drop' }
}

export function tree(s: Snapshot, idx: Index): TreeNode[] {
  const paths = new Set<string>()
  for (const m of s.merons) {
    const parts = m.identity.path.split('.')
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('.'))
  }
  const nodes = [...paths].map(path => {
    const m = idx.byPath.get(path)
    const parts = path.split('.')
    return {
      path,
      name: m?.identity.name ?? groupName(path),
      parent: parts.length > 1 ? parts.slice(0, -1).join('.') : null,
      depth: parts.length - 1,
      meron: Boolean(m),
      count: s.merons.filter(x => x.identity.path.startsWith(path + '.')).length,
      preview: preview(idx, m),
      state: m?.lifecycle.state,
    }
  })
  // Depth first, siblings by name: the order the tree shows them in.
  const children = (p: string | null) => nodes.filter(n => n.parent === p).sort((a, b) => a.name.localeCompare(b.name))
  const out: TreeNode[] = []
  const walk = (p: string | null) => children(p).forEach(n => { out.push(n); walk(n.path) })
  walk(null)
  return out
}
