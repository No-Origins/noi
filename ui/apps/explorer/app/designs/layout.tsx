import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Designs · No Origins' }

// Page designs for the subdomains (7 Nov). Sample data only: nothing here reads Mero or Governance.
export default function DesignsLayout({ children }: { children: ReactNode }) {
  return children
}
