'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button, Card, Choices, Field, Icon, Radio, Select, TextArea } from '@noi/eio-react'
import { useMay } from '../../May'
import { handedOver, nameOf } from '../../mock/now'
import { PERSON } from '../../mock/story'
import type { Brief, Draft, Order, TalkLine } from '../../mock/types'
import { nextNumber, pressed, useVisit } from '../../mock/visit'
import { Head, Meter, Row, Section, cents, cx } from '../../parts'
import styles from '../../studio.module.css'

type Kind = 'project' | 'task' | 'order'
interface Talk { you: string; replies: { from: string; text: string }[]; fills: Partial<Brief> }
const EMPTY: Brief = { why: '', inOut: '', doneMeans: '', where: '', forWhom: 'you' }
const LINES: { key: 'why' | 'inOut' | 'doneMeans' | 'where'; name: string; hint: string; rows: number }[] = [
  { key: 'why', name: 'Why', hint: 'What you want, and what for.', rows: 2 },
  { key: 'inOut', name: 'In, and out', hint: 'What is in, and what is left out.', rows: 2 },
  { key: 'doneMeans', name: 'Done means', hint: 'One line each: a test, or a look at a named page.', rows: 5 },
  { key: 'where', name: 'Where', hint: 'The code, or the place in Mero, that it touches.', rows: 2 },
]
/** A talk has a small cap of its own: 25¢ to start (agreed 16 Nov). The mock counts 3¢ a turn. */
const TALK_CAP = 25
const A_TURN = 3

export function HandOver({ talk, places, starts, renew, first, turns = 0, draftId, draft }: { talk: Talk[]; places: string[]; starts: { time: string[]; event: string[] }; renew: string[]; first: Kind; turns?: number; draftId?: string; draft?: Draft }) {
  const { did, press, role } = useVisit()
  const can = useMay()
  const router = useRouter()
  const [kind, setKind] = useState<Kind>(first)
  // A draft opened with "Go on": the one kept in this visit, or the story's.
  const [from] = useState<Draft | undefined>(() => (draftId ? did.drafts.find(d => d.id === draftId) ?? draft : undefined))
  const [id] = useState(() => from?.id ?? `draft-${nextNumber(did)}-${did.drafts.length + 1}`)
  // A project: the talk, and the brief it fills.
  const had = talk.slice(0, turns)
  const [brief, setBrief] = useState<Brief>(() => from?.brief ?? had.reduce((b, t) => ({ ...b, ...t.fills }), EMPTY))
  const [said, setSaid] = useState<TalkLine[]>(() => from?.said ?? had.flatMap(t => [{ from: 'you', text: t.you, you: true }, ...t.replies]))
  const [turn, setTurn] = useState(from?.turn ?? turns)
  const [say, setSay] = useState('')
  // The words of its name: its person can change them before the press, and not after.
  const [words, setWords] = useState(from?.words ?? '')
  const [changed, setChanged] = useState(false)
  const handed = useRef(false)
  // A lone task, or a standing order: one line, and a place.
  const [line, setLine] = useState('')
  const [place, setPlace] = useState(places[0])
  const [by, setBy] = useState<'time' | 'event'>('time')
  const [when, setWhen] = useState(starts.time[0])
  const [until, setUntil] = useState(renew[0])

  // A brief that is not handed over is kept as a draft, for its person only, with its talk.
  const written = kind === 'project' && Boolean(brief.why.trim() || brief.inOut.trim() || brief.doneMeans.trim() || brief.where.trim() || said.length)
  useEffect(() => {
    if (changed && written && !handed.current) press(pressed.draft({ id, brief, said, turn, words: words || undefined, kept: 'kept a moment ago' }))
  }, [changed, written, id, brief, said, turn, words, press])

  if (!can('give')) {
    return (
      <>
        <Head title="Hand work over" rung={3} sub="By talking, or by writing. Then one press." />
        <p className="eio-type-style-body">
          {role === 'person'
            ? 'In your space you ask for a thing, on Space. One line is enough, and the team writes the rest.'
            : 'A member or an owner hands work over. As you are looking now, there is nothing to press here.'}
        </p>
        {role === 'person' && <p><Button href="/space">Your space</Button></p>}
      </>
    )
  }

  const next = talk[turn]
  const speak = () => {
    if (!next) return
    setSaid([...said, { from: 'you', text: say.trim() || next.you, you: true }, ...next.replies])
    setBrief({ ...brief, ...next.fills })
    setTurn(turn + 1)
    setSay('')
    setChanged(true)
  }
  const number = nextNumber(did)
  const ready = kind === 'project' ? Boolean(brief.why.trim() && brief.doneMeans.trim()) : Boolean(line.trim())
  const named = nameOf(kind === 'project' ? brief.why : line, number, words)
  const spoken = said.filter(l => l.you).length
  const handOver = () => {
    handed.current = true
    if (kind === 'order') {
      const o: Order = {
        name: named.title, line: line.trim(), place, starts: by === 'time' ? when : `when ${when}`,
        next: 'none yet', last: { text: 'no go yet', ok: null }, renewBy: until.split(': ')[1] ?? until, state: 'handed over', person: PERSON,
      }
      press(pressed.order(o))
      router.push('/orders')
      return
    }
    const p = kind === 'project' ? handedOver(brief, 'project', number, words, said) : handedOver({ ...EMPTY, why: line.trim(), where: place }, 'lone task', number, words)
    press(pressed.handOver(p, kind === 'project' ? id : undefined))
    router.push(`/projects/${p.name}`)
  }

  return (
    <>
      <Head title="Hand work over" rung={3} sub="By talking, or by writing. Then one press." />

      <Choices legend="What do you hand over?" across>
        <Radio name="kind" checked={kind === 'project'} onChange={() => setKind('project')}>A project</Radio>
        <Radio name="kind" checked={kind === 'task'} onChange={() => setKind('task')}>A lone task</Radio>
        <Radio name="kind" checked={kind === 'order'} onChange={() => setKind('order')}>A standing order</Radio>
      </Choices>

      {kind === 'project' ? (
        <>
          <div className={styles.two}>
            <Section title="Talk it through, if you like" note="A shaper asks. A scout reads the code and Mero. A sceptic reads the brief cold. These three only read, under your own right to read. The talk starts when you type, and ends when you hand over or leave. It is kept with the draft, and then at the top of the project’s thread.">
              <Card>
                <div className={styles.talk}>
                  {said.length === 0 && <p className={cx(styles.muted, 'eio-type-style-body')}>Say what you want, in your own words. The brief fills in as you talk.</p>}
                  {said.map((s, i) => (
                    <div key={i} className={cx(styles.bubble, s.you && styles.bubbleYou)}>
                      <span className={cx(styles.muted, 'eio-type-style-label')}>{s.from}</span>
                      <span className="eio-type-style-body">{s.text}</span>
                    </div>
                  ))}
                </div>
                {next ? (
                  <div className={styles.sayRow}>
                    <Field label="Say something" placeholder={next.you} value={say} onChange={e => setSay(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') speak() }} />
                    <Button onClick={speak}>Say</Button>
                  </div>
                ) : (
                  <p className={cx(styles.muted, 'eio-type-style-caption')}>The mock’s script ends here. The talk itself goes on until you hand over, or leave. You can still change any line of the brief.</p>
                )}
                {next && <p className={cx(styles.muted, 'eio-type-style-caption')}>In the mock the talk is a script: leave the field empty and press Say, and the next line is said for you.</p>}
                <Meter part={spoken * A_TURN} of={TALK_CAP} words={`this talk: ${cents(spoken * A_TURN)} of ${cents(TALK_CAP)}, its own small cap. Its tokens count in the month’s cap.`} />
              </Card>
            </Section>

            <Section title="The brief" count="five lines" note="The governance team reads the brief to write the charter, so its lines are fixed. How you arrive at them is yours: write them yourself, or let the talk fill them.">
              <Card>
                {LINES.map(l => (
                  <div key={l.key} className={styles.briefLine}>
                    <span className={cx(styles.briefHead, 'eio-type-style-label')}>
                      {l.name}
                      {brief[l.key].trim() && <span className={styles.filled}><Icon name="check" size="small" label="filled in" /></span>}
                    </span>
                    <TextArea className={styles.fill} label={l.name} rows={l.rows} placeholder={l.hint} value={brief[l.key]} onChange={e => { setBrief({ ...brief, [l.key]: e.target.value }); setChanged(true) }} />
                  </div>
                ))}
                <div className={styles.briefLine}>
                  <span className={cx(styles.briefHead, 'eio-type-style-label')}>For</span>
                  <Select label="For whom" value={brief.forWhom} onChange={e => setBrief({ ...brief, forWhom: e.target.value })}>
                    <option value="you">you</option>
                  </Select>
                  <span className={cx(styles.muted, 'eio-type-style-caption')}>Whoever hands a project over is its person.</span>
                </div>
                {(brief.open || brief.size) && (
                  <div className={styles.tight}>
                    <span className={cx(styles.muted, 'eio-type-style-label')}>The shaper adds</span>
                    {brief.open && <span className="eio-type-style-body">An open question: {brief.open}</span>}
                    {brief.size && <span className="eio-type-style-body">A guess at the size: {brief.size}</span>}
                  </div>
                )}
              </Card>
            </Section>
          </div>
          {(from || (changed && written)) && (
            <p className={cx(styles.muted, 'eio-type-style-caption')}>
              Kept as a draft, for you only, with its talk. If you leave, it is at the top of <Link className={styles.inlineLink} href="/projects">Projects</Link>, with “Go on” and “Discard”.
            </p>
          )}
        </>
      ) : (
        <Section
          title={kind === 'task' ? 'A lone task' : 'A standing order'}
          count={kind === 'task' ? 'one line, and a place' : 'the same, and what starts it'}
          note={kind === 'order'
            ? 'A standing order works while nobody watches, so it is given from a narrower set, and stops starting work after its date unless you renew it.'
            : 'The governance team writes one or two “done means” lines from your line, before the work starts. You see them on the task’s page, and change them with a comment.'}
        >
          <Card>
            <div className={styles.briefLine}>
              <span className={cx(styles.briefHead, 'eio-type-style-label')}>The line</span>
              <Field label="The line" placeholder={kind === 'task' ? 'Fix the wrapped title on the Roles page.' : 'Run the app’s checks.'} value={line} onChange={e => setLine(e.target.value)} />
            </div>
            <div className={styles.briefLine}>
              <span className={cx(styles.briefHead, 'eio-type-style-label')}>The place</span>
              <Select label="The place" value={place} onChange={e => setPlace(e.target.value)}>
                {places.map(p => <option key={p}>{p}</option>)}
              </Select>
            </div>
            {kind === 'order' && (
              <>
                <Choices legend="What starts it" across>
                  <Radio name="by" checked={by === 'time'} onChange={() => { setBy('time'); setWhen(starts.time[0]) }}>A time</Radio>
                  <Radio name="by" checked={by === 'event'} onChange={() => { setBy('event'); setWhen(starts.event[0]) }}>Something that happens</Radio>
                  <Select label={by === 'time' ? 'Which time' : 'What happens'} value={when} onChange={e => setWhen(e.target.value)}>
                    {starts[by].map(s => <option key={s}>{s}</option>)}
                  </Select>
                </Choices>
                <div className={styles.briefLine}>
                  <span className={cx(styles.briefHead, 'eio-type-style-label')}>Renew it by</span>
                  <Select label="Renew it by" value={until} onChange={e => setUntil(e.target.value)}>
                    {renew.map(r => <option key={r}>{r}</option>)}
                  </Select>
                </div>
              </>
            )}
          </Card>
        </Section>
      )}

      <Section title="Then, one press">
        {ready && (
          <Card inset="tight">
            <div className={styles.briefLine}>
              <span className={cx(styles.briefHead, 'eio-type-style-label')}>The words of its name</span>
              <Field label="The words of its name" value={words || named.title} onChange={e => { setWords(e.target.value.toLowerCase().replace(/[^a-z0-9 -]+/g, '')); setChanged(true) }} />
              <span className={cx(styles.muted, 'eio-type-style-caption')}>
                It will be <span className="eio-type-style-mono">{kind === 'order' ? named.title : named.name}</span>. Hyperbase made the words from your first line{kind === 'order' ? '' : ', and adds its number'}. You can change the words now. Not after the press: the name is its place.
              </span>
            </div>
          </Card>
        )}
        <div className={styles.buttons}>
          <Button variant="primary" size="large" disabled={!ready} onClick={handOver}>Hand over</Button>
          <span className={cx(styles.muted, 'eio-type-style-body')}>One press. Signed in. No touch.</span>
        </div>
        {!ready && <p className={cx(styles.muted, 'eio-type-style-caption')}>{kind === 'project' ? 'A brief needs at least why, and done means.' : 'Write the line first.'}</p>}
        <Card>
          <Row
            icon="agent"
            label={<span>after the press</span>}
            text={kind === 'task' ? 'The governance team reads your line, writes one or two “done means” lines from it, and gives from its set.' : 'The governance team reads the brief, writes the charter, and gives from its set.'}
          />
          <Row icon="arrow" text={kind === 'order' ? 'The standing order is on Standing orders, with its next go.' : 'Within a minute the project’s page shows what it was given, and the first task starts.'} />
        </Card>
      </Section>
    </>
  )
}
