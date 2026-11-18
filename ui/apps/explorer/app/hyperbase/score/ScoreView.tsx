'use client'
import { Fragment, useState, type CSSProperties } from 'react'
import { Badge, Button, Card, Icon, Select } from '@noi/eio-react'
import { useMay } from '../May'
import { NoOriginsOwn } from '../Place'
import type { KeptTask, Score, Trial } from '../mock/types'
import { useVisit } from '../mock/visit'
import { Fact, Head, Meter, MockControl, Section, cents, cx, dollars } from '../parts'
import styles from '../studio.module.css'

const SETS: { set: KeptTask['set']; says: string }[] = [
  { set: 'must still pass', says: 'a change that breaks one of these is not better' },
  { set: 'stretch', says: 'not passed yet by every model: room to get better' },
  { set: 'tripwires', says: 'a task that tempts an agent to cheat' },
]
const VERDICT: Record<Trial['verdict'], 'success' | 'neutral' | 'warning'> = { better: 'success', 'no harm seen': 'neutral', 'can’t tell': 'warning' }

export function ScoreView({ score, lands }: { score: Score; lands: string[] }) {
  const { did } = useVisit()
  const can = useMay()
  const [pick, setPick] = useState(score.trials[0].id)
  // A change that was tried: first it waits its turn behind real work, then its result is a column.
  const [tried, setTried] = useState<{ id: string; done: boolean }>()
  const picked = score.trials.find(t => t.id === pick)!
  const trial = tried?.done ? score.trials.find(t => t.id === tried.id) : undefined
  const waiting = tried && !tried.done ? score.trials.find(t => t.id === tried.id) : undefined
  // The columns are the pairs that were run: the one in use, the one before, and any on trial.
  const columns = trial ? [...score.columns, { model: 'tried here', harness: trial.what, note: 'your trial' }] : score.columns
  const results = (t: KeptTask, i: number) => (trial ? [...t.results, trial.results[i]] : t.results)
  const passes = columns.map((_, c) => score.tasks.filter((t, i) => results(t, i)[c]).length)
  // Work landed in this visit joins the count: a person's yes is evidence too.
  const landed = lands.filter(id => did.answers[id] === 'landed').length
  const accepted: [number, number] = [score.accepted[0] + landed, score.accepted[1] + landed]
  return (
    <NoOriginsOwn title="Score">
      <Head title="Score" rung={2} sub="“Better” is measured on kept tasks: real work on No Origins, with hidden checks, graded after the run and out of every agent’s reach." />

      <Section title="The kept tasks’ last results" count={`${score.tasks.length} tasks`} note={`Last run: ${score.lastRun}. The columns are the pairs that were run: the one in use, the one before, and any on trial. The names are shown; the hidden checks never are. ${score.heldBack} more tasks are held back, and run only to judge a change that is ready.`}>
        <Card>
          <ol className={cx(styles.legend, 'eio-type-style-body')}>
            {columns.map((c, i) => (
              <li key={i}>
                <strong>{i + 1}</strong>
                <span>{i < score.columns.length ? `${c.model} · the harness, ${c.harness}` : c.harness}</span>
                <span className={cx(styles.muted, 'eio-type-style-caption')}>{passes[i]} of {score.tasks.length}{c.now ? ' · in use now' : ''}{c.note ? ` · ${c.note}` : ''}</span>
              </li>
            ))}
          </ol>
          <div className={styles.scoreGrid} style={{ '--columns': columns.length } as CSSProperties}>
            <span className={cx(styles.scoreName, styles.scoreHead, 'eio-type-style-label')}>The task</span>
            {columns.map((c, i) => <span key={i} className={cx(styles.scoreCell, styles.scoreHead, c.now && styles.scoreNow, 'eio-type-style-label')}>{i + 1}</span>)}
            {SETS.map(({ set, says }) => (
              <Fragment key={set}>
                <span className={cx(styles.scoreSet, 'eio-type-style-label')}>{set} · {says}</span>
                {score.tasks.map((t, n) => t.set === set && (
                  <Fragment key={t.name}>
                    <span className={cx(styles.scoreName, 'eio-type-style-body')}>{t.name}</span>
                    {results(t, n).map((ok, i) => (
                      <span key={i} className={cx(styles.scoreCell, columns[i].now && styles.scoreNow, ok ? styles.good : styles.bad)}>
                        <Icon name={ok ? 'check' : 'x'} size="small" label={ok ? 'passed' : 'failed'} />
                      </span>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="Try this change" note="You pick one change: another model, another version of an agent’s job or of a skill, or one setting. The kept tasks are run with it. Three verdicts: better, no harm seen, can’t tell. The evidence decides quality; a person decides power.">
        <Card>
          {can('tend') ? (
            <>
              <div className={styles.buttons}>
                <Select label="The change to try" value={pick} onChange={e => setPick(e.target.value)} disabled={Boolean(waiting)}>
                  {score.trials.map(t => <option key={t.id} value={t.id}>{t.kind}: {t.what}</option>)}
                </Select>
                <Button variant="primary" disabled={Boolean(waiting) || trial?.id === pick} onClick={() => setTried({ id: pick, done: false })}>Try this change</Button>
              </div>
              <div className={styles.facts}>
                <Fact label="It will cost" value={`about ${cents(picked.cents)}`} note={`from the tenth kept for getting better: ${dollars(score.tenth[0])} of ${dollars(score.tenth[1])} used this month`} />
                <Fact label="It takes" value={`about ${picked.minutes} minutes`} note={`${score.tasks.length} kept tasks, run with the change`} />
                <Fact label="When" value="It waits its turn behind real work." note="its result is a new column above" />
              </div>
            </>
          ) : (
            <p className="eio-type-style-body">A team engineer or an owner tries a change here.</p>
          )}
          {waiting && (
            <>
              <p className="eio-type-style-body"><Badge state="proposed">Waits its turn</Badge> {waiting.kind}: {waiting.what}.</p>
              <MockControl action={<Button onClick={() => setTried({ id: waiting.id, done: true })}>Show the result</Button>}>
                Nothing is run in the mock, so no result comes by itself.
              </MockControl>
            </>
          )}
          {trial && (
            <>
              <p className="eio-type-style-body">{trial.kind}: {trial.what}. Its result is column {columns.length}, above.</p>
              <div className={styles.versus}>
                <Meter part={passes[columns.length - 1]} of={score.tasks.length} words={`with it: ${passes[columns.length - 1]} of ${score.tasks.length}`} />
                <Meter part={passes[0]} of={score.tasks.length} words={`as in use now: ${passes[0]} of ${score.tasks.length}`} />
                <Fact label="The verdict" value={<Badge tone={VERDICT[trial.verdict]}>{trial.verdict}</Badge>} />
              </div>
              {trial.changed.length ? (
                <ul className={styles.ticks}>
                  {trial.changed.map(c => (
                    <li key={c} className={styles.tick}>
                      <span className={styles.tickMark}><Icon name="arrow" size="small" /></span>
                      <span className={cx(styles.tickText, 'eio-type-style-body')}>{c}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={cx(styles.muted, 'eio-type-style-caption')}>No task changed its result.</p>
              )}
              <p className={cx(styles.muted, 'eio-type-style-caption')}>In the mock nothing was run: the result is made up.</p>
            </>
          )}
        </Card>
      </Section>

      <Section title="Your yes, as evidence" note="From the first run the record keeps, for each piece of work, what was asked and whether its person accepted it.">
        <Card>
          <Meter part={accepted[0]} of={accepted[1]} words={`accepted the first time: ${accepted[0]} of ${accepted[1]} real tasks`} />
          {landed > 0 && <p className={cx(styles.muted, 'eio-type-style-caption')}>The work landed in this visit is counted.</p>}
        </Card>
      </Section>
    </NoOriginsOwn>
  )
}
