import styles from './topbar.module.css'

/** How many merons Mero holds now, with the live dot; "Live ·" only where two panes fit. */
export function Live({ count }: { count: number }) {
  return (
    <span className={[styles.live, 'eio-type-style-label'].join(' ')}>
      <i className={styles.dot} aria-hidden />
      <span className={styles.wide}>Live · </span>
      {count} merons
    </span>
  )
}
