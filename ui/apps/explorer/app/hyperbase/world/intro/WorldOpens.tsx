'use client'
// THE WORLD OPENS WITH THE INTRO (23 Nov 2026). The user, asked whether the intro should open /world: "Yes, open
// /world". So the page shows the intro first (IntroView.tsx): the logo painted, its outline, the base, the platform
// built, the eye's move. When the eye has arrived where the world's own eye stands at the beginning of the
// platform, the world itself is opened behind the intro (../WorldView.tsx); and when the intro has run to its end
// and the world is open, the intro goes and the world is there. The intro's last picture lies on the world's
// first, tile for tile (checked on the screen), so what is seen is the land's markers, words and stages coming in.
//
// The world is opened only when the eye has arrived, and not before: two worlds drawn at once would slow the
// eye's move, and while the eye stands still nothing shows if a picture comes late.
//
// IT PLAYS EVERY TIME /world IS OPENED. The user, asked whether every time or only the first time in a tab:
// "everytime". So nothing is kept about having seen it.
//
// MY PICKS, not the user's word: that it is left out for whoever asked their device for less motion, and when the
// address says `?intro=off` (for checks and tools, which need the world at once); how long the intro waits for a
// world that is slow to open.
import { useEffect, useState } from 'react'
import { WorldView } from '../WorldView'
import { IntroView } from './IntroView'
import { TOTAL } from './intro'
import styles from './intro.module.css'

/** Where the opening is: not known yet (the address is not read); the intro plays; the eye has arrived, and the
 * world opens behind the intro; the intro goes; the world alone. */
type Opening = 'unknown' | 'intro' | 'arrived' | 'leaving' | 'world'

/** How long the world is given to draw its first pictures before the intro goes, once it says it is open. */
const SETTLES_IN = 150
/** How long the intro waits, after its end, for a world that has not opened: then it goes all the same, so
 * that what the world says (that this browser cannot draw it, for one) is seen. */
const WAITS_AT_MOST = 8000
/** Renderer setup or platform loading may never settle. Give the animation its full time plus loading room,
 * then show the world (including its own failure message) even if arrival or end never comes. */
const INTRO_WAITS_AT_MOST = TOTAL * 1000 + WAITS_AT_MOST
/** How long the intro takes to go, with room to spare: it fades in Eidos's own time (intro.module.css). */
const GONE_IN = 450

export function WorldOpens() {
  const [opening, setOpening] = useState<Opening>('unknown')
  const [ended, setEnded] = useState(false)
  const [open, setOpen] = useState(false)

  // the intro, unless the address or the device says not
  useEffect(() => {
    const left = new URLSearchParams(window.location.search).get('intro') === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setOpening(left ? 'world' : 'intro')
  }, [])

  const waitingForIntro = opening === 'intro' || (opening === 'arrived' && !ended)
  useEffect(() => {
    if (!waitingForIntro) return
    const wait = setTimeout(() => setOpening('world'), INTRO_WAITS_AT_MOST)
    return () => clearTimeout(wait)
  }, [waitingForIntro])

  // the intro has run to its end: it goes once the world is open and has drawn itself
  useEffect(() => {
    if (opening !== 'arrived' || !ended) return
    const wait = setTimeout(() => setOpening('leaving'), open ? SETTLES_IN : WAITS_AT_MOST)
    return () => clearTimeout(wait)
  }, [opening, ended, open])

  // and when it has gone, it is taken away
  useEffect(() => {
    if (opening !== 'leaving') return
    const gone = setTimeout(() => setOpening('world'), GONE_IN)
    return () => clearTimeout(gone)
  }, [opening])

  const world = opening === 'arrived' || opening === 'leaving' || opening === 'world'
  const intro = opening === 'intro' || opening === 'arrived' || opening === 'leaving'
  return (
    <>
      {world && <WorldView onOpen={() => setOpen(true)} />}
      {intro && <IntroView onArrived={() => setOpening(now => (now === 'intro' ? 'arrived' : now))} onEnded={() => setEnded(true)} onError={() => setOpening('world')} leaving={opening === 'leaving'} />}
      {opening === 'unknown' && <div className={styles.intro} data-theme="dark" />}
    </>
  )
}
