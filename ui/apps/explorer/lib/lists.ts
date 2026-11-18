// What changed in a list in a meron's spec, for Review (18 Nov 2026: the user saw a Button's states
// shown whole, before and after, with the three new ones at the end). A list is told by what was
// added, what was taken away and what changed, not shown twice in full. Items are words (states,
// paths) or things with a path (files, whose fingerprint may change).

export interface ListChange {
  /** Items only the new list has, by their key: the words, or a file's path. */
  added: string[]
  /** Items only the old list had. */
  removed: string[]
  /** Items both have, that changed inside, such as a file whose fingerprint changed. */
  changed: string[]
  /** How many items stay as they were. */
  kept: number
  /** The same items, in another order. */
  reordered: boolean
}

/** An item's key: words stand for themselves; a thing with a path is known by its path. */
export const keyOf = (v: unknown): string =>
  typeof v === 'string' ? v : v !== null && typeof v === 'object' && 'path' in v ? String((v as { path: unknown }).path) : JSON.stringify(v)

/** Whether a changed item can be told in a line: the same fields, and only a file's fingerprint or a
 * state's words differ. Anything else is shown whole, before and after. */
function tellable(a: unknown, z: unknown): boolean {
  if (a === null || z === null || typeof a !== 'object' || typeof z !== 'object') return false
  const ka = Object.keys(a).sort(), kz = Object.keys(z).sort()
  if (ka.join() !== kz.join()) return false
  const differ = ka.filter(k => JSON.stringify((a as Record<string, unknown>)[k]) !== JSON.stringify((z as Record<string, unknown>)[k]))
  return differ.every(k => k === 'sha256' || k === 'words')
}

/** What changed between two lists. Null, so Review shows both sides whole, when either side is not a
 * list, when two items of one list share a key (a change between them could hide), or when a changed
 * item is neither a file's fingerprint nor a state's words. */
export function listChange(before: unknown, after: unknown): ListChange | null {
  if (!Array.isArray(before) || !Array.isArray(after)) return null
  const a = new Map(before.map(v => [keyOf(v), JSON.stringify(v)]))
  const z = new Map(after.map(v => [keyOf(v), JSON.stringify(v)]))
  if (a.size !== before.length || z.size !== after.length) return null
  const added = [...z.keys()].filter(k => !a.has(k))
  const removed = [...a.keys()].filter(k => !z.has(k))
  const changed = [...z.keys()].filter(k => a.has(k) && a.get(k) !== z.get(k))
  const item = (list: unknown[], k: string) => list.find(v => keyOf(v) === k)
  if (!changed.every(k => tellable(item(before, k), item(after, k)))) return null
  const kept = z.size - added.length - changed.length
  const same = (xs: unknown[]) => xs.map(v => JSON.stringify(v)).join('\n')
  const reordered = !added.length && !removed.length && !changed.length && same(before) !== same(after)
  return { added, removed, changed, kept, reordered }
}

const isWords = (v: unknown): v is Record<string, string> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(w => typeof w === 'string')

/** A component's states by key (agreed 18 Nov) read as a list: one item for each key, known as its group
 * and key, with its words. Only a component's `states`, and only groups of words; every other value is
 * left as it is. */
export function asList(kind: string | undefined, field: string, v: unknown): unknown {
  if (kind !== 'component' || field !== 'states' || v === null || typeof v !== 'object' || Array.isArray(v)) return v
  const groups = Object.values(v)
  if (!groups.every(isWords)) return v
  return Object.entries(v as Record<string, Record<string, string>>).flatMap(([group, keys]) =>
    Object.entries(keys).map(([key, words]) => ({ path: `${group} · ${key}`, words })))
}

/** Whether a list changed at all. */
export const listChanged = (c: ListChange) => c.added.length + c.removed.length + c.changed.length > 0 || c.reordered

/** The change in a few words: "3 added · 9 as they were". */
export function listSummary(c: ListChange): string {
  const parts = [
    c.added.length && `${c.added.length} added`,
    c.removed.length && `${c.removed.length} taken away`,
    c.changed.length && `${c.changed.length} changed`,
    c.reordered && 'the same, in a new order',
    c.kept && !c.reordered && `${c.kept} as ${c.kept === 1 ? 'it was' : 'they were'}`,
  ]
  return parts.filter(Boolean).join(' · ')
}
