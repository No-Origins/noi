import { Badge, Button, Card, Icon, Panes, TreeRow } from '@noi/eio-react'
import { DesignBar } from '../../DesignBar'
import styles from '../../designs.module.css'

// mero.no-origins.com/review: approving with Touch ID. Mero says which places approving asks about;
// your touch is for exactly those, once, within a minute.
export default function Review() {
  const list = (
    <div className={styles.left}>
      <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>Signed in as Ada. Approving asks for your touch.</p>
      <div role="tree" aria-label="Waiting for you" className={styles.group}>
        <h2 className={[styles.groupName, 'eio-type-style-label'].join(' ')}>Waiting for you</h2>
        <TreeRow name="Calmer muted text" preview={<Icon name="agent" />} count={1} selected href="/designs/mero/review" />
      </div>
      <div role="tree" aria-label="Decided" className={styles.group}>
        <h2 className={[styles.groupName, 'eio-type-style-label'].join(' ')}>Decided</h2>
        <TreeRow name="Proposer role" preview={<Icon name="user" />} href="/designs/mero/review" />
        <TreeRow name="Governance roles and rules" preview={<Icon name="agent" />} href="/designs/mero/review" />
      </div>
    </div>
  )
  return (
    <>
      <DesignBar system="mero" view="Review" />
      <Panes list={list}>
        <div className={styles.right}>
          <div className={styles.head}>
            <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>Batch · from claude-code · 7 Nov, 16:10</p>
            <h1 className="eio-type-style-title">Calmer muted text</h1>
            <p className={[styles.muted, 'eio-type-style-body'].join(' ')}>1 change. Approving runs it again for real: if it fails, nothing applies.</p>
          </div>

          <Card>
            <div className={styles.touch}>
              <span className={styles.touchMark}><Icon name="fingerprint" size="large" /></span>
              <div className={styles.stack}>
                <div className={styles.head}>
                  <h2 className="eio-type-style-heading">Touch ID to approve</h2>
                  <p className="eio-type-style-body">Your touch approves this batch, and nothing else:</p>
                </div>
                <div className={styles.places}>
                  <span className="eio-type-style-mono">review · noi.eio</span>
                  <span className="eio-type-style-mono">review · noi.eio.color.text.muted</span>
                </div>
                <div className={styles.row}>
                  <Button variant="primary" size="large" icon="fingerprint">Approve</Button>
                  <Button>Cancel</Button>
                </div>
                <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>It counts once, within a minute. Mero writes Governance’s record number on every step.</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className={styles.stack}>
              <div className={styles.row}>
                <Badge>Change</Badge>
                <span className="eio-type-style-heading">Muted text</span>
                <Badge state="proposed">Waiting</Badge>
              </div>
              <p className={[styles.muted, 'eio-type-style-mono'].join(' ')}>noi.eio.color.text.muted · Token · color role</p>
              <div className={styles.change}>
                <span className={styles.pair}>
                  <span className={styles.chip} style={{ background: 'var(--eio-color-text-faint)' }} />
                  <span className="eio-type-style-body">Neutral 400</span>
                </span>
                <Icon name="arrow" />
                <span className={styles.pair}>
                  <span className={styles.chip} style={{ background: 'var(--eio-color-text-muted)' }} />
                  <span className="eio-type-style-body">Neutral 500</span>
                </span>
              </div>
              <div className={styles.row}>
                <Badge tone="success">Page surface 7.1</Badge>
                <Badge tone="success">Raised surface 6.8</Badge>
              </div>
              <div className={styles.row}>
                <Button>Send back</Button>
                <Button>Reject</Button>
                <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>Each with a note, and your touch.</span>
              </div>
            </div>
          </Card>
        </div>
      </Panes>
    </>
  )
}
