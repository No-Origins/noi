// Look inside a computer (agreed 12 Nov, decision 5): the files, the change so far, and what is
// running. Read only: nobody types into an agent's computer. A page an agent built is shown as a
// picture, taken by Hyperbase's own checks; it is never run inside Studio.
// Agreed 16 Nov: a parked computer shows its files and the change so far, from the saved copy.
// Nothing is started.
import type { CSSProperties } from 'react'
import { Badge, Icon } from '@noi/eio-react'
import type { Inside } from './mock/types'
import { cx } from './parts'
import styles from './studio.module.css'

export function LookInside({ inside, parked = false }: { inside: Inside; parked?: boolean }) {
  return (
    <div className={styles.inside}>
      <p className={cx(styles.muted, 'eio-type-style-caption')}>
        Read only. You look; you do not type into an agent’s computer. To change the work, take the task over.
        {parked ? ' This computer is saved and stopped: what you see is from the saved copy, and nothing is started.' : ''}
      </p>
      <div className={styles.two}>
        <div className={styles.tight}>
          <h3 className={cx(styles.muted, 'eio-type-style-label')}>The files</h3>
          <ul className={cx(styles.files, 'eio-type-style-mono')}>
            {inside.files.map(f => (
              <li key={`${f.depth}-${f.path}`} className={styles.file} style={{ '--depth': f.depth } as CSSProperties}>
                <Icon name={f.folder ? 'layers' : 'doc'} size="small" />
                <span>{f.path}</span>
                {f.changed && <Badge>changed</Badge>}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.tight}>
          <h3 className={cx(styles.muted, 'eio-type-style-label')}>What is running</h3>
          {parked ? (
            <p className="eio-type-style-body">Nothing. The computer is stopped while its run is parked.</p>
          ) : (
            <ul className={styles.ticks}>
              {inside.running.map(r => (
                <li key={r} className={cx(styles.tick, styles.tickNow)}>
                  <span className={styles.tickMark}><i className={styles.nowDot} aria-hidden /></span>
                  <span className={cx(styles.tickText, 'eio-type-style-body')}>{r}</span>
                </li>
              ))}
            </ul>
          )}
          {inside.picture && (
            <>
              <h3 className={cx(styles.muted, 'eio-type-style-label')}>A page it built, as a picture</h3>
              <div className={styles.picture} role="img" aria-label={`A picture of ${inside.picture.of}`}>
                <div className={styles.pictureBar}>
                  <i className={styles.pictureChip} />
                  <i className={styles.pictureChip} />
                  <i className={styles.pictureChip} />
                </div>
                {[0.9, 0.7, 0.8, 0.5].map((part, i) => <i key={i} className={styles.pictureLine} style={{ '--part': part } as CSSProperties} />)}
              </div>
              <p className={cx(styles.muted, 'eio-type-style-caption')}>
                {inside.picture.of}, taken at {inside.picture.taken}. The mock draws a stand-in. The page itself is never run inside Studio.
              </p>
            </>
          )}
        </div>
      </div>
      <div className={styles.tight}>
        <h3 className={cx(styles.muted, 'eio-type-style-label')}>The change so far</h3>
        <pre className={cx(styles.code, 'eio-type-style-mono')}>{inside.change}</pre>
      </div>
    </div>
  )
}
