import type { SwatchSize } from '@noi/eio-tokens/components'
import styles from './Swatch.module.css'

// Each size Mero holds for Swatch (Component States, agreed 18 Nov).
const SIZE: Record<SwatchSize, string> = { small: styles.small, default: styles.default, large: styles.large }

export interface SwatchProps {
  /** One color to show, such as a palette color. */
  color?: string
  /** A role's two colors, shown side by side as light | dark. */
  light?: string
  dark?: string
  /** 16, 24 or 40 px. */
  size?: SwatchSize
  /** What the swatch shows, for screen readers. */
  label?: string
}

/** Shows a color as content. The one component whose color comes from data, not from a role. */
export function Swatch({ color, light, dark, size = 'default', label }: SwatchProps) {
  const background = color ?? `linear-gradient(90deg, ${light} 50%, ${dark} 50%)`
  return (
    <i
      className={[styles.swatch, SIZE[size]].join(' ')}
      style={{ background }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
