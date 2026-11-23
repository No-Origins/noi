'use client'
// THE WORDS ON THE LAND, DRAWN WITH A PART THE DESIGN SYSTEM ALREADY HAS (22 Nov 2026, issue 127). The user:
// "anything that you're adding, any element, you have to first check if it's existing in the design system. So
// I think the marker that you added, I think you can use the existing elements from our design system." And,
// asked whether the land's other words (the numbers along the edges, the upright markers' places, the place
// under the pointer) should use Eidos's parts too: "Yes, those too".
//
// So the name of each of the land's sides, the place of each upright marker and the place under the pointer are
// Eidos's Badge, its small pill for a plain fact, as it is. The picture keeps a spot over each place
// (drawLand.ts) and this draws the Badge into the spot. Nothing here can be pressed.
// MY PICK, not the user's word: the Badge plain, with no tone and no dot.
import { memo, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Badge } from '@noi/eio-react'
import type { WordSpot } from './drawLand'
import { pointerWords, type Land } from './land'

/** The place under the pointer, in words, as the land's data says it: drawn into the spot the picture keeps by
 * the pointer, and gone while the pointer is over no place. */
function PointerPlace({ land, spot }: { land: Land; spot: HTMLElement }) {
  const [words, setWords] = useState(() => pointerWords(land.state))
  useEffect(() => land.watch(now => setWords(pointerWords(now))), [land])
  return words === null ? null : createPortal(<Badge>{words}</Badge>, spot)
}

/** Every spot the picture keeps for words, each with its words drawn into it. */
export const LandWords = memo(function LandWords({ land, spots }: { land: Land; spots: readonly WordSpot[] }) {
  return spots.map(s => s.kind === 'pointerPlace'
    ? <PointerPlace key={s.id} land={land} spot={s.spot} />
    : createPortal(<Badge>{s.words}</Badge>, s.spot, s.id))
})
