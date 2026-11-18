'use client'
// Sending a role or rule whose Cedar is written by hand (agreed 9 Nov, step 7): Touch ID first, for
// "write Cedar", which only owners hold; then the proposal goes with that touch. Cedar the form
// writes needs none.
import { askCedarTouch } from '../review/actions'
import { Asking, useTouch } from '../gov/touch'

export function useCedarTouch(send: (form: FormData) => void, of: (form: FormData) => { uid: string } | { role: string }) {
  const { asking, failed, touch } = useTouch()
  async function submit(form: FormData) {
    if (form.get('by_hand') === '1') {
      const touched = await touch(() => askCedarTouch(of(form)))
      if (!touched) return
      form.set('touch', touched)
    }
    send(form)
  }
  const said = (
    <>
      {asking && <Asking what={asking} />}
      {failed && <p className="eio-type-style-body" role="alert">{failed}</p>}
    </>
  )
  return { submit, said }
}
