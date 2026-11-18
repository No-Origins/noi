// Hyperbase Studio (15 Nov): Hyperbase's pages in the one app, at hyperbase.<base>, as a MOCK.
// Every page is real and made from Eidos's parts, filled with made-up data from mock/, with
// nothing behind it: no agent runs, nothing is checked, nothing is stored or sent, and no call is
// made to Governance or Mero, so the pages open without a sign-in. Agreed 15 Nov ("The Build
// Order", decision 1): each mock page becomes the real page when its rung is reached.
import type { ReactNode } from 'react'
import { Panes } from '@noi/eio-react'
import { origins } from '../../lib/where'
import { TopBar } from '../TopBar'
import { MockMark } from './MockMark'
import { StudioNav } from './StudioNav'
import { runningNow, space, waiting } from './mock/read'
import { Visit } from './mock/visit'
import styles from './studio.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: { default: 'Hyperbase Studio', template: '%s · Hyperbase Studio' } }

export default async function StudioLayout({ children }: { children: ReactNode }) {
  const [at, items, live, s] = await Promise.all([origins(), waiting(), runningNow(), space()])
  const list = <StudioNav waiting={items} />
  return (
    <Visit at={at} live={live} things={s.things}>
      <TopBar view="hyperbase" list={list} />
      <MockMark />
      <Panes list={list}>
        <div className={styles.right}>{children}</div>
      </Panes>
    </Visit>
  )
}
