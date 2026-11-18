'use client'
// The plain mark on every page of Studio (15 Nov): this is a mock. Beside it, "Looking as": the
// four roles for people, and the space's person (a fifth choice, agreed 16 Nov), so each one's
// page can be seen. Chosen for this visit only.
import { Select } from '@noi/eio-react'
import { ROLES } from './mock/may'
import type { Role } from './mock/types'
import { useVisit } from './mock/visit'
import styles from './studio.module.css'

export function MockMark() {
  const { role, setRole } = useVisit()
  const now = ROLES.find(r => r.role === role)
  return (
    <aside className={styles.mock} aria-label="About this mock">
      <div className={styles.mockInner}>
        <div className={styles.mockWords}>
          <p className="eio-type-style-body"><strong>Mock:</strong> made-up data. Nothing is behind these pages.</p>
          <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>{now?.sees} Nothing you press is kept: load a page again and the story starts over.</p>
          <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>Seeing goes by place: a role given at one project sees that project. In the mock each of the four roles is given every project of No Origins’ own, and nothing in a space.</p>
        </div>
        <div className={styles.lookingAs}>
          <span className="eio-type-style-label" aria-hidden>Looking as</span>
          <Select label="Looking as" value={role} onChange={e => setRole(e.target.value as Role)}>
            {ROLES.map(r => <option key={r.role} value={r.role}>{r.name}</option>)}
          </Select>
        </div>
      </div>
    </aside>
  )
}
