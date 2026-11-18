'use client'
import Link from 'next/link'
import { Badge, Button, Card } from '@noi/eio-react'
import { May, useMay } from '../May'
import { sees } from '../mock/may'
import { projectRowNow, rowOfProject } from '../mock/now'
import type { Draft, ProjectRow } from '../mock/types'
import { pressed, useVisit } from '../mock/visit'
import { Head, Meter, ProjectBadge, Row, Section, cx, dollars, plural } from '../parts'
import styles from '../studio.module.css'

const LINES: (keyof Draft['brief'])[] = ['why', 'inOut', 'doneMeans', 'where']

export function ProjectList({ rows, drafts }: { rows: ProjectRow[]; drafts: Draft[] }) {
  const { did, role, press } = useVisit()
  const can = useMay()
  const inSpace = role === 'person'
  const all = [...did.made.map(rowOfProject), ...rows].map(r => projectRowNow(r, did)).filter(r => sees(role, r.space))
  // A brief that is not handed over is kept as a draft, for its person only (agreed 16 Nov).
  const kept = can('give') ? [...did.drafts, ...drafts.filter(d => !did.drafts.some(x => x.id === d.id))].filter(d => !did.discarded.includes(d.id)) : []
  return (
    <>
      <Head
        title="Projects"
        rung={3}
        sub={inSpace ? 'The things you asked for in your space. Each is a small project, on one page.' : 'Work you handed over. Each project is one page.'}
        end={inSpace
          ? <Button href="/space">Ask for a thing</Button>
          : <May verb="give"><Button href="/projects/new">Hand work over</Button></May>}
      />
      {kept.length > 0 && (
        <Section title="Drafts" count={kept.length} note="A brief you have not handed over is kept as a draft, for you only, with its talk. “Go on” opens it where you left it.">
          <Card>
            {kept.map(d => {
              const written = LINES.filter(l => d.brief[l]?.trim()).length
              return (
                <Row
                  key={d.id}
                  icon="pen"
                  label={<><span>A draft</span><span>· for you only</span><span>· {d.kept}</span></>}
                  text={d.brief.why.trim() || 'No “why” yet.'}
                  caption={`${written} of 4 lines written${d.said.length ? ` · its talk is kept: ${plural(d.said.length, 'line')}` : ''}`}
                  end={<><Button href={`/projects/new?draft=${d.id}`}>Go on</Button><Button onClick={() => press(pressed.discard(d.id))}>Discard</Button></>}
                />
              )
            })}
          </Card>
        </Section>
      )}
      <Section
        title={inSpace ? 'In your space' : 'All projects'}
        count={all.length}
        note={inSpace ? 'Asking for a thing makes a small project. One line is enough, and the team writes the rest.' : 'A lone task sits here too: one line, and a place. Standing orders have their own page; each go of one is under Runs.'}
      >
        <div className={styles.list}>
          {all.map(p => (
            <Link key={p.name} href={`/projects/${p.name}`} className={styles.linkRow}>
              <div className={styles.rowText}>
                <span className={cx(styles.rowLabel, 'eio-type-style-label')}>
                  <span className="eio-type-style-mono">{p.name}</span>
                  {p.kind === 'lone task' && <span>· a lone task</span>}
                  {p.kind === 'thing' && <span>· a thing in your space</span>}
                  <span>· for {p.kind === 'thing' ? 'you' : p.person} · {p.kind === 'thing' ? 'asked' : 'handed over'} {p.handedOver}</span>
                </span>
                <span className="eio-type-style-body">{p.goal}</span>
              </div>
              <div className={styles.rowFacts}>
                <ProjectBadge state={p.state} />
                {p.of > 0 && <Meter part={p.done} of={p.of} words={`done means ${p.done} of ${p.of}`} />}
                <Badge>{dollars(p.spent)} of {dollars(p.cap)}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </>
  )
}
