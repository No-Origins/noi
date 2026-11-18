'use client'
// A link to the sign-in page that brings you back to this very page: its address as the browser
// shows it, which on gov's and eidos's names differs from the app's own path.
import { useEffect, useState, type ReactNode } from 'react'

export function SignInHere({ signIn, children }: { signIn: string; children: ReactNode }) {
  const [href, setHref] = useState(signIn)
  useEffect(() => setHref(`${signIn}?back=${encodeURIComponent(window.location.href)}`), [signIn])
  return <a href={href}>{children}</a>
}
