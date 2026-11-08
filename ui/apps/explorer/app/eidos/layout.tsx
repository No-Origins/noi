import type { ReactNode } from 'react'
import { waitingCount } from '../../lib/mero'
import { TopBar } from '../TopBar'

export const metadata = { title: 'Components · Explorer' }

export const dynamic = 'force-dynamic'

export default async function EidosLayout({ children }: { children: ReactNode }) {
  const waiting = await waitingCount()
  return (
    <>
      <TopBar view="eidos" waiting={waiting} />
      {children}
    </>
  )
}
