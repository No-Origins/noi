import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { isLocal } from '../../lib/hosts'

export const metadata: Metadata = { title: 'Designs · No Origins' }

// Page designs for the subdomains (7 Nov). Sample data only: nothing here reads Mero or Governance.
// On this Mac only: hosted, a mock sign-in form on the real name would mislead (architecture
// review, 9 Nov).
export default function DesignsLayout({ children }: { children: ReactNode }) {
  if (!isLocal()) notFound()
  return children
}
