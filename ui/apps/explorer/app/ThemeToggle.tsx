'use client'
// Switches the whole app between light and dark. Without a choice the app follows the system.
// The choice is a cookie, so the server sets it on the page before it paints: no flash, no script.
// It is kept for the base name, so gov, mero, eidos and hyperbase share it (8 Nov).
import { Button } from '@noi/eio-react'

export function ThemeToggle() {
  const toggle = () => {
    const html = document.documentElement
    const dark = html.dataset.theme ? html.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    html.dataset.theme = dark ? 'light' : 'dark'
    const base = location.hostname.replace(/^(gov|mero|eidos|hyperbase)\./, '')
    const domain = base !== location.hostname ? `; domain=${base}` : ''
    document.cookie = `theme=${html.dataset.theme}; path=/; max-age=31536000; samesite=lax${domain}`
  }
  return <Button icon="theme" onClick={toggle} aria-label="Switch between light and dark">Theme</Button>
}
