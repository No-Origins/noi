'use client'
// The list of merons: search, then the tree. The tree opens the way to the meron on screen, and each
// arrow opens or closes its row; a row's name opens its page. With a search, it lists every meron or
// group whose name, path or color matches. Beside the page where two panes fit, in the menu otherwise.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Field, TreeRow } from '@noi/eio-react'
import type { TreeNode } from '../../lib/tree'
import { PreviewMark } from './PreviewMark'
import styles from './merons.module.css'

const hrefOf = (path: string) => `/merons/${path.split('.').join('/')}`
const prefixes = (path: string) => path.split('.').map((_, i, a) => a.slice(0, i + 1).join('.'))

export function Navigator({ nodes }: { nodes: TreeNode[] }) {
  const router = useRouter()
  const pathname = usePathname()
  // /merons itself shows the root beside the tree.
  const current = decodeURIComponent(pathname.replace(/^\/merons\/?/, '')).split('/').filter(Boolean).join('.')
    || (nodes.find(n => n.parent === null)?.path ?? '')
  const [query, setQuery] = useState('')
  const pane = useRef<HTMLDivElement>(null)

  // Rows open by their arrows; the way to the meron on screen is always opened.
  const [expanded, setExpanded] = useState(() => new Set(prefixes(current)))
  useEffect(() => setExpanded(was => new Set([...was, ...prefixes(current)])), [current])
  // The rows an arrow has just revealed drop in; closing is instant.
  const [revealed, setRevealed] = useState<string | null>(null)
  const toggle = (path: string) => {
    setRevealed(expanded.has(path) ? null : path)
    setExpanded(was => {
      const next = new Set(was)
      if (!next.delete(path)) next.add(path)
      return next
    })
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      const color = (n: TreeNode) => n.preview.kind === 'swatch' ? n.preview.color : n.preview.kind === 'role' ? `${n.preview.light} ${n.preview.dark}` : ''
      return nodes.filter(n => n.name.toLowerCase().includes(q) || n.path.includes(q) || color(n).toLowerCase().includes(q))
    }
    // Nodes come parents first: a row shows when its parent shows and is open.
    const shown = new Set<string>()
    return nodes.filter(n => {
      const show = n.parent === null || (shown.has(n.parent) && expanded.has(n.parent))
      if (show) shown.add(n.path)
      return show
    })
  }, [nodes, query, expanded])

  // "/" jumps to search, as the field's hint says.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]')
      if (e.key === '/' && !typing) { e.preventDefault(); pane.current?.querySelector('input')?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep the meron on screen in view in the tree.
  useEffect(() => { pane.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }) }, [current])

  // Rows are plain links; open them inside the app so the search and scroll stay put.
  const follow = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    router.push(a.getAttribute('href')!)
  }

  return (
    <div className={styles.navigator} ref={pane}>
      <Field label="Search merons" icon="search" placeholder="Search names, paths, colors" hint="/" value={query} onChange={e => setQuery(e.target.value)} onClear={() => setQuery('')} />
      <div role="tree" aria-label="Merons" className={styles.tree} onClick={follow}>
        {visible.map(n => (
          <TreeRow
            key={n.path}
            name={n.name}
            depth={query ? 0 : n.depth}
            open={n.count > 0 && !query ? expanded.has(n.path) : undefined}
            onToggle={() => toggle(n.path)}
            appear={revealed !== null && n.path.startsWith(`${revealed}.`)}
            preview={<PreviewMark preview={n.preview} />}
            count={n.count > 0 ? n.count : undefined}
            selected={n.path === current}
            href={hrefOf(n.path)}
          />
        ))}
        {query && visible.length === 0 && <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>Nothing matches “{query}”.</p>}
      </div>
    </div>
  )
}
