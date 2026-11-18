'use client'
import Link from 'next/link'
import { Badge, Button, Card } from '@noi/eio-react'
import { GovLink } from '../GovLink'
import { May, useMay } from '../May'
import { NoOriginsOwn } from '../Place'
import type { Order } from '../mock/types'
import { pressed, useVisit } from '../mock/visit'
import { Fact, Head, Section, cx } from '../parts'
import styles from '../studio.module.css'

function OrderCard({ o }: { o: Order }) {
  const { did, press } = useVisit()
  const can = useMay()
  const state = did.orders[o.name] ?? o.state
  const renewed = did.renewed[o.name]
  const mine = can('steer')
  return (
    <Card>
      <div className={styles.sectionHead}>
        <h3 className="eio-type-style-mono">{o.name}</h3>
        {state === 'on' && <Badge state="active">On</Badge>}
        {state === 'paused' && <Badge state="deprecated">Paused</Badge>}
        {state === 'ended' && <Badge state="deprecated">Ended</Badge>}
        {state === 'handed over' && <Badge state="proposed">Handed over</Badge>}
      </div>
      <p className="eio-type-style-body">{o.line}</p>
      <div className={styles.facts}>
        <Fact label="What starts it" value={o.starts} note={`in ${o.place}`} />
        <Fact label="Its next go" value={state === 'on' ? o.next : state === 'handed over' ? 'once the governance team has given from the narrower set' : 'none: it is not on'} />
        <Fact
          label="Its last result"
          value={o.last.run ? <Link className={styles.inlineLink} href={`/runs/${o.last.run}`}>run {o.last.run}</Link> : o.last.text}
          note={o.last.run ? o.last.text : undefined}
        />
        <Fact
          label="Renew it by"
          value={renewed ? `${o.renewBy}, and 30 days more` : o.renewBy}
          note={renewed ? `renewed by ${o.person}, with one press` : o.renewSoon ? <span className={styles.warn}>in 3 days: after that it starts nothing</span> : 'after that it starts nothing'}
        />
      </div>
      {mine && state !== 'ended' && state !== 'handed over' && (
        <div className={styles.buttons}>
          {state === 'on' ? <Button onClick={() => press(pressed.orderState(o.name, 'paused'))}>Pause</Button> : <Button onClick={() => press(pressed.orderState(o.name, 'on'))}>Go on</Button>}
          {!renewed && <Button onClick={() => press(pressed.renew(o.name))}>Renew</Button>}
          <Button onClick={() => press(pressed.orderState(o.name, 'ended'))}>End</Button>
          {!renewed && <span className={cx(styles.muted, 'eio-type-style-caption')}>Renewing is one press, signed in: it gives nothing new.</span>}
        </div>
      )}
    </Card>
  )
}

export function Orders({ orders }: { orders: Order[] }) {
  const { did } = useVisit()
  const all = [...did.madeOrders, ...orders]
  return (
    <NoOriginsOwn title="Standing orders">
      <Head
        title="Standing orders"
        rung={4}
        sub="Work that starts by itself. Each standing order says what starts it: a time, or something that happens. Each is handed over like a small project."
        end={<May verb="give"><Button href="/projects/new?kind=order" icon="plus">New standing order</Button></May>}
      />
      <Section
        title="Every standing order"
        count={all.length}
        end={<GovLink>The narrower set, in Governance</GovLink>}
        note="Nobody watches this work, so it is given from a narrower set, and each order has a date to renew it by. Each go of an order is a run, under Runs. Standing orders are not in the list of projects."
      >
        <div className={styles.stack}>{all.map(o => <OrderCard key={o.name} o={o} />)}</div>
      </Section>
    </NoOriginsOwn>
  )
}
