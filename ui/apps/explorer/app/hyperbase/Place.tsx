'use client'
// Seeing goes by place (agreed 16 Nov). What is in a space is seen by its person, and by nobody
// else as a matter of course; and the space's person, a fifth position, reaches that space only.
// So a page that is No Origins' own says so to the space's person, and a page in a space says so
// to everyone else. Later this is Governance's answer for each page.
import { Button } from '@noi/eio-react'
import type { ReactNode } from 'react'
import { sees } from './mock/may'
import { PERSON } from './mock/story'
import { useVisit } from './mock/visit'
import { Head, cx } from './parts'
import styles from './studio.module.css'

/** Whether whoever is looking sees something at this place: a space's, or No Origins' own. */
export function useSees() {
  const { role } = useVisit()
  return (space?: string) => sees(role, space)
}

/** The page shown in place of one that is not at your place. */
export function NotYourPlace({ title, space }: { title: string; space?: string }) {
  return (
    <>
      <Head
        title={title}
        sub={space
          ? `This is in ${PERSON}’s space. A space is seen by its person, and by those they let in.`
          : 'This is No Origins’ own. The space’s person reaches their own space only.'}
      />
      <p className="eio-type-style-body">
        {space
          ? 'Choose “The space’s person” under “Looking as” to see it as its person does.'
          : 'Your space, and the work in it, are on Space, Today, Projects and Runs.'}
      </p>
      <p><Button href={space ? '/' : '/space'}>{space ? 'Today' : 'Your space'}</Button></p>
    </>
  )
}

/** A page that is wholly No Origins' own: its teams, its score, its standing orders. */
export function NoOriginsOwn({ title, children }: { title: string; children: ReactNode }) {
  const sees = useSees()
  return sees() ? <>{children}</> : <NotYourPlace title={title} />
}
