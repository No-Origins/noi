'use client'
// The count on the Hyperbase tab (agreed 12 Nov): how many things wait for you, on every page of
// the app. On Studio's own pages it follows the visit: answer a question and it drops by one.
import { Count } from '@noi/eio-react'
import type { Waiting } from './mock/types'
import { useWaiting } from './mock/visit'

export function TabCount({ items }: { items: Waiting[] }) {
  const n = useWaiting(items).mine.length
  return n ? <Count value={n} label="waiting for you" /> : null
}
