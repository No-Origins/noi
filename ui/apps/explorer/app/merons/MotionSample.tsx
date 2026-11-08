'use client'
// A dot that crosses its track at one Eidos duration on the standard curve, each time you press Play.
// With reduced motion on, the duration is 0 and the dot jumps.
import { useState, type CSSProperties } from 'react'
import { Button } from '@noi/eio-react'
import styles from './merons.module.css'

export function MotionSample({ duration }: { duration: string }) {
  const [across, setAcross] = useState(false)
  return (
    <div className={styles.motionSample}>
      <div className={styles.motionTrack}>
        <div className={styles.motionLane}>
          <div className={styles.motionMover} style={{ '--sample-duration': `var(${duration})` } as CSSProperties} data-across={across || undefined}>
            <i className={styles.motionDot} />
          </div>
        </div>
      </div>
      <Button icon="arrow" onClick={() => setAcross(a => !a)}>Play</Button>
    </div>
  )
}
