import Link from 'next/link'
import styles from './merons.module.css'

export default function NotFound() {
  return (
    <article className={styles.view}>
      <header className={styles.header}>
        <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>Not found</p>
        <h1 className="eio-type-style-title">Nothing at this path</h1>
      </header>
      <p className={[styles.lead, 'eio-type-style-body'].join(' ')}>
        Mero has no meron or group here. It may have been renamed. Pick one on the left, or go back to{' '}
        <Link className={styles.inline} href="/merons/noi">No Origins Infrastructure</Link>.
      </p>
    </article>
  )
}
