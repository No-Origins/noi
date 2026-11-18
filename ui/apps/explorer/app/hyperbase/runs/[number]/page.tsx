// hyperbase.<base>/runs/<number> · one run, step by step (agreed 12 Nov, decision 5): its steps as
// they happen, its pass, its cost and whether it is marked; pause or stop at any step; look inside
// its computer, read only; at the end its hand-back (what a run reports when it ends) and
// Hyperbase's own checks. Rung 1.
import { run, waiting } from '../../mock/read'
import { RunView } from './RunView'

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `Run ${(await params).number}` }
}

export default async function RunPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ inside?: string }> }) {
  const number = Number((await params).number)
  const [r, items, { inside }] = await Promise.all([run(number), waiting(), searchParams])
  // ?inside opens the page with its computer already looked into: the mock's own, for pictures.
  // A run waits for one thing at a time (agreed 16 Nov): first a request, later a question.
  return <RunView number={number} run={r} waits={items.filter(w => w.run === number)} inside={inside !== undefined} />
}
