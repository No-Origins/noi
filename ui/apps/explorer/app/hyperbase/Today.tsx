'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Button, Card, Checkbox, type IconName, TextArea } from '@noi/eio-react'
import { GovLink, ReviewLink } from './GovLink'
import { useMay } from './May'
import { AT_ONCE, TURN, rowNow, rowOfRun } from './mock/now'
import { sees } from './mock/may'
import { NOW, PERSON } from './mock/story'
import type { Month, RunRow, Since, Waiting } from './mock/types'
import { pressed, useVisit, useWaiting } from './mock/visit'
import { Fact, Head, Meter, MockControl, RunBadge, Row, Section, cents, cx, dollars, plural, waited } from './parts'
import styles from './studio.module.css'

const KIND: Record<Waiting['kind'], { name: string; icon: IconName }> = {
  question: { name: 'A question', icon: 'agent' },
  request: { name: 'A request', icon: 'key' },
  land: { name: 'Work to land', icon: 'arrow' },
  change: { name: 'A new skill', icon: 'layers' },
  note: { name: 'A note, held', icon: 'doc' },
  cap: { name: 'A cap was reached', icon: 'minus' },
  paused: { name: 'A parked run', icon: 'minus' },
  accept: { name: 'A thing to accept', icon: 'comp' },
}
/** What a touch is asked for (agreed 16 Nov): landing cannot be undone, and approving gives power.
    Saying no, sending back, releasing and removing ask for none. */
const TOUCH: Partial<Record<Waiting['kind'], { verb: string; how: string; names: (w: Waiting) => string }>> = {
  land: { verb: 'Land', how: 'landed', names: w => `land ${w.projectTitle}` },
  change: { verb: 'Approve', how: 'approved', names: w => `approve ${w.text.replace(/^A /, 'the ')}` },
}
/** The answer the mock sends when the field is left empty. */
export const EXAMPLE_ANSWER = 'Yes. Keep it in the address, as the other choices are.'

/** Write an answer to a question, and send it. */
export function AnswerForm({ w, onDone }: { w: Waiting; onDone?: () => void }) {
  const { press } = useVisit()
  const [text, setText] = useState('')
  return (
    <>
      <TextArea className={styles.fill} label="Your answer" rows={2} placeholder={EXAMPLE_ANSWER} value={text} onChange={e => setText(e.target.value)} />
      <div className={styles.buttons}>
        <Button variant="primary" onClick={() => { press(pressed.answer(w, text.trim() || EXAMPLE_ANSWER)); onDone?.() }}>Send answer</Button>
        <span className={cx(styles.muted, 'eio-type-style-caption')}>In the mock, an empty answer sends the example.</span>
      </div>
    </>
  )
}

/** One thing that waits. `mine`: it waits for whoever is looking, so it has its buttons. `tick`:
    it is one of several that wait for a touch, so it is ticked here and touched once, below. */
function WaitingRow({ w, mine, tick }: { w: Waiting; mine: boolean; tick?: { on: boolean; set: (on: boolean) => void } }) {
  const { press, did } = useVisit()
  const can = useMay()
  const [open, setOpen] = useState(false)
  const kind = KIND[w.kind]
  const touch = TOUCH[w.kind]
  const whose = w.projectTitle ?? (w.team ? `the ${w.team} team` : w.kind === 'cap' ? 'the month' : '')
  // A run that needs its person's answer is parked: it is listed here, with what it waits for.
  const parked = (w.kind === 'question' || w.kind === 'request') && w.run !== undefined
  const label = (
    <>
      <span>{kind.name}</span>
      <span>· {whose}</span>
      {w.kind === 'land' && w.person && <span>· {w.person}’s project</span>}
      {w.kind === 'paused' && <span>· run {w.run}</span>}
      {parked && <span>· run {w.run} is parked</span>}
      <span>· {w.minutes < 1 ? 'just now' : `waiting ${waited(w.minutes)}`}</span>
    </>
  )
  const projectPaused = w.kind === 'paused' && w.project !== undefined && did.projects[w.project]?.state === 'paused'
  const buttons = !mine ? (w.kind === 'land' && <Button href={`/projects/${w.project}`}>Look</Button>) : {
    question: <Button variant="primary" aria-expanded={open} onClick={() => setOpen(!open)}>Answer</Button>,
    request: (
      <>
        <Button variant="primary" onClick={() => press(pressed.settle(w, 'given'))}>Give once</Button>
        <Button onClick={() => press(pressed.settle(w, 'no'))}>No</Button>
      </>
    ),
    land: (
      <>
        <Button href={`/projects/${w.project}`}>Look</Button>
        {tick ? <Checkbox checked={tick.on} onChange={e => tick.set(e.target.checked)}>Land</Checkbox> : <Button variant="primary" icon="fingerprint" onClick={() => press(pressed.settle(w, 'landed'))}>Land · a touch</Button>}
      </>
    ),
    change: (
      <>
        <ReviewLink>Look</ReviewLink>
        {tick ? <Checkbox checked={tick.on} onChange={e => tick.set(e.target.checked)}>Approve</Checkbox> : <Button variant="primary" icon="fingerprint" onClick={() => press(pressed.settle(w, 'approved'))}>Approve · a touch</Button>}
        <Button onClick={() => press(pressed.settle(w, 'sent back'))}>Send back</Button>
      </>
    ),
    note: (
      <>
        <Button variant="primary" onClick={() => press(pressed.settle(w, 'released'))}>Release</Button>
        <Button onClick={() => press(pressed.settle(w, 'removed'))}>Remove</Button>
      </>
    ),
    cap: (
      <>
        {w.project && <Button href={`/projects/${w.project}`}>Look</Button>}
        <GovLink>The cap, in Governance</GovLink>
      </>
    ),
    paused: (
      <>
        <Button href={projectPaused ? `/projects/${w.project}` : `/runs/${w.run}`}>Look</Button>
        <Button variant="primary" onClick={() => press(projectPaused ? pressed.goOn(w.project!) : pressed.run(w.run!, 'running'))}>Go on</Button>
        {!projectPaused && can('stop') && <Button onClick={() => press(pressed.run(w.run!, 'stopped'))}>Stop</Button>}
      </>
    ),
    accept: (
      <>
        <Button href="/space">Look</Button>
        <Button variant="primary" onClick={() => press(pressed.thing(w.id.replace('accept-', ''), 'accepted', w.project))}>Accept</Button>
        <Button onClick={() => press(pressed.thing(w.id.replace('accept-', ''), 'sent back', w.project))}>Send back</Button>
      </>
    ),
  }[w.kind]
  const caption = [
    w.detail,
    w.kind === 'request' && w.before ? `${mine ? 'You' : w.person ?? PERSON} gave this ${w.before} times before.` : undefined,
    w.kind === 'request' && mine ? '“Give once” is one press, signed in. It is for this project only, and ends with it.' : undefined,
    parked ? `Run ${w.run} goes on when ${mine ? 'you' : w.person ?? PERSON} ${w.kind === 'request' ? (mine ? 'say yes or no' : 'says yes or no') : (mine ? 'answer' : 'answers')}. Waiting costs nothing.` : undefined,
    w.kind === 'change' ? `It is registered in Mero’s Review. Approving here approves that same change there: one change, one record, one touch.${mine ? ' “Look” opens it in Review.' : ''}` : undefined,
    w.kind === 'cap' ? `Once Hyperbase is hosted, an email goes at once. ${can('limits') ? 'Raising a cap takes a touch, on Governance’s page. Lowering one takes none.' : 'An owner can raise it, with a touch, on Governance’s page.'}` : undefined,
    w.kind === 'paused' ? 'A parked run waits at no cost, and holds no pass.' : undefined,
    parked && w.project && did.projects[w.project]?.state === 'paused' ? `Its project is paused, by ${PERSON}: the run goes on once the project does.` : undefined,
  ].filter(Boolean).join(' ')
  return (
    <Row
      icon={kind.icon}
      label={label}
      text={w.kind === 'question' ? `“${w.text}”` : w.kind === 'land' && !mine ? 'Done and checked. An owner lands it.' : w.text}
      caption={caption || undefined}
      end={buttons || undefined}
      below={open && w.kind === 'question' ? <AnswerForm w={w} /> : undefined}
    />
  )
}

function Running({ r }: { r: RunRow }) {
  const { press } = useVisit()
  const can = useMay()
  const what = r.task ? `${r.projectTitle} · task ${r.task.n}${r.task.of ? ` of ${r.task.of}` : ''}` : `${r.order} · a standing order`
  const waits = r.stateNote === TURN
  return (
    <Row
      label={<span>Run {r.number}</span>}
      text={<><Link className={styles.inlineLink} href={`/runs/${r.number}`}>{what}</Link> · {r.agent}</>}
      caption={[`${r.minutes} min`, cents(r.cents), waits ? 'parked: it waits its turn, and goes on as soon as one of the three ends or parks' : undefined].filter(Boolean).join(' · ')}
      end={
        <>
          <RunBadge state={r.state} />
          {r.state === 'running' && can('steer') && <Button onClick={() => press(pressed.run(r.number, 'paused'))}>Pause</Button>}
          {can('stop', r.team) && <Button onClick={() => press(pressed.run(r.number, 'stopped'))}>Stop</Button>}
        </>
      }
    />
  )
}

export function Today({ waiting, running, since, month }: { waiting: Waiting[]; running: RunRow[]; since: Since[]; month: Month }) {
  const { did, role, press } = useVisit()
  const can = useMay()
  const { mine, others } = useWaiting(waiting)
  const [ticked, setTicked] = useState<string[]>([])
  const inSpace = role === 'person'
  // What waits for a touch gathers in one place, when there is more than one: tick, and touch once.
  const forTouch = mine.filter(w => TOUCH[w.kind])
  const gathered = forTouch.length > 1 ? forTouch : []
  const top = mine.filter(w => w.kind === 'cap')
  const rest = mine.filter(w => !gathered.includes(w) && w.kind !== 'cap')
  const chosen = gathered.filter(w => ticked.includes(w.id))
  const rows = [...did.madeRuns.map(r => rowOfRun(r, did.made.find(p => p.name === r.project)?.plan.length)), ...running].map(r => rowNow(r, did)).filter(r => sees(role, r.space))
  const working = rows.filter(r => r.state === 'running')
  const turn = rows.filter(r => r.stateNote === TURN)
  // Every kind of yes is counted. After the third same yes, Today offers to write it down once.
  const request = waiting.find(w => w.kind === 'request')
  const third = request && did.answers[request.id] === 'given' && (request.before ?? 0) + 1 >= 3 && (can('steer') || can('limits')) && role !== 'person'
  const land = waiting.filter(w => w.kind === 'land' && did.answers[w.id] === 'landed')
  const approved = waiting.filter(w => w.kind === 'change' && did.answers[w.id] === 'approved')
  const anHour = mine.filter(w => w.minutes >= 60).length
  const total = others.reduce((n, o) => n + o.items.length, 0)
  return (
    <>
      <Head title="Today" rung={3} sub={`What waits for you comes first. In the story it is ${NOW}.`} />

      <Section
        title={role === 'viewer' ? 'Waiting' : 'Waiting for you'}
        count={role === 'viewer' ? total : mine.length}
        note={
          role === 'viewer'
            ? 'Nothing waits for a viewer, so there are no buttons and no count on the tab. Each heading says whom the things under it wait for.'
            : `The oldest first. The count on the Hyperbase tab says how many, on every page of the app.${anHour ? ` ${plural(anHour, 'thing')} waited an hour, so one email was sent; on this Mac the mail catcher keeps it and sends none.` : ''}`
        }
      >
        {role !== 'viewer' && mine.length === 0 && <p className="eio-type-style-body">Nothing waits for you.</p>}
        {top.length > 0 && <Card>{top.map(w => <WaitingRow key={w.id} w={w} mine />)}</Card>}
        {gathered.length > 0 && (
          <Card>
            <h3 className={cx(styles.muted, 'eio-type-style-label')}>For your touch · {gathered.length}</h3>
            {gathered.map(w => (
              <WaitingRow key={w.id} w={w} mine tick={{ on: ticked.includes(w.id), set: on => setTicked(on ? [...ticked, w.id] : ticked.filter(id => id !== w.id)) }} />
            ))}
            <div className={styles.row}>
              <div className={styles.rowText}>
                <span className="eio-type-style-body">
                  {chosen.length ? `One touch, for what you ticked: ${chosen.map(w => TOUCH[w.kind]!.names(w)).join(', and ')}.` : 'Tick what you agree to, and touch once.'}
                </span>
                <span className={cx(styles.muted, 'eio-type-style-caption')}>The touch names every thing you ticked, and approves nothing after it. Sending back needs no touch.</span>
              </div>
              <div className={styles.rowEnd}>
                <Button
                  variant="primary"
                  icon="fingerprint"
                  disabled={!chosen.length}
                  onClick={() => { press(pressed.touch(chosen.map(w => ({ w, how: TOUCH[w.kind]!.how })))); setTicked([]) }}
                >
                  {chosen.length > 1 ? `Touch once · ${chosen.length} things` : 'Touch once'}
                </Button>
              </div>
            </div>
          </Card>
        )}
        {rest.length > 0 && <Card>{rest.map(w => <WaitingRow key={w.id} w={w} mine />)}</Card>}
        {others.map(o => (
          <div key={o.whom} className={styles.tight}>
            <h3 className={cx(styles.muted, 'eio-type-style-label')}>Waiting for {o.whom} · {o.items.length}</h3>
            <Card>{o.items.map(w => <WaitingRow key={w.id} w={w} mine={false} />)}</Card>
          </div>
        ))}
        {third && !did.offerAway && (
          <Card inset="tight">
            <Row
              icon="key"
              text="That was the third same yes: reading docs.rs. Write it down once?"
              caption={can('limits')
                ? 'As a line in the set, with one touch on Governance’s page. From then no one is asked for it. The same is offered for every kind of yes you keep giving.'
                : 'An owner can add it to the set, with one touch on Governance’s page. From then no one is asked for it.'}
              end={<><GovLink>Add to the set, in Governance</GovLink><Button onClick={() => press(pressed.offerAway())}>Not now</Button></>}
            />
          </Card>
        )}
        {third && did.offerAway && <p className={cx(styles.muted, 'eio-type-style-caption')}>Put away. It is offered again after three more of the same yes.</p>}
        {(land.length > 0 || approved.length > 0) && !inSpace && (
          <Card inset="tight">
            {land.map(w => (
              <Row
                key={w.id}
                icon="check"
                text={can('land') ? `Landed: ${w.projectTitle} is done.` : `An owner landed ${can('steer') ? 'your work' : 'the work'}: ${w.projectTitle} is done. Landed by ${PERSON}.`}
                caption={can('land') ? 'The real page asks for your passkey here, and the touch names what it lands. The mock asks nothing.' : undefined}
                end={<Button href={`/projects/${w.project}`}>Look</Button>}
              />
            ))}
            {can('tend') && approved.map(w => (
              <Row key={w.id} icon="check" text={`Approved: ${w.text.replace(/^A /, 'the ')}.`} caption="The same change is approved in Mero’s Review: one change, one record, one touch. The mock asks nothing." end={<ReviewLink>Look</ReviewLink>} />
            ))}
          </Card>
        )}
      </Section>

      <Section
        title="Running now"
        count={`${working.length} of ${month.runsAtOnce}`}
        note={working.length >= AT_ONCE
          ? 'Three runs are working: that is the cap for runs at once. Nobody is told. The next run waits its turn, and starts as soon as one of the three ends or parks.'
          : 'Only runs that are working count against three at once. A parked run waits at no cost: it is under “Waiting for you”, with what it waits for.'}
      >
        {working.length + turn.length ? <Card>{[...working, ...turn].map(r => <Running key={r.number} r={r} />)}</Card> : <p className="eio-type-style-body">Nothing is running.</p>}
      </Section>

      {inSpace ? (
        <Section title="Your space">
          <p className="eio-type-style-body">You see your space, and the work in it. Its plan, and what is on its canvas, are on Space.</p>
          <p><Button href="/space">Your space</Button></p>
        </Section>
      ) : (
        <>
          <Section title="Since you last looked" note="Nothing here sent you a message. Steps, finished tasks and changes are on Today when you look. Landing takes a person’s touch, so a landing names who landed it; what you landed yourself is listed too.">
            <Card>
              {since.map(s => {
                const undone = s.change ? did.undone[s.change] : false
                const pulls = s.pulls ? [...s.pulls, ...land.map(w => `${w.detail?.match(/\d+/)?.[0] ?? ''}, ${w.projectTitle}`)] : undefined
                return (
                  <Row
                    key={s.id}
                    icon={s.change ? 'layers' : s.href ? 'arrow' : 'check'}
                    text={pulls ? `${plural(pulls.length, 'pull request')} landed · by ${s.by}: ${pulls.join(' · ')}` : s.text}
                    caption={s.change ? (undone ? 'Undone. The note is no longer in the team’s notes.' : 'A change made without a person carries its undo.') : undefined}
                    end={
                      <>
                        {s.href && <Button href={s.href}>Look</Button>}
                        {s.change && can('tend', s.team) && <Button onClick={() => press(pressed.undo(s.change!, !undone))}>{undone ? 'Put back' : 'Undo'}</Button>}
                      </>
                    }
                  />
                )
              })}
            </Card>
          </Section>

          <Section title="This month" end={<GovLink>The caps, in Governance</GovLink>} note="The caps are held in code. Past a cap nothing new starts, and whom it waits for is told at once: it is at the top of “Waiting for you”. A project’s cap waits for its person, the month’s for an owner.">
            <Card>
              <div className={styles.facts}>
                <Meter part={did.cap && !did.cap.project ? month.tokensCap : month.tokens} of={month.tokensCap} near={Boolean(did.cap && !did.cap.project)} words={`tokens ${dollars(did.cap && !did.cap.project ? month.tokensCap : month.tokens)} of ${dollars(month.tokensCap)}`} />
                <Meter part={month.computers} of={15} words={`computers ${dollars(month.computers)}, ${month.computersNote}`} />
                <Fact label="Projects" value={month.projects + did.made.filter(p => p.kind !== 'thing').length} />
                <Fact label="One run" value={`${month.runCap.minutes} minutes, ${dollars(month.runCap.dollars)}`} note="its cap" />
                <Fact label="One project" value={dollars(month.projectCap)} note="its cap" />
              </div>
            </Card>
            <MockControl
              action={did.cap
                ? <Button onClick={() => press(pressed.cap())}>Put it back</Button>
                : <><Button onClick={() => press(pressed.cap('project'))}>Reach a project’s cap</Button><Button onClick={() => press(pressed.cap('month'))}>Reach the month’s cap</Button></>}
            >
              No money is spent in the mock, so no cap is reached by itself.
            </MockControl>
          </Section>
        </>
      )}
    </>
  )
}
