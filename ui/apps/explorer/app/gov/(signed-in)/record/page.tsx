// gov.no-origins.localhost:3000/record (agreed 9 Nov, step 5): everything Governance did and
// refused, newest first, each entry in words with its number, for owners. Governance no longer
// records an allowed read (agreed the same day, finding I), and the reads recorded before stay out
// of this page. Views: everything, changes, sign-ins, refused; one person's part; 50 at a time.
import { Card, Tab, Tabs } from '@noi/eio-react'
import { recordWords, when } from '../../../../lib/changes'
import { recordPage, roleNames, type RecordQuery } from '../../../../lib/governance'
import { origins } from '../../../../lib/where'
import { Line } from '../../Line'
import { cx } from '../../../merons/parts'
import styles from '../../gov.module.css'
import merons from '../../../merons/merons.module.css'

export const metadata = { title: 'The record · Governance' }

const VIEWS: [NonNullable<RecordQuery['show']>, string][] = [
  ['everything', 'Everything'],
  ['changes', 'Changes'],
  ['sign-ins', 'Sign-ins'],
  ['refused', 'Refused'],
]

export default async function Record({ searchParams }: { searchParams: Promise<{ show?: string; who?: string; before?: string }> }) {
  const q = await searchParams
  const show = VIEWS.find(([v]) => v === q.show)?.[0] ?? 'everything'
  const who = q.who?.trim() || undefined
  const before = Number(q.before) > 0 ? Number(q.before) : undefined
  // Role names from Governance, which keeps them (step 3); the record reads without them.
  const [at, page, known] = await Promise.all([origins(), recordPage({ show, who, before }), roleNames()])
  const roles = Object.fromEntries(known.map(r => [r.id, r.name]))
  const link = (o: { show?: string; who?: string; before?: number }) => {
    const p = new URLSearchParams()
    if (o.show && o.show !== 'everything') p.set('show', o.show)
    if (o.who) p.set('who', o.who)
    if (o.before) p.set('before', String(o.before))
    const query = p.toString()
    return `${at.gov}/record${query ? `?${query}` : ''}`
  }
  const chip = cx(merons.chip, 'eio-type-style-label')
  return (
    <article className={cx(merons.view, styles.reading)}>
      <div className={styles.head}>
        <p className={cx(styles.muted, 'eio-type-style-label')}>Governance</p>
        <h1 className="eio-type-style-title">{who ? `The record: @${who}` : 'The record'}</h1>
        <p className={cx(styles.muted, 'eio-type-style-body')}>
          Everything Governance did and refused, newest first: every change, sign-in, Touch ID and refusal. Reading isn’t recorded. Nothing here can be changed or removed.
        </p>
      </div>
      {!page.ok ? (
        <p className={cx(styles.muted, 'eio-type-style-body')}>{page.error}. Only owners see the record.</p>
      ) : (
        <>
          <Tabs label="Show">
            {VIEWS.map(([v, name]) => <Tab key={v} href={link({ show: v, who })} selected={v === show}>{name}</Tab>)}
          </Tabs>
          {(who || before) && (
            <div className={styles.actions}>
              {who && <a className={chip} href={link({ show })}>Everyone’s</a>}
              {before && <a className={chip} href={link({ show, who })}>Newest</a>}
            </div>
          )}
          {page.data.entries.length ? (
            <Card>
              {page.data.entries.map(e => {
                const { text, why } = recordWords(e, roles)
                return (
                  <Line
                    key={e.seq}
                    name={e.allowed ? undefined : 'Refused'}
                    text={text}
                    caption={`#${e.seq} · ${when(e.at)}${why ? ` · ${why}` : ''}`}
                  />
                )
              })}
            </Card>
          ) : (
            <p className="eio-type-style-body">Nothing here{before ? ' before that' : ''}.</p>
          )}
          {page.data.next && (
            <div className={styles.actions}>
              <a className={chip} href={link({ show, who, before: page.data.next })}>Older</a>
            </div>
          )}
        </>
      )}
    </article>
  )
}
