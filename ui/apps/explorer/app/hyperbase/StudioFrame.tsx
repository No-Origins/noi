'use client'
// Studio's frame: the top bar, the mark that this is a mock, and Studio's list beside the page. One page steps
// out of it (21 Nov): the 3D world, /world, which is the whole screen.
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Panes } from '@noi/eio-react'
import styles from './studio.module.css'

/** The pages shown on the whole screen, without Studio's frame. */
const WHOLE_SCREEN = ['/world', '/world/intro']

export function StudioFrame({ top, list, children }: { top: ReactNode; list: ReactNode; children: ReactNode }) {
  // On Hyperbase's own name the folder is not in the address; under another name it is.
  const path = (usePathname() ?? '/').replace(/^\/hyperbase(?=\/|$)/, '') || '/'
  if (WHOLE_SCREEN.includes(path)) return <>{children}</>
  return (
    <>
      {top}
      <Panes list={list}>
        <div className={styles.right}>{children}</div>
      </Panes>
    </>
  )
}
