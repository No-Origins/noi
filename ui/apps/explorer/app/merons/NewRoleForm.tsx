'use client'
// A new role: its name, what it is for, one system and its verbs. Sent to Review like any change;
// only an owner can approve it (noi.gov), with a fresh touch.
import Link from 'next/link'
import { useActionState, type ReactNode } from 'react'
import { Button, Field, TextArea } from '@noi/eio-react'
import { proposeNewRole } from '../review/actions'
import { Message } from '../review/Decide'
import { useCedarTouch } from './cedar-touch'
import styles from '../review/review.module.css'

export function NewRoleForm({ editor, back }: { editor: ReactNode; back: string }) {
  const [state, action, pending] = useActionState(proposeNewRole, {})
  const { submit, said } = useCedarTouch(action, form => ({ role: String(form.get('name') ?? '') }))
  const label = (text: string) => <span className={[styles.muted, 'eio-type-style-label'].join(' ')}>{text}</span>
  return (
    <form action={submit} className={styles.form}>
      <label className={styles.row}>
        {label('Name')}
        <Field label="Name" name="name" placeholder="Proposer" required />
      </label>
      <label className={styles.row}>
        {label('Definition: what it is')}
        <TextArea name="definition" rows={2} required placeholder="Reading Mero and proposing changes, which wait in Review." />
      </label>
      <label className={styles.row}>
        {label('Responsibility: what it must do')}
        <TextArea name="responsibility" rows={2} required placeholder="Suggest changes; never decide them." />
      </label>
      <div className={styles.row}>
        {label('What it allows')}
        {editor}
      </div>
      <label className={styles.row}>
        {label('Why')}
        <Field label="Why" name="rationale" placeholder="What this role is for. Review reads this first." required />
      </label>
      <Message state={state} />
      {said}
      <div className={styles.buttons}>
        <Button variant="primary" icon="arrow" type="submit" disabled={pending}>
          {pending ? 'Checking…' : 'Send to Review'}
        </Button>
        <Link href={back} className={[styles.link, 'eio-type-style-body'].join(' ')}>Cancel</Link>
      </div>
      <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>
        Mero test-runs it now. Nothing changes until an owner approves it in Review; then Governance copies it, and it can be granted.
      </p>
    </form>
  )
}
