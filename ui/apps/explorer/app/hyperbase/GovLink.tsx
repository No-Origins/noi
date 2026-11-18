'use client'
// Studio is not where limits are written (agreed 12 Nov): sets, guidelines, dials and caps are on
// Governance's pages, and definitions are in Mero. Studio links to both. An owner sees the links
// into Governance. Governance's page for the limits is not built yet, so the link opens its home.
import type { ReactNode } from 'react'
import { May } from './May'
import { useVisit } from './mock/visit'
import { Button } from '@noi/eio-react'

export function GovLink({ children = 'Open in Governance' }: { children?: ReactNode }) {
  const { at } = useVisit()
  return (
    <May verb="limits">
      <Button href={`${at?.gov ?? ''}/`} title="Governance’s page for the limits is not built yet. This opens Governance’s home.">{children}</Button>
    </May>
  )
}
/** A change to a definition is registered in Mero's Review, and shown there in full. A new skill,
    or a change to an agent's job, can be approved in Studio as well (agreed 16 Nov): it is one
    change, one record, one touch. "Look" opens it in Review. */
export function ReviewLink({ children = 'Look, in Mero’s Review' }: { children?: ReactNode }) {
  const { at } = useVisit()
  return <Button href={`${at?.mero ?? ''}/review`} title="Hyperbase’s definitions are not in Mero yet. This opens Review.">{children}</Button>
}
/** A definition (a team, a saved agent, a skill, a tool) is a meron: it is in Mero. */
export function MeroLink({ children = 'Open in Mero' }: { children?: ReactNode }) {
  const { at } = useVisit()
  return <Button href={`${at?.mero ?? ''}/merons`} title="Hyperbase’s definitions are not in Mero yet. This opens the Merons page.">{children}</Button>
}
