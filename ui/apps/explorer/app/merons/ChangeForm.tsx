'use client'
// Change: your own edit to a meron, sent to Review as a proposal like an agent's. Nothing in Mero
// changes until it is approved there.
import Link from 'next/link'
import { useActionState, useState, type ReactNode } from 'react'
import { Button, Choices, Field, Radio, TextArea } from '@noi/eio-react'
import { proposeChange } from '../review/actions'
import { Message } from '../review/Decide'
import { useCedarTouch } from './cedar-touch'
import styles from '../review/review.module.css'

export interface Editable {
  uid: string
  revision: number
  name: string
  definition: string
  responsibility: string
  spec: string
}

/** `spec`, for a role or rule, is the editor that takes the place of the JSON box. */
export function ChangeForm({ m, back, spec }: { m: Editable; back: string; spec?: ReactNode }) {
  const [state, action, pending] = useActionState(proposeChange, {})
  const { submit, said } = useCedarTouch(action, () => ({ uid: m.uid }))
  const [breaking, setBreaking] = useState(false)
  const label = (text: string) => <span className={[styles.muted, 'eio-type-style-label'].join(' ')}>{text}</span>
  return (
    <form action={submit} className={styles.form}>
      <input type="hidden" name="uid" value={m.uid} />
      <input type="hidden" name="revision" value={m.revision} />
      <label className={styles.row}>
        {label('Name')}
        <Field label="Name" name="name" defaultValue={m.name} required />
      </label>
      <label className={styles.row}>
        {label('Definition: what it is')}
        <TextArea name="definition" rows={2} defaultValue={m.definition} required />
      </label>
      <label className={styles.row}>
        {label('Responsibility: what it must do')}
        <TextArea name="responsibility" rows={2} defaultValue={m.responsibility} required />
      </label>
      {spec ? (
        <div className={styles.row}>
          {label('What it says')}
          {spec}
        </div>
      ) : (
        <label className={styles.row}>
          {label('Spec, as JSON. Its invariants check it.')}
          <TextArea mono name="spec" rows={14} defaultValue={m.spec} />
        </label>
      )}
      <label className={styles.row}>
        {label('Why')}
        <Field label="Why" name="rationale" placeholder="What this change is for. Review reads this first." required />
      </label>
      <Choices legend="What it does to what reads it">
        <Radio name="impact" value="non-breaking" defaultChecked onChange={() => setBreaking(false)}>Nothing that reads it should break</Radio>
        <Radio name="impact" value="breaking" onChange={() => setBreaking(true)}>Something may break</Radio>
      </Choices>
      {breaking && (
        <label className={styles.row}>
          {label('Plan for what reads it')}
          <TextArea name="plan" rows={2} required />
        </label>
      )}
      <Message state={state} />
      {said}
      <div className={styles.buttons}>
        <Button variant="primary" icon="arrow" type="submit" disabled={pending}>
          {pending ? 'Checking…' : 'Send to Review'}
        </Button>
        <Link href={back} className={[styles.link, 'eio-type-style-body'].join(' ')}>Cancel</Link>
      </div>
      <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>
        Mero test-runs the change now and shows the result in Review. Nothing changes until it is approved there.
      </p>
    </form>
  )
}
