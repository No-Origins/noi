'use client'
// Studio's own short list (agreed 12 Nov), as Governance has: Today, Projects, Standing orders,
// Teams, Runs, Score, and Space (added 12 Nov by "Spaces As You Picture Them"). Each is a link on
// Hyperbase's own name; Today carries the count of what waits.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Count, Icon, type IconName } from '@noi/eio-react'
import type { Waiting } from './mock/types'
import { useWaiting } from './mock/visit'
import styles from './studio.module.css'

const PAGES: { href: string; name: string; icon: IconName }[] = [
  { href: '/', name: 'Today', icon: 'check' },
  { href: '/projects', name: 'Projects', icon: 'layers' },
  { href: '/orders', name: 'Standing orders', icon: 'arrow' },
  { href: '/teams', name: 'Teams', icon: 'agent' },
  { href: '/runs', name: 'Runs', icon: 'doc' },
  { href: '/score', name: 'Score', icon: 'fit' },
  { href: '/space', name: 'Space', icon: 'comp' },
]

export function StudioNav({ waiting }: { waiting: Waiting[] }) {
  // On Hyperbase's own name the folder is not in the address; under another name it is.
  const path = (usePathname() ?? '/').replace(/^\/hyperbase(?=\/|$)/, '') || '/'
  const count = useWaiting(waiting).mine.length
  return (
    <nav className={styles.left} aria-label="Hyperbase Studio">
      {PAGES.map(p => {
        const selected = p.href === '/' ? path === '/' : path === p.href || path.startsWith(p.href + '/')
        return (
          <Link key={p.href} href={p.href} className={[styles.navRow, selected && styles.navSelected, 'eio-type-style-body'].filter(Boolean).join(' ')} aria-current={selected ? 'page' : undefined}>
            <span className={styles.navIcon}><Icon name={p.icon} size="small" /></span>
            <span className={styles.navName}>{p.name}</span>
            {p.href === '/' && count > 0 && <Count value={count} label="waiting for you" />}
          </Link>
        )
      })}
    </nav>
  )
}
