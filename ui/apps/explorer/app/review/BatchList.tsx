'use client'
// Review's left pane, on Eidos's Sidebar: whether this Explorer can decide, then every batch by where
// it stands. Changes to roles and rules, which Governance keeps and decides (step 3), sit among them,
// marked with a key.
import type { MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Icon, Sidebar, TreeRow } from '@noi/eio-react'
import styles from './review.module.css'

export interface BatchItem {
  uid: string; title: string; proposer: string; waiting: number; sentBack: number; open: number
  /** Where it opens: /review/<batch> for Mero's, /review/gov/<id> for Governance's. */
  href: string
  /** A change to roles and rules, decided by Governance. */
  governance?: boolean
}

/** `next` is the batch /review shows beside the list, so it is the one marked there. */
/** `problem` says that Governance's changes could not be shown, so none may seem to wait that do. */
export function BatchList({ batches, next, writable, reviewer, problem }: { batches: BatchItem[]; next?: string; writable: boolean; reviewer: string | null; problem?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  // Rows are plain links; open them inside the app.
  const follow = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    router.push(a.getAttribute('href')!)
  }
  const groups: [string, BatchItem[]][] = [
    ['Waiting for you', batches.filter(b => b.waiting > 0)],
    ['Sent back', batches.filter(b => b.waiting === 0 && b.sentBack > 0)],
    ['Decided', batches.filter(b => b.open === 0)],
  ]
  return (
    <Sidebar
      label="Review"
      onClick={follow}
      top={
        <>
        {problem && (
          <p className={[styles.status, 'eio-type-style-caption'].join(' ')} role="alert">
            <Icon name="warn" size="small" />
            {problem}
          </p>
        )}
        <p className={[styles.status, 'eio-type-style-caption'].join(' ')}>
          <Icon name={writable ? 'user' : 'eye'} size="small" />
          {writable
            ? `Signed in as ${reviewer}. Approving, sending back and rejecting ask for your touch, in Safari. A key marks a change to roles and rules, which Governance decides.`
            : reviewer
              ? `Signed in as ${reviewer}. You may read Review; deciding needs a role that may approve.`
              : 'Signed out: you see only what visitors may read.'}
        </p>
        </>
      }
      groups={groups.filter(([, list]) => list.length).map(([name, list]) => ({
        name,
        rows: list.map(b => (
          <TreeRow
            key={b.uid}
            name={b.title}
            preview={<Icon name={b.governance ? 'key' : b.proposer === reviewer ? 'user' : 'agent'} />}
            count={b.open || undefined}
            selected={pathname === b.href || (pathname === '/review' && b.uid === next)}
            href={b.href}
          />
        )),
      }))}
      empty={batches.length === 0 ? 'Nothing has been proposed yet.' : undefined}
    />
  )
}
