'use client'
// AN ELEMENT OF THE 3D WORLD ON ITS PAGE IN MERO (23 Nov 2026). Till the first world left Eidos, each of its
// elements was drawn on its component's page; the new world's are again: the gallery's own 3D view of the element
// alone (../hyperbase/world/gallery/ElementView.tsx), in the state it starts in, to be turned round by hand. The
// element is @noi/eio-3d's, found by the last part of its meron's path.
import { elementById } from '@noi/eio-3d'
import { ElementView } from '../hyperbase/world/gallery/ElementView'
import styles from './merons.module.css'

/** The element of this id, in 3D; nothing for an id that is no element (a character, the shared drawing). */
export function ElementOnPage({ id }: { id: string }) {
  const element = elementById(id)
  return element ? <div className={styles.element3d}><ElementView element={element} /></div> : null
}
