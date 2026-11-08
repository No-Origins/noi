// A meron's small mark: its color, both theme colors of a role, a text sample in its own font,
// or an icon for its kind. Used in the tree and wherever a meron is linked.
import { Icon, Swatch } from '@noi/eio-react'
import type { Preview } from '../../lib/tree'
import styles from './merons.module.css'

export function PreviewMark({ preview }: { preview: Preview }) {
  switch (preview.kind) {
    case 'swatch': return <Swatch color={preview.color} />
    case 'role': return <Swatch light={preview.light} dark={preview.dark} />
    // A text sample is content: the font is the meron's own.
    case 'text': return <span className={styles.aa} style={{ fontFamily: `'${preview.font}'`, fontWeight: preview.weight }}>Aa</span>
    case 'icon': return <Icon name={preview.name} />
  }
}
