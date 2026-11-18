'use client'
// A dot that crosses its track at one Eidos duration on the standard curve, each time you press Play.
// With reduced motion on, the duration is 0 and the dot jumps.
// A 3D world time (17 Nov) has no CSS variable, so it comes as seconds; reduced motion is asked of
// the browser instead, and makes it 0 as well.
import { useEffect, useState, type CSSProperties } from 'react'
import { Button } from '@noi/eio-react'
import styles from './merons.module.css'

export function MotionSample({ duration, seconds }: { duration?: string; seconds?: number }) {
  const [across, setAcross] = useState(false)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(q.matches)
    on()
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  const time = seconds !== undefined ? `${reduced ? 0 : seconds}s` : `var(${duration})`
  return (
    <div className={styles.motionSample}>
      <div className={styles.motionTrack}>
        <div className={styles.motionLane}>
          <div className={styles.motionMover} style={{ '--sample-duration': time } as CSSProperties} data-across={across || undefined}>
            <i className={styles.motionDot} />
          </div>
        </div>
      </div>
      <Button icon="arrow" onClick={() => setAcross(a => !a)}>Play</Button>
    </div>
  )
}
