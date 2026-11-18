// hyperbase.<base>/projects · the list of projects (agreed 12 Nov). It arrives with rung 3.
// Agreed 16 Nov: drafts are at the top, each with Go on and Discard; a thing asked for in a space
// is a small project, and its person sees it here.
import { drafts, projects } from '../mock/read'
import { ProjectList } from './ProjectList'

export const metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const [rows, kept] = await Promise.all([projects(), drafts()])
  return <ProjectList rows={rows} drafts={kept} />
}
