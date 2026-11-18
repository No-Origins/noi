// hyperbase.<base>/score · the score (agreed 12 Nov): the kept tasks' last results, by model and by
// version of the harness; never their hidden checks; and "try this change": the kept tasks with
// it, and without. It arrives with rung 2.
import { score, waiting } from '../mock/read'
import { ScoreView } from './ScoreView'

export const metadata = { title: 'Score' }

export default async function ScorePage() {
  const [s, items] = await Promise.all([score(), waiting()])
  return <ScoreView score={s} lands={items.filter(w => w.kind === 'land').map(w => w.id)} />
}
