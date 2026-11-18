'use client'
import Link from 'next/link'
import { Badge, Button, Card, Disclosure, Icon } from '@noi/eio-react'
import { GovLink, MeroLink, ReviewLink } from '../../GovLink'
import { useMay } from '../../May'
import { NoOriginsOwn } from '../../Place'
import { PERSON } from '../../mock/story'
import type { DialStop, Note, Team } from '../../mock/types'
import { pressed, useVisit } from '../../mock/visit'
import { Fact, Head, Meter, Row, Section, cents, cx, plural } from '../../parts'
import styles from '../../studio.module.css'

const STOPS: DialStop[] = ['off', 'ask me', 'by a guideline']

function NoteRow({ n, team, mine, held }: { n: Note; team: string; mine: boolean; held: boolean }) {
  const { press } = useVisit()
  return (
    <Row
      icon="doc"
      text={`“${n.text}”`}
      caption={<>Its source: <Link className={styles.inlineLink} href={`/runs/${n.run}`}>run {n.run}</Link> · {n.task} · it read {n.read}{held ? ' · held: not used until a person releases it' : ''}</>}
      end={<>{held && <Badge tone="warning">Held</Badge>}{mine && <Button onClick={() => press(pressed.removeNote(team, n.id))}>Remove</Button>}</>}
    />
  )
}

export function TeamView({ team: t }: { team: Team }) {
  const { did, press } = useVisit()
  const can = useMay()
  const mine = can('tend', t.name)
  const d = did.teams[t.name] ?? {}
  const waits = t.waitingList.filter(w => did.answers[w.id] === undefined && !(d.friday && w.kind === 'note'))
  const approved = did.answers['change-build-skill'] === 'approved' && t.name === 'build'
  const released = did.answers['note-build-held'] === 'released'
  const gone = [...(d.removed ?? []), ...(did.answers['note-build-held'] === 'removed' ? ['n14'] : [])]
  // Back to last Friday puts the team as it was: every change of the week is undone at once.
  const changes = t.week.changes.map(c => ({ ...c, undone: d.friday || Boolean(did.undone[c.id]) }))
  const undoneNotes = changes.filter(c => c.undone && c.what.startsWith('a note added')).map(c => c.what)
  const notes = t.noteList.filter(n => !gone.includes(n.id) && !undoneNotes.some(w => w.includes(n.text)))
  const skills = t.skillList.map(s => (s.state === 'on trial' && approved ? { ...s, state: 'in use' as const } : s)).filter(s => !(s.state === 'on trial' && did.answers['change-build-skill'] === 'sent back'))
  const first = notes.slice(0, 5)
  const rest = notes.slice(5)
  const more = t.notes - t.noteList.length

  return (
    <NoOriginsOwn title={t.name}>
      <Head
        title={t.name}
        rung={5}
        badges={d.paused ? <Badge state="deprecated">Paused</Badge> : t.state === 'on' ? <Badge state="active">On</Badge> : <Badge state="proposed">In the shadow</Badge>}
        sub={<>{t.field} · sponsor {t.sponsor} · {plural(t.agents, 'saved agent')} · {plural(skills.filter(s => s.state === 'in use').length, 'skill')} · {plural(t.notes - (t.noteList.length - notes.length), 'note')}</>}
      >
        <p className={cx(styles.muted, 'eio-type-style-caption')}>{d.paused ? `Paused by ${PERSON}: its agents start no new run.` : t.stateNote}</p>
        {mine && (
          <div className={styles.buttons}>
            {d.paused
              ? <Button icon="fingerprint" onClick={() => press(pressed.team(t.name, { paused: false }))}>Let the team go on · a touch</Button>
              : <Button onClick={() => press(pressed.team(t.name, { paused: true }))}>Pause the team</Button>}
            <span className={cx(styles.muted, 'eio-type-style-caption')}>{d.paused ? 'Putting a team back asks for a touch.' : 'Pausing takes away, so it asks for no touch.'}</span>
          </div>
        )}
      </Head>

      {t.shadow && (
        <Section title="In the shadow" note="A team that is needed answers beside you for two weeks, and its answers are not used. It is switched on by its own count: it agreed nine times in ten, and never said yes where you said no.">
          <Card>
            <div className={styles.facts}>
              <Meter part={t.shadow.agreed[0]} of={t.shadow.agreed[1]} words={`it agreed with you ${t.shadow.agreed[0]} times in ${t.shadow.agreed[1]}, since ${t.shadow.since}`} />
              <Fact label="A yes where you said no" value={t.shadow.yesWhereNo} note="it must be none" />
              <Fact
                label="The count that switches it on"
                value={t.shadow.yesWhereNo === 0 && t.shadow.agreed[0] / t.shadow.agreed[1] >= 0.9 ? 'Reached' : 'Not reached yet'}
                note="nine times in ten, and never a yes where you said no"
              />
            </div>
            {t.shadow.lines.map(l => (
              <Row
                key={l.asked}
                icon={l.same ? 'check' : 'x'}
                label={<span>asked: {l.asked}</span>}
                text={`it would say: ${l.it} · you said: ${l.you}`}
                end={l.same ? <Badge tone="success">the same</Badge> : <Badge tone="danger">a yes where you said no</Badge>}
              />
            ))}
          </Card>
        </Section>
      )}

      <Section title="Waiting for its engineer" count={waits.length}>
        {waits.length ? (
          <Card>
            {waits.map(w => (
              <Row
                key={w.id}
                icon={w.kind === 'change' ? 'layers' : 'doc'}
                label={<span>{w.title}</span>}
                text={w.text}
                caption={w.run ? <>From <Link className={styles.inlineLink} href={`/runs/${w.run}`}>run {w.run}</Link>.{w.kind === 'change' ? ' Skills are at ASK ME on this team’s dial, so a person decides. It is registered in Mero’s Review. Approving here approves that same change there: one change, one record, one touch. You can approve it in Review instead.' : ' A run that read outside content is marked: its notes are kept, and not used until a person releases them. Releasing or removing a note asks for no touch.'}</> : undefined}
                end={mine && (w.kind === 'change' ? (
                  <>
                    <ReviewLink />
                    <Button variant="primary" icon="fingerprint" onClick={() => press(pressed.settle(w, 'approved'))}>Approve · a touch</Button>
                    <Button onClick={() => press(pressed.settle(w, 'sent back'))}>Send back</Button>
                  </>
                ) : (
                  <>
                    <Button variant="primary" onClick={() => press(pressed.settle(w, 'released'))}>Release</Button>
                    <Button onClick={() => press(pressed.settle(w, 'removed'))}>Remove</Button>
                  </>
                ))}
              />
            ))}
          </Card>
        ) : (
          <p className="eio-type-style-body">Nothing waits for its engineer.</p>
        )}
      </Section>

      {!t.shadow && (
        <Section
          title="Its week"
          end={mine && !d.friday && t.week.changes.length > 0 && <Button onClick={() => press(pressed.team(t.name, { friday: true }))}>Back to last Friday</Button>}
          note={d.friday ? `The team is as it was on ${t.week.lastFriday}: one action put back its notes, skills and saved agents.` : 'Each change made without a person carries its undo. One action puts the whole team back to last Friday.'}
        >
          <Card>
            <div className={styles.facts}>
              <Meter part={t.week.firstTimeYes[0]} of={t.week.firstTimeYes[1]} words={`first-time yes: ${t.week.firstTimeYes[0]} of ${t.week.firstTimeYes[1]}`} />
              <Fact label="An accepted task" value={cents(t.week.centsAnAccepted)} />
              <Meter part={t.week.keptTasks[0]} of={t.week.keptTasks[1]} words={`kept tasks: ${t.week.keptTasks[0]} of ${t.week.keptTasks[1]} still pass`} />
            </div>
            <h3 className={cx(styles.muted, 'eio-type-style-label')}>Changed without a person · {t.week.changes.length}</h3>
            <p className={cx(styles.muted, 'eio-type-style-caption')}>Only notes, while the dial for skills is at ASK ME. A skill shows here only once that dial is at BY A GUIDELINE.</p>
            {changes.length ? changes.map(c => (
              <Row
                key={c.id}
                icon="layers"
                text={c.what}
                caption={<>{c.when} · the yes: {c.yes}{c.run ? <> · from <Link className={styles.inlineLink} href={`/runs/${c.run}`}>run {c.run}</Link></> : null}{c.undone ? ' · undone' : ''}</>}
                end={<>{c.undone && <Badge state="deprecated">Undone</Badge>}{mine && !d.friday && <Button onClick={() => press(pressed.undo(c.id, !c.undone))}>{c.undone ? 'Put back' : 'Undo'}</Button>}</>}
              />
            )) : <p className="eio-type-style-body">Nothing changed without a person this week.</p>}
          </Card>
        </Section>
      )}

      <Section title="Notes" count={t.notes - (t.noteList.length - notes.length)} note="Each note names its source: the run, the task, what it read. A note is advice; it never gives a permission.">
        <Card>
          {first.map(n => <NoteRow key={n.id} n={n} team={t.name} mine={mine} held={Boolean(n.held) && !released} />)}
          {rest.length > 0 && (
            <div className={styles.row}>
              <div className={styles.grow}>
                <Disclosure summary={`${rest.length} more`}>
                  {rest.map(n => <NoteRow key={n.id} n={n} team={t.name} mine={mine} held={Boolean(n.held) && !released} />)}
                </Disclosure>
              </div>
            </div>
          )}
          {more > 0 && <p className={cx(styles.muted, 'eio-type-style-caption')}>{more} more are not written in the mock.</p>}
        </Card>
      </Section>

      <Section title="Saved agents, and skills" end={<MeroLink>Its definitions, in Mero</MeroLink>} note="Each is a meron with a written shape. A change to one is registered in Mero’s Review. A new skill, or a change to an agent’s job, can be approved here as well. Tools, a new team and the shapes are approved in Review.">
        <Card>
          {t.savedAgents.map(a => <Row key={a.name} icon="agent" label={<span>a saved agent · version {a.version}</span>} text={a.name} caption={a.job} />)}
          {skills.map(s => (
            <Row key={s.name} icon="doc" label={<span>a skill · used when {s.when}</span>} text={`“${s.name}”`} end={s.state === 'on trial' ? <Badge state="proposed">On trial</Badge> : <Badge state="active">In use</Badge>} />
          ))}
          {skills.length === 0 && <p className="eio-type-style-body">No skills yet.</p>}
        </Card>
      </Section>

      <Section title="Its dial, and its set" end={<GovLink />} note="Set by an owner, on Governance’s pages. Turning a dial up, or making a set wider, takes a touch. Turning it down, or making it smaller, takes none. Studio only shows them.">
        <Card>
          <div className={styles.dials}>
            {t.dial.map(k => (
              <div key={k.what} className={styles.dial}>
                <span className={cx(styles.dialWhat, 'eio-type-style-body')}>{k.what}</span>
                {k.stop === 'nobody' ? (
                  <span className={styles.buttons}><Icon name="check" size="small" /><span className="eio-type-style-label">nobody is asked</span></span>
                ) : (
                  <span className={cx(styles.dialStops, 'eio-type-style-label')} role="img" aria-label={`The dial is at ${k.stop}`}>
                    {STOPS.map(s => <span key={s} className={cx(styles.dialStop, s === k.stop && styles.dialOn)}>{s}</span>)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <Row icon="key" label={<span>its set</span>} text={t.set} caption={t.name === 'governance' ? undefined : 'A set for each team arrives with rung 6. Then this shows the team’s own.'} />
        </Card>
      </Section>
    </NoOriginsOwn>
  )
}
