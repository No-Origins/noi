// hyperbase.<base>/projects/<name> · a project is one page (agreed 12 Nov, decision 3): its name,
// goal and state with the five ways to steer; then done means, the plan, the thread, its
// computers, what it was given and from which set, its money and its days. It arrives with rung 3.
import { project, run, waiting } from '../../mock/read'
import type { Inside } from '../../mock/types'
import { ProjectView } from './ProjectView'

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  return { title: (await project(name))?.title ?? name }
}

export default async function ProjectPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const [p, items] = await Promise.all([project(name), waiting()])
  // What "look inside" shows for each of its computers: read from the run that works in it.
  const insides: Record<number, Inside> = {}
  for (const c of p?.computers ?? []) {
    const files = c.run ? (await run(c.run))?.computer?.files : undefined
    if (c.run && files) insides[c.run] = files
  }
  return <ProjectView name={name} project={p} insides={insides} waiting={items.filter(w => w.project === name)} />
}
