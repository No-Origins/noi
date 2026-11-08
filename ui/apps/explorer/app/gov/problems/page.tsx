// Problems (agreed 8 Nov): every failure Mero and Governance kept, newest first, for owners. Each
// shows what went wrong and the request it was, so the log lines can be found by its ID. Nothing
// here leaves NOI.
import { governanceProblems } from '../../../lib/governance'
import { meroProblems, type Problem } from '../../../lib/mero'
import { cx, Header, Section } from '../../merons/parts'
import styles from '../../merons/merons.module.css'

export const metadata = { title: 'Problems · Governance' }

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export default async function Problems() {
  const [mero, gov] = await Promise.all([meroProblems(), governanceProblems()])
  const all: (Problem & { server: string })[] = [
    ...(mero.ok ? mero.data.map(p => ({ ...p, server: 'Mero' })) : []),
    ...(gov.ok ? gov.data.map(p => ({ ...p, server: 'Governance' })) : []),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const refused = [!mero.ok && `Mero: ${mero.error}`, !gov.ok && `Governance: ${gov.error}`].filter(Boolean)
  return (
    <article className={styles.view}>
      <Header eyebrow="Governance" title="Problems" path="Failures Mero and Governance kept, newest first" />
      {refused.length > 0 && (
        <p className={cx(styles.muted, 'eio-type-style-body')}>{refused.join(' · ')}. Only owners see problems.</p>
      )}
      <Section title={all.length ? `${all.length} kept` : 'None kept'}>
        {all.length === 0 ? (
          <p className="eio-type-style-body">Nothing has failed. A failure shows here with what went wrong and its request ID.</p>
        ) : (
          <ul className={styles.checks}>
            {all.map(p => (
              <li key={`${p.server}-${p.seq}`} className={styles.check}>
                <span className="eio-type-style-body">
                  <strong>{p.server}</strong> · {when(p.at)} · {p.status} · <span className="eio-type-style-mono">{p.method} {p.path}</span>
                  <br />
                  {p.what}
                  <br />
                  <span className={cx(styles.muted, 'eio-type-style-caption')}>Request {p.request_id}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </article>
  )
}
