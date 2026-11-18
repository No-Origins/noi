'use client'
import Link from 'next/link'
import { Badge } from '@noi/eio-react'
import { useMay } from '../May'
import { sees } from '../mock/may'
import { rowNow, rowOfRun } from '../mock/now'
import type { RunRow } from '../mock/types'
import { useVisit } from '../mock/visit'
import { Head, Marked, RunBadge, Section, cents, cx, whyParked } from '../parts'
import styles from '../studio.module.css'

export function RunList({ rows }: { rows: RunRow[] }) {
  const { did, role } = useVisit()
  const can = useMay()
  // Seeing goes by place: the runs in a space are its person's, and nobody else's.
  const all = [...did.madeRuns.map(r => rowOfRun(r)), ...rows].map(r => rowNow(r, did)).filter(r => sees(role, r.space))
  return (
    <>
      <Head title="Runs" rung={1} sub="A run is one go at a task by one agent. Hyperbase writes down every step." />
      <Section title="Every run" count={all.length} note="The newest first. A run is running, parked, or ended: done, could not, stopped, or at a limit. A parked run says why: it waits for an answer, it was paused, or it waits its turn. A helper’s steps are inside the run that made it; a standing order’s go is a run of its own.">
        {all.length === 0 && <p className="eio-type-style-body">No runs yet.</p>}
        <div className={styles.list}>
          {all.map(r => (
            <Link key={r.number} href={`/runs/${r.number}`} className={styles.linkRow}>
              <div className={styles.rowText}>
                <span className={cx(styles.rowLabel, 'eio-type-style-label')}>
                  <span>Run {r.number}</span>
                  <span>· {r.started}</span>
                </span>
                <span className="eio-type-style-body">
                  {r.task ? `${r.projectTitle} · task ${r.task.n}: ${r.task.name}` : `${r.order} · a standing order`} · {r.agent}
                </span>
                <span className={cx(styles.muted, 'eio-type-style-caption')}>
                  {[`started by ${r.startedBy}`, r.state === 'parked' ? `parked · ${whyParked(r.stateNote, can('steer'))}` : r.stateNote].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className={styles.rowFacts}>
                <RunBadge state={r.state} />
                <Badge>{r.minutes} min · {cents(r.cents)}</Badge>
                {r.marked && <Marked marked />}
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </>
  )
}
