'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Badge, Button, Card, Disclosure, Icon, TextArea } from '@noi/eio-react'
import { ComputerBox } from '../../Computers'
import { GovLink } from '../../GovLink'
import { useMay } from '../../May'
import { NotYourPlace, useSees } from '../../Place'
import { projectNow } from '../../mock/now'
import { PERSON } from '../../mock/story'
import type { Inside, Project, ThreadLine, Waiting } from '../../mock/types'
import { pressed, useVisit } from '../../mock/visit'
import { Fact, Gone, Head, Meter, MockControl, ProjectBadge, Row, Section, Tick, cx, dollars, plural, whyParked } from '../../parts'
import styles from '../../studio.module.css'

type Panel = null | 'comment' | 'comment-thread' | 'goal' | 'take' | 'back' | 'stop' | 'close'
const EXAMPLE_COMMENT = 'Keep the filters in one row on a phone too.'

const KIND_WORDS: Record<ThreadLine['kind'], string> = { card: 'a card', 'hand-back': 'its hand-back', request: 'a request', answer: 'an answer', message: 'a message', question: 'a question', comment: 'a comment', change: '' }
const quoted = (l: ThreadLine) => (['card', 'request', 'question', 'comment'].includes(l.kind) || (l.kind === 'answer' && l.person && !l.reply) ? `“${l.text}”` : l.text)

function Said({ l, yours }: { l: ThreadLine; yours: boolean }) {
  const tone = l.reply === 'applied' || l.reply === 'done' || l.reply?.startsWith('given') ? 'success' : l.reply === 'needs your decision' || l.reply === 'comes up to you' ? 'warning' : 'neutral'
  return (
    <li className={cx(styles.said, l.person && styles.saidYou)}>
      <span className={styles.saidIcon}><Icon name={l.person ? 'user' : 'agent'} size="small" label={l.person ? 'A person' : 'An agent'} /></span>
      <div className={styles.saidBody}>
        <span className={cx(styles.saidWho, 'eio-type-style-label')}>
          <span>{l.from}{l.to ? ` to ${l.to}` : ''}</span>
          {KIND_WORDS[l.kind] && <span>· {KIND_WORDS[l.kind]}</span>}
          {l.reply && <Badge tone={tone}>{l.reply}</Badge>}
          {l.waiting && <Badge state="proposed">{yours ? 'waits for you, on Today' : `waits for ${PERSON}`}</Badge>}
          {l.kind === 'comment' && !l.reply && <Badge state="proposed">{l.answers === 'the lead' ? 'the lead answers at its next step' : 'the governance team answers within a minute'}</Badge>}
        </span>
        <span className="eio-type-style-body">{quoted(l)}</span>
      </div>
    </li>
  )
}

export function ProjectView({ name, project, insides, waiting }: { name: string; project?: Project; insides: Record<number, Inside>; waiting: Waiting[] }) {
  const { did, press } = useVisit()
  const can = useMay()
  const sees = useSees()
  const [panel, setPanel] = useState<Panel>(null)
  const [text, setText] = useState('')
  const base = project ?? did.made.find(m => m.name === name)
  if (!base) return <Gone what="project" back="All projects" href="/projects" />
  if (!sees(base.space)) return <NotYourPlace title={base.title} space={base.space} />
  const p = projectNow(base, did, waiting)
  const d = did.projects[name] ?? {}
  const thing = p.kind === 'thing'
  const small = p.kind !== 'project'
  const inside: Record<number, Inside> = { ...insides, ...Object.fromEntries(did.madeRuns.filter(r => r.project === name && r.computer).map(r => [r.number, r.computer!.files])) }
  const live = p.state === 'working' || p.state === 'waiting for you' || p.state === 'paused'
  const paused = p.state === 'paused'
  const yours = p.plan.find(t => t.state === 'yours')
  const going = p.plan.filter(t => (t.state === 'working' || t.state === 'parked') && t.run)
  const current = yours ?? going[0] ?? p.plan.find(t => t.state === 'to do')
  const runs = going.map(t => t.run!)
  const toDo = p.plan.find(t => t.state === 'to do')
  const done = p.doneMeans.filter(l => l.done).length
  const land = waiting.find(w => w.kind === 'land')
  const toLand = land && did.answers[land.id] === undefined && p.state === 'waiting for you'
  const toAccept = thing && p.state === 'waiting for you'
  const pending = p.thread.some(l => l.kind === 'comment' && !l.reply)
  const capped = did.cap?.project === name
  // No run is going, and the next task is due: nothing is behind the mock, so a minute does not pass.
  const due = d.restart && p.state === 'working' && going.length === 0 && !yours && toDo
  const open = (next: Panel) => { setText(next === 'goal' ? p.goal : ''); setPanel(panel === next ? null : next) }
  const close = () => { setPanel(null); setText('') }

  const commentForm = (
    <Card inset="tight">
      <TextArea className={styles.fill} label="Your comment" rows={2} placeholder={EXAMPLE_COMMENT} value={text} onChange={e => setText(e.target.value)} />
      <div className={styles.buttons}>
        <Button variant="primary" onClick={() => { press(pressed.comment(name, text.trim() || EXAMPLE_COMMENT, p.plan.some(t => t.state === 'working'))); close() }}>Send comment</Button>
        <Button onClick={close}>Not now</Button>
      </div>
      <p className={cx(styles.muted, 'eio-type-style-caption')}>
        Your comment gets one of four answers: applied · not applied · made a task · needs your decision. The lead answers at its next step. With no run going, the governance team answers, within a minute. “Needs your decision” becomes a question under “Waiting for you”, on Today. In the mock the four come in turn, and an empty comment sends an example.
      </p>
    </Card>
  )

  return (
    <>
      <Head
        title={p.title}
        rung={thing ? 8 : 3}
        badges={<><ProjectBadge state={p.state} />{p.kind === 'lone task' && <Badge>A lone task</Badge>}{thing && <Badge>A thing in your space</Badge>}</>}
        sub={thing
          ? <>asked for by you · {p.handedOver} · its place is your space: <span className="eio-type-style-mono">{p.space}</span></>
          : <>for {p.person} · handed over {p.handedOver} · <span className="eio-type-style-mono">noi.hyp.projects.{p.name}</span></>}
      >
        {live && can('steer') && (
          <div className={styles.buttons}>
            <Button aria-expanded={panel === 'comment'} onClick={() => open('comment')}>Comment</Button>
            {paused
              ? <Button variant="primary" onClick={() => press(pressed.goOn(name))}>{p.stopped ? 'Start again' : 'Go on'}</Button>
              : <Button onClick={() => press(pressed.pause(name))}>Pause</Button>}
            {!paused && <Button aria-expanded={panel === 'goal'} onClick={() => open('goal')}>Change the goal</Button>}
            {!paused && current && (yours
              ? <Button aria-expanded={panel === 'back'} onClick={() => open('back')}>Hand it back</Button>
              : <Button aria-expanded={panel === 'take'} onClick={() => open('take')}>Take over</Button>)}
            {!paused && can('stop') && <Button aria-expanded={panel === 'stop'} onClick={() => open('stop')}>Stop</Button>}
            {paused && can('stop') && <Button aria-expanded={panel === 'close'} onClick={() => open('close')}>Close</Button>}
          </div>
        )}
        {panel === 'comment' && commentForm}
        {panel === 'goal' && (
          <Card inset="tight">
            <TextArea className={styles.fill} label="The goal" rows={2} value={text} onChange={e => setText(e.target.value)} />
            <div className={styles.buttons}>
              <Button variant="primary" disabled={!text.trim() || text.trim() === p.goal} onClick={() => { press(pressed.goal(name, text.trim(), runs[0])); close() }}>Change the goal</Button>
              <Button onClick={close}>Not now</Button>
            </div>
            <p className={cx(styles.muted, 'eio-type-style-caption')}>
              One press, like handing over. The run that is going stops, and says where it got to. The governance team writes done means and the plan again: finished tasks stay finished. What was given is checked again. The money and the days go on counting.
            </p>
          </Card>
        )}
        {panel === 'take' && current && (
          <Card inset="tight">
            <p className="eio-type-style-body">
              Take over task {current.n}, “{current.name}”? The task is yours, and so is its branch, in your own copy of the code. Its run stops; the agents work around it. You can hand it back with a comment.
            </p>
            <div className={styles.buttons}>
              <Button variant="primary" onClick={() => { press(pressed.takeOver(name, current.n, current.run)); close() }}>Take over task {current.n}</Button>
              <Button onClick={close}>Not now</Button>
            </div>
          </Card>
        )}
        {panel === 'back' && yours && (
          <Card inset="tight">
            <TextArea className={styles.fill} label="A comment for the lead" rows={2} placeholder="The filter bar is done on my branch. Go on from there." value={text} onChange={e => setText(e.target.value)} />
            <div className={styles.buttons}>
              <Button variant="primary" onClick={() => { press(pressed.handBack(name, yours.n, text.trim() || 'go on from my branch')); close() }}>Hand task {yours.n} back</Button>
              <Button onClick={close}>Not now</Button>
            </div>
          </Card>
        )}
        {panel === 'stop' && (
          <Card inset="tight">
            <p className="eio-type-style-body">Stop the project? Its runs end at once, and say where they got to. The project is paused, and says who stopped it. Only its person starts it again.</p>
            <div className={styles.buttons}>
              <Button variant="primary" onClick={() => { press(pressed.stop(name, runs)); close() }}>Stop the project</Button>
              <Button onClick={close}>Not now</Button>
            </div>
            <p className={cx(styles.muted, 'eio-type-style-caption')}>“Pause” is gentler: its runs finish their step and park, and “Go on” lets them go on.</p>
          </Card>
        )}
        {panel === 'close' && (
          <Card inset="tight">
            <p className="eio-type-style-body">Close the project? That is for good: a closed project is not started again. Its page, and the work on its branch, are kept.</p>
            <div className={styles.buttons}>
              <Button variant="primary" onClick={() => { press(pressed.close(name, runs)); close() }}>Close the project</Button>
              <Button onClick={close}>Not now</Button>
            </div>
          </Card>
        )}
        <Fact label={thing ? 'Your line' : 'Goal'} value={p.goal} note={p.note} />
        {capped && (
          <Card inset="tight">
            <Row icon="warn" text={`Its cap is reached: ${dollars(p.cap)} of ${dollars(p.cap)}. Nothing new starts in this project.`} caption="It waits for its person, at the top of Today. Raising a cap takes an owner’s touch, on Governance’s page." end={<GovLink>The cap, in Governance</GovLink>} />
          </Card>
        )}
        {p.brief && (
          <Disclosure summary="The brief, as it was handed over">
            <div className={styles.facts}>
              <Fact label="Why" value={p.brief.why} />
              <Fact label="In, and out" value={p.brief.inOut || '—'} />
              <Fact label="Done means" value={p.brief.doneMeans.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)} />
              <Fact label="Where" value={p.brief.where || '—'} />
              <Fact label="For" value={p.brief.forWhom} />
              {p.brief.open && <Fact label="The shaper’s open question" value={p.brief.open} />}
              {p.brief.size && <Fact label="A guess at the size" value={p.brief.size} />}
            </div>
          </Disclosure>
        )}
      </Head>

      {p.state === 'handed over' && (
        <Section title="After the press">
          <Card>
            <Row
              icon="agent"
              text={thing ? 'One line is enough. The team reads it and writes the rest: done means, and a plan.' : small ? 'The governance team reads your line, writes one or two “done means” lines from it, and gives from its set.' : 'The governance team reads the brief, writes the charter, and gives from its set.'}
            />
            <Row icon="arrow" text="Within a minute this page shows what it was given, and the first task starts." />
          </Card>
          <MockControl action={<Button onClick={() => press(pressed.aMinuteLater(name))}>A minute later</Button>}>
            Nothing is behind the mock, so a minute does not pass by itself.
          </MockControl>
        </Section>
      )}

      {(toLand || p.pull?.state === 'landed') && p.pull && (
        <Section title={toLand ? 'Work to land' : 'Landed'}>
          <Card>
            <Row
              icon={toLand ? 'arrow' : 'check'}
              label={toLand ? <span>{p.person}’s project</span> : undefined}
              text={toLand ? (can('land') ? 'Done. Checked by Hyperbase, and by the checker.' : 'Done and checked. An owner lands it.') : `Landed on main, by ${PERSON}.`}
              caption={`Pull request ${p.pull.number} · ${p.pull.title} · ${p.pull.change}${toLand && !can('land') ? ' · Nothing waits for you here: it is not counted on your tab. When it lands, your Today says so.' : ''}`}
              end={toLand && land && can('land') && <Button variant="primary" icon="fingerprint" onClick={() => press(pressed.settle(land, 'landed'))}>Land · a touch</Button>}
            />
          </Card>
        </Section>
      )}

      {thing && (toAccept || p.state === 'done') && (
        <Section title={toAccept ? 'A thing to accept' : 'Accepted'} note={toAccept ? 'In a space, “Accept” takes the place of “Land”. Nothing lands on No Origins’ own code, so no touch is asked.' : undefined}>
          <Card>
            <Row
              icon={toAccept ? 'comp' : 'check'}
              text={toAccept ? 'Built, and checked against its shape. It waits for your yes.' : did.things[p.thing ?? ''] === 'shared' || p.thread.some(l => l.text.startsWith('shared it')) ? 'Accepted, and shared: it is a meron now, open to read.' : 'Accepted. It is on your canvas.'}
              end={
                <>
                  <Button href="/space">Look, on your canvas</Button>
                  {toAccept && can('accept') && <Button variant="primary" onClick={() => press(pressed.thing(p.thing!, 'accepted', name))}>Accept</Button>}
                  {toAccept && can('accept') && <Button onClick={() => press(pressed.thing(p.thing!, 'sent back', name))}>Send back</Button>}
                </>
              }
            />
          </Card>
        </Section>
      )}

      <Section
        title="Done means"
        count={p.doneMeans.length ? `${done} of ${p.doneMeans.length}` : undefined}
        note={p.doneMeans.length
          ? `${p.doneMeans.some(l => l.wrote) ? `Written by ${p.doneMeans.find(l => l.wrote)!.wrote}${small ? ' from your line' : ' again, for the new goal'}, before the work. You change them with a comment. ` : 'Written before the work. '}Ticked by a program or the checker, never by the doer. Every number on this page is counted from the records.`
          : undefined}
      >
        {p.doneMeans.length === 0 ? (
          <p className="eio-type-style-body">
            {small ? 'None yet. The governance team writes one or two lines from your line, before the work starts. Done is still checked by someone else.' : 'None yet.'}
          </p>
        ) : (
          <Card>
            <Meter part={done} of={p.doneMeans.length} words={`${done} of ${plural(p.doneMeans.length, 'line')} ticked`} />
            <ul className={styles.ticks}>
              {p.doneMeans.map(l => (
                <Tick key={l.text} state={l.done ? 'done' : 'to do'}>
                  <span>{l.text}</span>
                  <span className={cx(styles.muted, 'eio-type-style-caption')}>{l.done ? `done · ticked by ${l.by}` : 'to do'}</span>
                </Tick>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Section title="The plan" count={plural(p.plan.length, 'task')} note={d.regoal ? 'Written again for the new goal. Finished tasks stay finished.' : undefined}>
        {p.plan.length ? (
          <Card>
            <ul className={styles.ticks}>
              {p.plan.map(t => (
                <Tick key={t.n} state={t.state}>
                  <span>{t.n} · {t.name}</span>
                  <span className={cx(styles.muted, 'eio-type-style-caption')}>
                    {[t.state === 'working' ? 'now' : t.state, t.who, t.state === 'parked' ? whyParked(t.note, can('steer')) : t.note].filter(Boolean).join(' · ')}
                    {t.run && <> · <Link className={styles.inlineLink} href={`/runs/${t.run}`}>run {t.run}</Link></>}
                  </span>
                </Tick>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="eio-type-style-body">No plan yet. The lead writes it when the first task starts.</p>
        )}
        {due && toDo && (
          <MockControl action={<Button onClick={() => press(pressed.startNext(p, toDo))}>A minute later</Button>}>
            No run is going. Task {toDo.n} starts within a minute. Nothing is behind the mock, so a minute does not pass by itself.
          </MockControl>
        )}
      </Section>

      <Section title="The thread" note="Everything said in the project. Agents’ words are content. Only the words of people who may steer are orders. A hand-back is what a run reports when it ends; a helper hands back to the run that made it.">
        {p.talk && p.talk.length > 0 && (
          <Disclosure summary={`The talk it was handed over with · ${plural(p.talk.length, 'line')}`}>
            <div className={styles.talk}>
              {p.talk.map((s, i) => (
                <div key={i} className={cx(styles.bubble, s.you && styles.bubbleYou)}>
                  <span className={cx(styles.muted, 'eio-type-style-label')}>{s.from}</span>
                  <span className="eio-type-style-body">{s.text}</span>
                </div>
              ))}
            </div>
          </Disclosure>
        )}
        {p.thread.length ? (
          <ul className={styles.thread}>{p.thread.map((l, i) => <Said key={i} l={l} yours={can('steer')} />)}</ul>
        ) : (
          <p className="eio-type-style-body">Nothing is said yet.</p>
        )}
        {pending && (
          <MockControl action={<Button onClick={() => press(pressed.answerComments(name, p.title))}>Show the answer</Button>}>
            A comment is answered at the lead’s next step, or, with no run going, by the governance team within a minute. Nothing is behind the mock, so neither happens by itself.
          </MockControl>
        )}
        {live && can('steer') && panel !== 'comment-thread' && <div className={styles.buttons}><Button onClick={() => open('comment-thread')}>Comment</Button></div>}
        {panel === 'comment-thread' && commentForm}
      </Section>

      <Section title="Computers" count={p.computers.length}>
        {p.computers.length ? (
          <div className={styles.computers}>
            {p.computers.map(c => {
              const task = p.plan.find(t => t.run === c.run)
              return <ComputerBox key={`${c.name}-${c.run ?? ''}`} c={c} inside={c.run ? inside[c.run] : undefined} link parked={task?.state === 'parked'} />
            })}
          </div>
        ) : (
          <p className="eio-type-style-body">None now. A computer is opened for a piece of work, and cleared when the work ends.</p>
        )}
      </Section>

      <Section title="Given, and spent" end={thing ? undefined : <GovLink>The set, in Governance</GovLink>}>
        <Card>
          {p.given.length ? p.given.map(g => (
            <Row
              key={g.id}
              icon="key"
              label={<span>from {g.from}{g.once ? ', once' : ''}</span>}
              text={[...g.what, g.days ? plural(g.days, 'day') : undefined].filter(Boolean).join(' · ')}
              caption={g.once && g.times ? `given ${plural(g.times, 'time')} · one press each time, for this project only: it ends with the project` : undefined}
              end={!g.once && live && !paused && can('steer') && <Button onClick={() => press(pressed.endGiving(name))}>End</Button>}
            />
          )) : (
            <Row
              icon="key"
              text={p.state === 'handed over' ? (thing ? 'Nothing yet.' : 'Nothing yet. The governance team gives from its set.') : d.ended ? `Nothing is given now: it was ended by ${PERSON}. The project has no copy of the code and no branch. “Go on” asks the governance team for them again.` : 'Nothing is given now.'}
            />
          )}
          <div className={styles.row}>
            <div className={cx(styles.facts, styles.grow)}>
              <Meter part={p.spent} of={p.cap} words={`${dollars(p.spent)} of ${dollars(p.cap)}`} near={p.spent / p.cap > 0.8} />
              <Meter part={p.days - p.daysLeft} of={p.days} words={`${plural(p.daysLeft, 'day')} left of ${p.days}`} near={p.daysLeft <= 2 && live} />
            </div>
          </div>
        </Card>
      </Section>
    </>
  )
}
