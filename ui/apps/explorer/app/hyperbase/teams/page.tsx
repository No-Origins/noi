// hyperbase.<base>/teams · the standing teams (agreed 10–12 Nov). It arrives with rung 5.
import Link from 'next/link'
import { Badge } from '@noi/eio-react'
import { NoOriginsOwn } from '../Place'
import { teams } from '../mock/read'
import { Head, Section, cx, plural } from '../parts'
import styles from '../studio.module.css'

export const metadata = { title: 'Teams' }

export default async function TeamsPage() {
  const all = await teams()
  return (
    <NoOriginsOwn title="Teams">
      <Head title="Teams" rung={5} sub="Standing teams, each with a field. A team is switched on by its evidence, one at a time." />
      <Section title="Every team" count={all.length} note="A team’s definition, its saved agents and its skills are merons, in Mero. Its role and its set are on Governance’s pages.">
        <div className={styles.list}>
          {all.map(t => (
            <Link key={t.name} href={`/teams/${t.name}`} className={styles.linkRow}>
              <div className={styles.rowText}>
                <span className={cx(styles.rowLabel, 'eio-type-style-label')}>
                  <span className="eio-type-style-mono">{t.name}</span>
                  <span>· sponsor {t.sponsor}</span>
                </span>
                <span className="eio-type-style-body">{t.field}</span>
                <span className={cx(styles.muted, 'eio-type-style-caption')}>
                  {plural(t.agents, 'saved agent')} · {plural(t.skills, 'skill')} · {plural(t.notes, 'note')} · {t.stateNote}
                </span>
              </div>
              <div className={styles.rowFacts}>
                {t.state === 'on' ? <Badge state="active">On</Badge> : <Badge state="proposed">In the shadow</Badge>}
                {t.waiting > 0 && <Badge tone="warning">{t.waiting} wait for its engineer</Badge>}
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </NoOriginsOwn>
  )
}
