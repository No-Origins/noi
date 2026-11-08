import '@noi/eio-tokens/tokens.css'
import '@noi/eio-tokens/fonts.css'
import './global.css'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Explorer · No Origins',
  description: 'Browse Mero, the No Origins registry, and review what is proposed for it.',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The theme you chose, if any; otherwise the page follows the system.
  const theme = (await cookies()).get('theme')?.value
  return (
    <html lang="en" data-theme={theme === 'light' || theme === 'dark' ? theme : undefined}>
      <body className="eio-type-style-body">{children}</body>
    </html>
  )
}
