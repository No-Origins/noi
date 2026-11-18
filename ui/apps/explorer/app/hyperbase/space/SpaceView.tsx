'use client'
import { useRouter } from 'next/navigation'
import { useState, type CSSProperties } from 'react'
import { Badge, Button, Card, Chip, Field, Icon, type IconName } from '@noi/eio-react'
import { MeroLink } from '../GovLink'
import { useMay } from '../May'
import { asWords, askedFor, thingNow } from '../mock/now'
import { PERSON } from '../mock/story'
import type { Space, Thing } from '../mock/types'
import { pressed, useVisit } from '../mock/visit'
import { Fact, Head, Row, Section, cx } from '../parts'
import styles from '../studio.module.css'

const WAYS: { way: Thing['way']; icon: IconName; says: string }[] = [
  { way: 'put together', icon: 'layers', says: 'From parts that exist. The thing is only a description: no new code. Checked against its shape at once.' },
  { way: 'a piece of its own', icon: 'comp', says: 'When no part can do it. The agents write that one piece. It runs closed in: no network, no other space, no sign-in.' },
  { way: 'a new part for everyone', icon: 'plus', says: 'When a part is missing that many would use. The team that looks after it builds it, as No Origins’ own work.' },
]
const dots = (n: number) => Array.from({ length: n }, (_, i) => <i key={i} />)

function Shape({ shape }: { shape: Thing['shape'] }) {
  if (shape === 'list') return <span className={cx(styles.thingShape, styles.shapeList)}>{dots(4)}</span>
  if (shape === 'keys') return <span className={cx(styles.thingShape, styles.shapeKeys)}>{dots(9)}</span>
  if (shape === 'grid') return <span className={cx(styles.thingShape, styles.shapeGrid)}>{dots(16)}</span>
  return <span className={styles.thingShape}><Icon name={shape === 'chair' ? 'fit' : 'plus'} size="large" /></span>
}
const STATE: Record<Thing['state'], { tone?: 'success' | 'warning'; dot?: 'active' | 'proposed' | 'deprecated'; words: string }> = {
  'being built': { dot: 'proposed', words: 'Being built' },
  built: { tone: 'warning', words: 'Built: waits for your yes' },
  accepted: { tone: 'success', words: 'Accepted' },
  'sent back': { dot: 'deprecated', words: 'Sent back' },
  shared: { dot: 'active', words: 'Shared: a meron' },
}

export function SpaceView({ space }: { space: Space }) {
  const { did, press, role } = useVisit()
  const can = useMay()
  const router = useRouter()
  // The space's person is a fifth position (agreed 16 Nov): in their own space they ask, steer,
  // accept, send back and share. An owner has no buttons here, and looks in only with a touch.
  const mine = can('accept')
  const [ask, setAsk] = useState('')
  const things = [...space.things, ...did.asked].map(t => ({ ...t, state: thingNow(t, did) }))

  if (!mine && !(role === 'owner' && did.lookedIn)) {
    return (
      <>
        <Head title="Space" rung={8} sub={`This is ${PERSON}’s space. A space is seen by its person, and by those they let in.`} />
        {role === 'owner' ? (
          <Section title="An owner looks in only with a touch" note="Nobody looks in from above as a matter of course. An owner’s look is recorded, and the space’s person is shown it. The touch names this one look, and nothing after it.">
            <Card>
              <Row
                icon="eye"
                text={`Look into ${space.name}?`}
                caption="You will see it as it is, with no buttons: an owner asks for, accepts and shares nothing in someone else’s space."
                end={<Button variant="primary" icon="fingerprint" onClick={() => press(pressed.lookIn())}>Look in · a touch</Button>}
              />
            </Card>
          </Section>
        ) : (
          <p className="eio-type-style-body">As you are looking now, you are not let into this space.</p>
        )}
        <p className={cx(styles.muted, 'eio-type-style-caption')}>Choose “The space’s person” under “Looking as” to see the space as its person does.</p>
      </>
    )
  }

  const send = () => {
    const line = ask.trim() || 'a clock'
    const n = did.asked.length
    const taken = [...space.things, ...did.asked].map(t => t.project)
    const words = asWords(line.replace(/^(a|an|the) /i, ''), 3) || 'thing'
    const name = taken.includes(words) ? `${words}-${n + 2}` : words
    const id = `asked-${n}`
    const thing: Thing = { id, name: line, way: 'put together', madeOf: 'the agents look for parts that exist first', state: 'being built', at: [0.86 - n * 0.12, 0.2 + n * 0.14, 0.3], shape: 'blank', project: name }
    press(pressed.ask(thing, askedFor(line, name, id)))
    setAsk('')
    router.push(`/projects/${name}`)
  }
  return (
    <>
      <Head title="Space" rung={8} sub={mine ? 'A canvas of your own. Whatever you ask for is built here, from No Origins’ parts, and attached here.' : `${space.name}, as an owner sees it after a touch: no buttons.`}>
        {!mine && <p className="eio-type-style-body"><Badge tone="warning">Looked in</Badge> Your look is recorded, and {PERSON} is shown it.</p>}
        <div className={styles.facts}>
          <Fact label="Its place" value={<span className="eio-type-style-mono">{space.place}</span>} note="a role inside a space reaches that space only" />
          <Fact label="Who sees it" value={mine ? 'You, and those you let in.' : 'Its person, and those they let in.'} note="Nobody looks in from above as a matter of course. An owner can, with a touch: it is recorded, and its person is shown it." />
          <Fact label="Its plan" value={space.plan} note={mine ? 'in your space, you are the one who is asked' : 'in a space, its person is the one who is asked'} />
        </div>
      </Head>

      <Section title="The canvas" count={`${things.length} things`} note="A stand-in. A place on the canvas has three dimensions: what is further away is drawn smaller. How the canvas is drawn, and how you move in it, is decided at rung 8, when it is tried on you.">
        <div className={styles.canvas} role="img" aria-label={`A canvas with ${things.map(t => t.name).join(', ')}`}>
          {things.map(t => (
            <div key={t.id} className={cx(styles.thing, t.state === 'being built' && styles.thingBuilding, t.state === 'shared' && styles.thingShared)} style={{ '--x': t.at[0], '--y': t.at[1], '--z': t.at[2] } as CSSProperties}>
              <Shape shape={t.shape} />
              <span className="eio-type-style-caption">{t.name}</span>
            </div>
          ))}
        </div>
        {mine && (
          <>
            <div className={styles.sayRow}>
              <Field label="Ask for a thing" placeholder="Ask for a thing: a clock" value={ask} onChange={e => setAsk(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} />
              <Button variant="primary" onClick={send}>Ask</Button>
            </div>
            <p className={cx(styles.muted, 'eio-type-style-caption')}>
              Asking for a thing makes a small project, and its place is your space. One line is enough, and the team writes the rest. So it shows on Today, Projects and Runs, and nothing is built twice.
            </p>
          </>
        )}
      </Section>

      <Section title="What is in it" note="A thing is yours until you share it. Shared, it becomes a meron: open to read, with versions, for anyone to put on their own canvas or build from. A thing made of No Origins’ parts is drawn by the app itself, from its description, so it is live. A piece of its own runs closed in. “Accept” takes the place of “Land”: nothing lands on No Origins’ own code, so no touch is asked.">
        <Card>
          {things.map(t => {
            const s = STATE[t.state]
            const way = WAYS.find(w => w.way === t.way)
            return (
              <Row
                key={t.id}
                icon={way?.icon}
                label={<span>{t.way}</span>}
                text={t.name}
                caption={t.madeOf}
                end={
                  <>
                    <Badge tone={s.tone} state={s.dot}>{mine ? s.words : s.words.replace('your', 'its person’s')}</Badge>
                    {mine && t.project && <Chip href={`/projects/${t.project}`}>Its project</Chip>}
                    {mine && t.state === 'built' && <Button variant="primary" onClick={() => press(pressed.thing(t.id, 'accepted', t.project))}>Accept</Button>}
                    {mine && t.state === 'built' && <Button onClick={() => press(pressed.thing(t.id, 'sent back', t.project))}>Send back</Button>}
                    {mine && t.state === 'accepted' && <Button onClick={() => press(pressed.thing(t.id, 'shared', t.project))}>Share</Button>}
                    {t.state === 'shared' && <MeroLink />}
                  </>
                }
              />
            )
          })}
        </Card>
      </Section>

      <Section title="Three ways a thing gets built">
        <div className={styles.ways}>
          {WAYS.map((w, i) => (
            <Card key={w.way} inset="tight">
              <div className={styles.way}>
                <span className={cx(styles.rowLabel, 'eio-type-style-label')}><Icon name={w.icon} size="small" />{i + 1} · {w.way}</span>
                <span className="eio-type-style-body">{w.says}</span>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </>
  )
}
