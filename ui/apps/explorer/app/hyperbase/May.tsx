'use client'
// A button you may not press is not drawn (agreed 12 Nov). In the mock, who may press what comes
// from mock/may.ts and the role chosen under "Looking as"; later it is Governance's answer.
import type { ReactNode } from 'react'
import { may } from './mock/may'
import type { Verb } from './mock/types'
import { useVisit } from './mock/visit'

export function May({ verb, team, children, otherwise }: { verb: Verb; team?: string; children: ReactNode; otherwise?: ReactNode }) {
  const { role } = useVisit()
  return <>{may(role, verb, team) ? children : otherwise}</>
}
export function useMay() {
  const { role } = useVisit()
  return (verb: Verb, team?: string) => may(role, verb, team)
}
