import styles from './Swatch.module.css'

export interface SwatchProps {
  /** One color to show, such as a palette color. */
  color?: string
  /** A role's two colors, shown side by side as light | dark. */
  light?: string
  dark?: string
  /** 16, 24 or 40 px. */
  size?: 'small' | 'default' | 'large'
  /** What the swatch shows, for screen readers. */
  label?: string
}

/** Shows a color as content. The one component whose color comes from data, not from a role. */
export function Swatch({ color, light, dark, size = 'default', label }: SwatchProps) {
  const background = color ?? `linear-gradient(90deg, ${light} 50%, ${dark} 50%)`
  return (
    <i
      className={[styles.swatch, styles[size]].join(' ')}
      style={{ background }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
