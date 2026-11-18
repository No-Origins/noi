'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Badge, Button, Card, Chip, Disclosure, Icon, type IconName } from '@noi/eio-react'
import { ComputerBox } from '../../Computers'
import { useMay } from '../../May'
import { NotYourPlace, useSees } from '../../Place'
import { PAUSED, TURN, ended, hasNext, runNow, waitsFor } from '../../mock/now'
import type { Run, Step, Waiting } from '../../mock/types'
import { pressed, useVisit } from '../../mock/visit'
import { AnswerForm } from '../../Today'
import { Fact, Gone, Head, Marked, MockControl, RunBadge, Section, Tick, cents, cx, whyParked } from '../../parts'
import styles from '../../studio.module.css'

const STEP: Record<Step['kind'], { icon: IconName; where: string; tone?: string }> = {
  model: { icon: 'agent', where: 'a call to the model' },
  box: { icon: 'comp', where: 'a command in the box' },
  outside: { icon: 'arrow', where: 'a call outside the box: Governance is asked', tone: styles.stepOutside },
  card: { icon: 'doc', where: 'a card' },
  ask: { icon: 'user', where: 'a question to the person', tone: styles.stepOutside },
  you: { icon: 'user', where: 'words from a person who may steer', tone: styles.stepYou },
  end: { icon: 'check', where: 'the hand-back: what a run reports when it ends' },
}

function StepLine({ s }: { s: Step }) {
  const kind = STEP[s.kind]
  return (
    <li className={cx(styles.step, kind.tone)}>
      <span className={styles.stepMark}><Icon name={kind.icon} size="small" label={kind.where} /></span>
      <div className={styles.stepBody}>
        <Disclosure
          summary={
            <span className={cx(styles.stepLine, 'eio-type-style-body')}>
              <span>{s.n} · {s.text}</span>
              {s.facts?.map(f => <span key={f} className={cx(styles.muted, 'eio-type-style-caption')}>· {f}</span>)}
            </span>
          }
        >
          <div className={cx(styles.stepMore, 'eio-type-style-caption')}>
            <span className="eio-type-style-label">{kind.where}</span>
            {s.more.map(m => <span key={m}>{m}</span>)}
          </div>
        </Disclosure>
      </div>
    </li>
  )
}

const CUTS = ['the set', 'the project', 'the person', 'the task']

export function RunView({ number, run, waits = [], inside }: { number: number; run?: Run; waits?: Waiting[]; inside?: boolean }) {
  const { did, press } = useVisit()
  const can = useMay()
  const sees = useSees()
  const [answering, setAnswering] = useState(false)
  const [taking, setTaking] = useState(false)
  const base = run ?? did.madeRuns.find(r => r.number === number)
  if (!base) return <Gone what="run" back="Every run" href="/runs" />
  if (!sees(base.space)) return <NotYourPlace title={`Run ${number}`} space={base.space} />
  const r = runNow(base, did)
  const over = ended(r.state)
  // A parked run says why: it was paused, it waits its turn, or it waits for one thing on Today.
  const paused = r.stateNote === PAUSED
  const inTurn = r.stateNote === TURN
  const projectPaused = paused && did.projects[r.project]?.state === 'paused'
  const asks = r.state === 'parked' && !paused && !inTurn ? waits.find(w => w.id === waitsFor(base, did)) : undefined
  const next = hasNext(base, did)
  const task = r.task
  const yours = task && did.projects[r.project]?.yours === task.n
  const what = task ? <>task {task.n}: {task.name}</> : <>a standing order</>
  const line = {
    running: 'Running',
    parked: `Parked · ${whyParked(r.stateNote, can('steer')) ?? 'it waits'}`,
    done: 'Ended: done',
    'could not': 'Ended: could not',
    stopped: `Ended: stopped ${r.stateNote ?? ''}`,
    'at a limit': `Ended: at a limit, ${r.stateNote ?? ''}`,
  }[r.state]
  const parkedNote = paused
    ? 'A paused run is parked. Only the one who gave the work lets it go on.'
    : inTurn
      ? 'Three runs at once counts only runs that are working. It goes on as soon as one of the three ends or parks.'
      : 'A run that needs its person’s answer is parked, and goes on when they answer. Waiting costs nothing: its conversation is kept, its computer saved and stopped.'

  return (
    <>
      <Head
        title={`Run ${r.number}`}
        rung={1}
        badges={<><RunBadge state={r.state} /><Marked marked={r.marked} /></>}
        sub={
          <>
            {task ? <Link className={styles.inlineLink} href={`/projects/${r.project}`}>{r.projectTitle}</Link> : <Link className={styles.inlineLink} href="/orders">{r.projectTitle}</Link>}
            {' · '}{what} · {r.agent} ({r.team}, version {r.version})
          </>
        }
      >
        <div className={styles.facts}>
          <Fact label="Now" value={line} note={r.state === 'parked' ? parkedNote : undefined} />
          <Fact label="Time, and cost" value={`${r.minutes} min · ${cents(r.cents)}`} note="of 45 minutes and $1, the caps for one run" />
          <Fact label="The model" value={r.model} note={`its version noted: ${r.modelVersion}`} />
          <Fact label="Started" value={r.started} note={`by ${r.startedBy}`} />
        </div>
        {!over && (
          <div className={styles.buttons}>
            {asks?.kind === 'question' && can('steer') && <Button variant="primary" aria-expanded={answering} onClick={() => setAnswering(!answering)}>Answer</Button>}
            {asks?.kind === 'request' && can('steer') && <Button variant="primary" onClick={() => press(pressed.settle(asks, 'given'))}>Give once</Button>}
            {asks?.kind === 'request' && can('steer') && <Button onClick={() => press(pressed.settle(asks, 'no'))}>No</Button>}
            {r.state === 'running' && can('steer') && <Button onClick={() => press(pressed.run(r.number, 'paused'))}>Pause</Button>}
            {paused && !projectPaused && can('steer') && <Button variant="primary" onClick={() => press(pressed.run(r.number, 'running'))}>Go on</Button>}
            {projectPaused && <Chip href={`/projects/${r.project}`}>Its project is paused</Chip>}
            {can('stop', r.team) && <Button onClick={() => press(pressed.run(r.number, 'stopped'))}>Stop</Button>}
          </div>
        )}
        {asks && !over && (
          <p className="eio-type-style-body">
            {asks.kind === 'request' ? `It asked for more than the governance team’s set holds: ${asks.text.replace(/^It wants /, '')} ` : `It asked: “${asks.text}” `}
            <span className={cx(styles.muted, 'eio-type-style-caption')}>It is on Today, under “Waiting for you”.{asks.kind === 'request' ? ' “Give once” is one press, for this project only.' : ''}</span>
          </p>
        )}
        {asks?.kind === 'question' && answering && (
          <Card inset="tight">
            <p className="eio-type-style-body">“{asks.text}”</p>
            <AnswerForm w={asks} onDone={() => setAnswering(false)} />
          </Card>
        )}
      </Head>

      <Section title="Its steps, as they happen" count={r.steps.length} note="Each call to the model, each command in the box, each call outside it with Governance’s answer, each card. A helper’s steps are here too, inside the run that made it. A run ends with its hand-back: what it reports when it ends. Open a step to read all of it.">
        <Card>
          <ol className={styles.steps}>{r.steps.map(s => <StepLine key={s.n} s={s} />)}</ol>
        </Card>
        {next && (
          <MockControl action={<Button onClick={() => press(pressed.nextStep(base))}>Show the next step</Button>}>
            No agent is running, so no step happens by itself.
          </MockControl>
        )}
      </Section>

      <Section title="Its pass" note="Governance cuts every pass from its own data. A pass lasts 15 minutes; Hyperbase asks for the next one.">
        <Card>
          <div className={styles.cuts}>
            {CUTS.map(c => (
              <span key={c} className={cx(styles.cut, r.state !== 'running' && styles.cutOff)}>
                <Icon name={r.state === 'running' ? 'check' : 'dash'} size="small" label={r.state === 'running' ? 'says yes' : 'no pass now'} />
                <span className="eio-type-style-body">{c}</span>
              </span>
            ))}
          </div>
          <p className="eio-type-style-body">
            {r.state === 'running'
              ? `The set, the project, the person and the task: all four say yes. It ends in ${r.passEnds ?? 9} minutes. Hyperbase asks for the next one.`
              : over ? 'Its last pass ended with the run.' : 'A parked run holds no pass, so it is not one of the three runs at once. It gets a new one when it goes on.'}
          </p>
        </Card>
      </Section>

      <Section title="Its computer">
        {r.computer && !over ? (
          <div className={styles.computers}><ComputerBox c={r.computer} inside={r.computer.files} opened={inside} parked={r.state === 'parked'} /></div>
        ) : (
          <p className="eio-type-style-body">{over ? 'Cleared when the work ended. Nothing an agent left in it is carried on, except through the branch.' : 'A computer of the task’s, opened for this work.'}</p>
        )}
      </Section>

      <Section title="At the end">
        {over && r.handBack ? (
          <Card>
            <h3 className={cx(styles.muted, 'eio-type-style-label')}>Its hand-back: what it reports when it ends</h3>
            <div className={styles.facts}>
              <Fact label="What it found" value={r.handBack.found} />
              <Fact label="The evidence" value={r.handBack.evidence} />
              <Fact label="What it assumed" value={r.handBack.assumed} />
              <Fact label="What it did not check" value={r.handBack.notChecked} />
            </div>
            {r.state === 'done' && r.checks && (
              <>
                <h3 className={cx(styles.muted, 'eio-type-style-label')}>Hyperbase’s own checks, in a clean computer</h3>
                <ul className={styles.ticks}>
                  {r.checks.map(c => (
                    <Tick key={c.name} state={c.ok ? 'done' : 'could not'}>
                      <span>{c.name}</span>
                      <span className={cx(styles.muted, 'eio-type-style-caption')}>{c.ok ? 'passed' : 'failed'}</span>
                    </Tick>
                  ))}
                </ul>
              </>
            )}
            {r.state !== 'done' && <p className={cx(styles.muted, 'eio-type-style-caption')}>It did not say “done”, so Hyperbase ran no checks.</p>}
          </Card>
        ) : (
          <p className="eio-type-style-body">When it ends: its hand-back, which is what a run reports when it ends, and Hyperbase’s own checks in a clean computer. “Done” is a claim until then.</p>
        )}
        {task && can('steer') && (
          yours ? (
            <p className="eio-type-style-body"><Badge>Yours</Badge> Task {task.n} is yours, and so is its branch{r.branch ? <>, <span className="eio-type-style-mono">{r.branch}</span></> : null}. Hand it back on <Link className={styles.inlineLink} href={`/projects/${r.project}`}>the project’s page</Link>.</p>
          ) : taking ? (
            <Card inset="tight">
              <p className="eio-type-style-body">Take over task {task.n}? The task is yours, and so is its branch, in your own copy of the code. {over ? '' : 'Its run stops. '}The agents work around it. You can hand it back with a comment.</p>
              <div className={styles.buttons}>
                <Button variant="primary" onClick={() => { press(pressed.takeOver(r.project, task.n, over ? undefined : r.number)); setTaking(false) }}>Take over task {task.n}</Button>
                <Button onClick={() => setTaking(false)}>Not now</Button>
              </div>
            </Card>
          ) : (
            <div className={styles.buttons}>
              <Button onClick={() => setTaking(true)}>Take over</Button>
              <span className={cx(styles.muted, 'eio-type-style-caption')}>The task is yours, and so is its branch.</span>
            </div>
          )
        )}
      </Section>
    </>
  )
}
