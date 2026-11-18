// hyperbase.<base>/projects/new · handing work over (agreed 12 Nov, decision 4): by talking with
// three standing agents that only read, while the brief fills in, or by writing the brief's five
// lines yourself. Then one press: signed in, no touch. A lone task is one line and a place; a
// standing order adds what starts it, and a date to renew it by. It arrives with rung 3.
// Agreed 16 Nov: a brief that is not handed over is kept as a draft, with its talk; ?draft=<id>
// opens one where it was left.
import { drafts, handingOver } from '../../mock/read'
import { HandOver } from './HandOver'

export const metadata = { title: 'Hand work over' }

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ kind?: string; said?: string; draft?: string }> }) {
  const [{ kind, said, draft }, h, kept] = await Promise.all([searchParams, handingOver(), drafts()])
  // ?said=4 opens the page with that much of the talk already had: the mock's own, for pictures.
  const turns = Math.max(0, Math.min(h.talk.length, Number(said) || 0))
  return <HandOver talk={h.talk} places={h.places} starts={h.starts} renew={h.renew} first={kind === 'order' ? 'order' : kind === 'task' ? 'task' : 'project'} turns={turns} draftId={draft} draft={kept.find(d => d.id === draft)} />
}
