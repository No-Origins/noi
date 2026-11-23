'use client'
// A new role, or a change to a role or rule, on Governance's pages (agreed 9 Nov, "Where Roles and
// Rules Live", decision 2): its name and meaning, what it says (the editor), and why. Sending it
// proposes it; nothing changes until an owner approves it in Review, with a touch. Cedar written by
// hand asks for Touch ID first, for "write Cedar", which only owners hold.
import Link from 'next/link'
import { useActionState, type ReactNode } from 'react'
import { Button, Field, TextArea } from '@noi/eio-react'
import { Message } from '../../../review/Decide'
import { Asking, useTouch } from '../../touch'
import { askWriteCedarTouch, proposeRoleOrRule } from './actions'
import styles from '../../../review/review.module.css'

/** What a change starts from: the newest version of the role or rule. None for a new role. */
export interface Changing { path: string; revision: number; name: string; definition: string; responsibility: string }

export function RoleForm({ editor, back, changing }: { editor: ReactNode; back: string; changing?: Changing }) {
  const [state, action, pending] = useActionState(proposeRoleOrRule, {})
  const { asking, failed, touch } = useTouch()
  async function submit(form: FormData) {
    if (form.get('by_hand') === '1') {
      const touched = await touch(() => askWriteCedarTouch(changing ? { path: changing.path } : { name: String(form.get('name') ?? '') }))
      if (!touched) return
      form.set('touch', touched)
    }
    action(form)
  }
  const label = (text: string) => <span className={[styles.muted, 'eio-type-style-label'].join(' ')}>{text}</span>
  return (
    <form action={submit} className={styles.form}>
      <input type="hidden" name="operation" value={changing ? 'change' : 'add'} />
      {changing && <input type="hidden" name="path" value={changing.path} />}
      {changing && <input type="hidden" name="revision" value={changing.revision} />}
      <label className={styles.row}>
        {label('Name')}
        <Field label="Name" name="name" defaultValue={changing?.name} placeholder={changing ? undefined : 'Proposer'} required />
      </label>
      <label className={styles.row}>
        {label('Definition: what it is')}
        <TextArea name="definition" rows={2} defaultValue={changing?.definition} required placeholder={changing ? undefined : 'Reading Mero and proposing changes, which wait in Review.'} />
      </label>
      <label className={styles.row}>
        {label('Responsibility: what it must do')}
        <TextArea name="responsibility" rows={2} defaultValue={changing?.responsibility} required placeholder={changing ? undefined : 'Suggest changes; never decide them.'} />
      </label>
      <div className={styles.row}>
        {label(changing ? 'What it says' : 'What it allows')}
        {editor}
      </div>
      <label className={styles.row}>
        {label('Why')}
        <Field label="Why" name="why" placeholder="What this is for. Review reads this first." required />
      </label>
      <Message state={state} />
      {asking && <Asking what={asking} />}
      {failed && <Message state={{ error: failed }} />}
      <div className={styles.buttons}>
        <Button variant="primary" icon="arrow" type="submit" disabled={pending || asking !== null}>
          {pending ? 'Checking…' : 'Send to Review'}
        </Button>
        <Link href={back} className={[styles.link, 'eio-type-style-body'].join(' ')}>Cancel</Link>
      </div>
      <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>
        Governance checks it now. Nothing changes until an owner approves it in Review; then it counts from the next request, everywhere.
      </p>
    </form>
  )
}
