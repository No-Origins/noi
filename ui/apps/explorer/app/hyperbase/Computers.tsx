'use client'
// A project's computers (agreed 12 Nov): a box for each, who is in it, who holds the pen, and
// whether it is marked. Agents are drawn as ovals: their loops run in Hyperbase, outside the box.
import { useState } from 'react'
import { Button, Chip, Icon } from '@noi/eio-react'
import { LookInside } from './LookInside'
import type { Computer, Inside } from './mock/types'
import { Marked, cx } from './parts'
import styles from './studio.module.css'

const DOES = { 'holds the pen': 'pen', looks: 'eye', 'reads the web': 'search' } as const

/** `parked`: its run is parked, so the computer is saved and stopped. Looking inside shows its
    files and the change so far, from the saved copy; nothing is started (agreed 16 Nov). */
export function ComputerBox({ c, inside, link, opened = false, parked = false }: { c: Computer; inside?: Inside; link?: boolean; opened?: boolean; parked?: boolean }) {
  const [open, setOpen] = useState(opened)
  return (
    <div className={cx(styles.computer, c.marked && styles.computerMarked)}>
      <div className={styles.computerHead}>
        <span className="eio-type-style-label">{c.name} computer</span>
        <Marked marked={c.marked} />
      </div>
      <div className={styles.agents}>
        {c.inside.map((a, i) => (
          <span key={i} className={cx(styles.agent, a.does === 'holds the pen' && styles.agentPen, 'eio-type-style-body')}>
            <Icon name={DOES[a.does]} size="small" />
            {a.who} {a.does}
          </span>
        ))}
      </div>
      {c.marked && <p className={cx(styles.muted, 'eio-type-style-caption')}>A run that read the web worked here. What it asks for goes to a person, never to a team.</p>}
      {parked && <p className={cx(styles.muted, 'eio-type-style-caption')}>Saved and stopped while its run is parked. It costs nothing.</p>}
      <div className={styles.buttons}>
        {inside && <Button icon="eye" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Look inside'}</Button>}
        {link && c.run && <Chip href={`/runs/${c.run}`}>Run {c.run}</Chip>}
      </div>
      {open && inside && <LookInside inside={inside} parked={parked} />}
    </div>
  )
}
