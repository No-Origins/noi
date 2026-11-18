// hyperbase.<base>/runs · every run, the newest first (agreed 12 Nov). It arrives with rung 1.
import { runs } from '../mock/read'
import { RunList } from './RunList'

export const metadata = { title: 'Runs' }

export default async function RunsPage() {
  return <RunList rows={await runs()} />
}
