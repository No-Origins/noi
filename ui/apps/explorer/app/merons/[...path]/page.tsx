// One meron, or one group of merons, by path: /merons/noi/eio/color/text/danger.
import type { Metadata } from 'next'
import { index, snapshot } from '../../../lib/mero'
import { tree } from '../../../lib/tree'
import { MeronScreen } from '../MeronScreen'

type Props = { params: Promise<{ path: string[] }>; searchParams: Promise<{ change?: string }> }

const pathOf = (segments: string[]) => segments.map(decodeURIComponent).join('.')

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const path = pathOf((await params).path)
  const s = await snapshot()
  const node = tree(s, index(s)).find(n => n.path === path)
  return { title: node ? `${node.name} · Explorer` : 'Not found · Explorer' }
}

export default async function MeronPage({ params, searchParams }: Props) {
  const [{ path }, query] = await Promise.all([params, searchParams])
  return <MeronScreen path={pathOf(path)} change={query.change !== undefined} />
}
