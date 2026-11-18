// hyperbase.<base>/teams/<team> · one team (agreed 12 Nov): what waits for its engineer, its
// week with an undo on each change, its notes, each naming its source, its saved agents and
// skills, its dial and its set. It arrives with rung 5.
import { team } from '../../mock/read'
import { Gone } from '../../parts'
import { TeamView } from './TeamView'

export async function generateMetadata({ params }: { params: Promise<{ team: string }> }) {
  return { title: `${(await params).team} · a team` }
}

export default async function TeamPage({ params }: { params: Promise<{ team: string }> }) {
  const t = await team((await params).team)
  if (!t) return <Gone what="team" back="Every team" href="/teams" />
  return <TeamView team={t} />
}
